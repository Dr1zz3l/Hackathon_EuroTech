"""
Reddit social-listening source for the conversational assistant.

Exposes ONE function — `fetch_social_digest(...)` — used by the chat agent's
`social_listening` tool. Given a topic (a sector like "transport" or "housing"),
an audience, and an optional Hong Kong area, it pulls recent posts (and a few top
comments) from a curated set of subreddits and returns a compact, citation-ready
digest. The LLM does the sentiment scoring + recommendation synthesis from that
digest — this module only fetches and shapes the raw evidence.

Design notes
------------
* **App-only OAuth** (grant_type=client_credentials). Needs only a Reddit
  *script* app's client id + secret — NO username/password. Token is cached in
  memory until it expires.
* **Disk cache** under data/social_cache/ keyed by the query, TTL 24h. Repeat /
  demo prompts are instant and cost no Reddit quota. (data/ is gitignored.)
* **Token-frugal**: curated subreddits, capped post count, truncated bodies,
  top comments only for the top few posts.
* No new dependencies — uses httpx, which ships with the anthropic SDK.

Credentials (set in .env):
    REDDIT_CLIENT_ID       — the app id (shown under the app name at
                             https://www.reddit.com/prefs/apps)
    REDDIT_CLIENT_SECRET   — the app secret
    REDDIT_USER_AGENT      — optional; a descriptive UA string (Reddit asks for one)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, NamedTuple

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tuning knobs (kept here so they're easy to find and adjust for a demo)
# ---------------------------------------------------------------------------

MAX_POSTS = 18            # posts pulled per query (after that, noise > signal)
COMMENT_POSTS = 3         # enrich the top-N posts with their top comments
COMMENTS_PER_POST = 4
SELFTEXT_TRUNC = 600      # chars — keep the LLM context small
COMMENT_TRUNC = 300
TIME_FILTER = "year"      # relevance window: hour|day|week|month|year|all
SORT = "relevance"        # relevance|hot|top|new|comments
CACHE_TTL_SECONDS = 24 * 3600
HTTP_TIMEOUT = 12.0

_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "social_cache"

# Curated subreddits per audience. Unknown subs simply return nothing, so this
# list is safe to extend. True local Cantonese sentiment lives on LIHKG / Chinese
# platforms (not Reddit) — see the project notes; this covers the English signal.
AUDIENCE_SUBREDDITS: dict[str, list[str]] = {
    "tourist": ["HongKong", "travel", "solotravel"],
    "talent": ["HongKong", "expats", "IWantOut", "digitalnomad"],
    "citizen": ["HongKong", "hongkong"],
    "any": ["HongKong", "expats", "travel"],
}

# Territory-level area aliases — when the area is the whole city we don't prepend
# it to the search query (it would just be noise inside HK-specific subreddits).
_TERRITORY_ALIASES = {"", "hong kong", "hk", "all", "territory", "city", "hong kong sar"}

# ---------------------------------------------------------------------------
# OAuth (app-only) — token cached in-process until expiry
# ---------------------------------------------------------------------------

_token: str | None = None
_token_expiry: float = 0.0


def _user_agent() -> str:
    return os.environ.get(
        "REDDIT_USER_AGENT",
        "hk-planner-social-listening/0.1 (EuroTech hackathon)",
    )


def _get_token() -> str:
    """Return a valid app-only bearer token, fetching/refreshing as needed."""
    global _token, _token_expiry
    now = time.time()
    if _token and now < _token_expiry - 30:
        return _token

    client_id = os.environ.get("REDDIT_CLIENT_ID")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError(
            "Reddit credentials missing — set REDDIT_CLIENT_ID and "
            "REDDIT_CLIENT_SECRET in .env (create a 'script' app at "
            "https://www.reddit.com/prefs/apps)."
        )

    resp = httpx.post(
        "https://www.reddit.com/api/v1/access_token",
        auth=(client_id, client_secret),
        data={"grant_type": "client_credentials"},
        headers={"User-Agent": _user_agent()},
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    payload = resp.json()
    _token = payload["access_token"]
    _token_expiry = now + float(payload.get("expires_in", 3600))
    return _token


def _auth_headers() -> dict[str, str]:
    return {"Authorization": f"bearer {_get_token()}", "User-Agent": _user_agent()}


# ---------------------------------------------------------------------------
# Request context — OAuth if credentials are set, else public read-only JSON
# ---------------------------------------------------------------------------

class _ReqCtx(NamedTuple):
    base: str          # API host
    headers: dict[str, str]
    suffix: str        # "" for oauth, ".json" for the public endpoints
    mode: str          # "oauth" | "public"


def _request_context() -> _ReqCtx:
    """
    Choose how to talk to Reddit:

    * If REDDIT_CLIENT_ID + SECRET are set → authenticated OAuth (oauth.reddit.com),
      ~100 req/min, the supported path.
    * Otherwise → Reddit's public ``.json`` endpoints (www.reddit.com), NO
      credentials needed but lower/limited and best-effort. Lets you demo without
      creating a Reddit app; add keys later for reliability.
    """
    if os.environ.get("REDDIT_CLIENT_ID") and os.environ.get("REDDIT_CLIENT_SECRET"):
        return _ReqCtx("https://oauth.reddit.com", _auth_headers(), "", "oauth")
    return _ReqCtx("https://www.reddit.com", {"User-Agent": _user_agent()}, ".json", "public")


# ---------------------------------------------------------------------------
# Disk cache
# ---------------------------------------------------------------------------

def _cache_key(subreddits: list[str], query: str) -> str:
    raw = "|".join(sorted(subreddits)) + "::" + query.lower().strip()
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()  # noqa: S324 — cache key, not security


def _cache_read(key: str) -> dict[str, Any] | None:
    path = _CACHE_DIR / f"{key}.json"
    if not path.exists():
        return None
    try:
        blob = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if time.time() - blob.get("_cached_at", 0) > CACHE_TTL_SECONDS:
        return None
    return blob


def _cache_write(key: str, digest: dict[str, Any]) -> None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        blob = dict(digest, _cached_at=time.time())
        (_CACHE_DIR / f"{key}.json").write_text(
            json.dumps(blob, ensure_ascii=False), encoding="utf-8"
        )
    except OSError as exc:  # caching is best-effort; never fail the request on it
        logger.warning("social_cache write failed: %s", exc)


# ---------------------------------------------------------------------------
# Reddit fetch
# ---------------------------------------------------------------------------

def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip().replace("​", "")
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def _search_posts(subreddits: list[str], query: str, ctx: _ReqCtx) -> list[dict[str, Any]]:
    subs = "+".join(subreddits)
    resp = httpx.get(
        f"{ctx.base}/r/{subs}/search{ctx.suffix}",
        params={
            "q": query,
            "restrict_sr": 1,
            "sort": SORT,
            "t": TIME_FILTER,
            "limit": MAX_POSTS,
            "raw_json": 1,
        },
        headers=ctx.headers,
        follow_redirects=True,
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    children = resp.json().get("data", {}).get("children", [])
    posts: list[dict[str, Any]] = []
    for child in children:
        d = child.get("data", {})
        posts.append({
            "id": d.get("id", ""),
            "subreddit": d.get("subreddit", ""),
            "title": _truncate(d.get("title", ""), 200),
            "text": _truncate(d.get("selftext", ""), SELFTEXT_TRUNC),
            "score": int(d.get("score", 0)),
            "num_comments": int(d.get("num_comments", 0)),
            "permalink": "https://www.reddit.com" + d.get("permalink", ""),
            "top_comments": [],
        })
    return posts


def _fetch_comments(post_id: str, ctx: _ReqCtx) -> list[str]:
    resp = httpx.get(
        f"{ctx.base}/comments/{post_id}{ctx.suffix}",
        params={"limit": COMMENTS_PER_POST, "depth": 1, "sort": "top", "raw_json": 1},
        headers=ctx.headers,
        follow_redirects=True,
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    listings = resp.json()
    if len(listings) < 2:
        return []
    out: list[str] = []
    for child in listings[1].get("data", {}).get("children", []):
        if child.get("kind") != "t1":  # t1 = comment (skip "more" stubs)
            continue
        body = _truncate(child.get("data", {}).get("body", ""), COMMENT_TRUNC)
        if body:
            out.append(body)
        if len(out) >= COMMENTS_PER_POST:
            break
    return out


# ---------------------------------------------------------------------------
# Public entry point (called by the chat tool)
# ---------------------------------------------------------------------------

def fetch_social_digest(
    topic: str,
    audience: str = "any",
    area: str | None = None,
    subreddits: list[str] | None = None,
) -> dict[str, Any]:
    """
    Fetch a citation-ready Reddit digest for one (topic × audience × area).

    Returns a dict the LLM turns into a score + strengths + improvements +
    actionable steps. On any failure returns {"error": ..., "hint": ...} so the
    agent can explain the problem to the user instead of crashing the stream.
    """
    topic = (topic or "").strip()
    if not topic:
        return {"error": "Empty topic.", "hint": "Pass a sector like 'transport' or 'housing'."}

    audience = audience if audience in AUDIENCE_SUBREDDITS else "any"
    subs = subreddits or AUDIENCE_SUBREDDITS[audience]

    area_norm = (area or "").strip()
    is_territory = area_norm.lower() in _TERRITORY_ALIASES
    query = topic if is_territory else f"{area_norm} {topic}".strip()

    key = _cache_key(subs, query)
    cached = _cache_read(key)
    if cached is not None:
        return {**cached, "cached": True}

    ctx = _request_context()
    try:
        posts = _search_posts(subs, query, ctx)
        for post in posts[:COMMENT_POSTS]:
            if post["id"] and post["num_comments"] > 0:
                try:
                    post["top_comments"] = _fetch_comments(post["id"], ctx)
                except httpx.HTTPError as exc:  # comment enrichment is optional
                    logger.warning("comment fetch failed for %s: %s", post["id"], exc)
    except RuntimeError as exc:  # token fetch failed (oauth mode)
        return {
            "error": str(exc),
            "hint": "Check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET, or remove them to use the no-auth public mode.",
        }
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        if ctx.mode == "public" and code in (401, 403, 429):
            hint = ("Reddit throttled the no-auth public mode. Add REDDIT_CLIENT_ID "
                    "and REDDIT_CLIENT_SECRET to .env for reliable access.")
        else:
            hint = "Check the Reddit app credentials and that the app type is 'script'."
        return {"error": f"Reddit returned {code} ({ctx.mode} mode).", "hint": hint}
    except httpx.HTTPError as exc:
        return {"error": f"Could not reach Reddit: {exc}", "hint": "Network/timeout — try again."}

    digest = {
        "topic": topic,
        "audience": audience,
        "area": area_norm or "Hong Kong (territory-wide)",
        "subreddits": subs,
        "query": query,
        "n_posts": len(posts),
        "posts": posts,
        "source": "reddit",
        "mode": ctx.mode,
        "note": "Perceived sentiment from public Reddit posts — illustrative, not official.",
        "cached": False,
    }
    if posts:  # don't cache empty results — likely a transient/zero-match query
        _cache_write(key, digest)
    return digest
