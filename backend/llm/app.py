"""
FastAPI LLM layer — two endpoints:

  POST /api/parse-goal   free-text goal → {target, weight_overrides, …}
  POST /api/explain      district score context → NL prose (EN / TC)

Run:
  uv run uvicorn backend.llm.app:app --reload --port 8000

The frontend Vite dev server proxies /api → localhost:8000, so no CORS
issues in development.  CORS middleware is enabled for production
deployments where frontend and backend are on different origins.
"""

from __future__ import annotations

import logging
import os

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .client import get_client
from .prompts import EXPLAIN_SYSTEM, PARSE_SYSTEM, PARSE_TOOL, _locale_desc, build_explain_user_prompt
from .schemas import ExplainRequest, ExplainResponse, ParseGoalRequest, ParseGoalResponse, WeightOverrides

# Load .env on startup (no-op if already set via real environment)
load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(
    title="HK District Viability — LLM Layer",
    description="Translates free-text planning goals and generates score explanations.",
    version="1.0.0",
)

# Allow the static frontend (any origin) to call these endpoints.
# For production, restrict allow_origins to the actual frontend URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

MODEL = "claude-haiku-4-5"


# ---------------------------------------------------------------------------
# POST /api/parse-goal
# ---------------------------------------------------------------------------

@app.post("/api/parse-goal", response_model=ParseGoalResponse)
async def parse_goal(req: ParseGoalRequest) -> ParseGoalResponse:
    """
    Translate a natural-language planning goal into structured scenario
    parameters (target land-use + weight overrides) for the WLC scorer.

    The LLM is forced to call the set_scenario tool so the output is always
    structured JSON — never free text that would need regex extraction.
    """
    try:
        client = get_client()
        system = PARSE_SYSTEM.format(locale="Traditional Chinese (繁中)" if req.locale == "yue" else "English")
        response = client.messages.create(
            model=MODEL,
            max_tokens=512,
            system=system,
            messages=[{"role": "user", "content": req.text}],
            tools=[PARSE_TOOL],
            tool_choice={"type": "tool", "name": "set_scenario"},
        )
    except anthropic.AuthenticationError:
        logger.error("Anthropic authentication failed — check ANTHROPIC_API_KEY")
        raise HTTPException(status_code=502, detail="LLM service unavailable")
    except anthropic.APIError as exc:
        logger.error("Anthropic API error: %s", exc)
        raise HTTPException(status_code=502, detail="LLM service unavailable")

    # Extract the tool-call input block
    tool_input: dict | None = None
    for block in response.content:
        if block.type == "tool_use" and block.name == "set_scenario":
            tool_input = block.input
            break

    if tool_input is None:
        logger.error("Model did not call set_scenario tool. Content: %s", response.content)
        raise HTTPException(status_code=502, detail="LLM service returned unexpected output")

    # Build the response — Pydantic validates types
    overrides_raw = tool_input.get("weight_overrides", {})
    overrides = WeightOverrides(
        displacement=overrides_raw.get("displacement"),
        age=overrides_raw.get("age"),
        headroom=overrides_raw.get("headroom"),
        area=overrides_raw.get("area"),
        renewal=overrides_raw.get("renewal"),
    )

    return ParseGoalResponse(
        target=tool_input["target"],
        weight_overrides=overrides,
        horizon_year=int(tool_input.get("horizon_year", 2040)),
        label=tool_input.get("label", req.text[:40]),
        rationale=tool_input.get("rationale", ""),
    )


# ---------------------------------------------------------------------------
# POST /api/explain
# ---------------------------------------------------------------------------

@app.post("/api/explain", response_model=ExplainResponse)
async def explain(req: ExplainRequest) -> ExplainResponse:
    """
    Given a district's score context, return 2–3 sentences of natural-language
    prose explaining the viability score in the requested locale.
    """
    try:
        client = get_client()
        system = EXPLAIN_SYSTEM.format(locale_desc=_locale_desc(req.locale))
        user_prompt = build_explain_user_prompt(req)
        response = client.messages.create(
            model=MODEL,
            max_tokens=300,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
    except anthropic.AuthenticationError:
        logger.error("Anthropic authentication failed — check ANTHROPIC_API_KEY")
        raise HTTPException(status_code=502, detail="LLM service unavailable")
    except anthropic.APIError as exc:
        logger.error("Anthropic API error: %s", exc)
        raise HTTPException(status_code=502, detail="LLM service unavailable")

    prose = response.content[0].text.strip() if response.content else ""
    return ExplainResponse(prose=prose)


# ---------------------------------------------------------------------------
# Health-check (optional but useful for Netlify/Vercel function ping)
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health() -> dict:
    key_set = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {"ok": True, "key_configured": key_set}
