"""
FastAPI LLM layer — three endpoints:

  POST /api/parse-goal       free-text goal → structured scenario + reallocation params
  POST /api/explain          district score context → NL prose (EN / TC)
  POST /api/summarize-plan   reallocation outcome → 2-3 sentence confirmation prose

Run:
  uv run uvicorn backend.llm.app:app --reload --port 8000

The frontend Vite dev server proxies /api → localhost:8000, so no CORS
issues in development.  CORS middleware is enabled for production
deployments where frontend and backend are on different origins.
"""

from __future__ import annotations

import asyncio
import logging
import os

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .chat import router as chat_router
from .client import get_client
from .forecast import run_forecast
from .prompts import (
    EXPLAIN_SYSTEM, PARSE_SYSTEM, PARSE_TOOL, SUMMARIZE_SYSTEM,
    _locale_desc, build_explain_user_prompt, build_summarize_user_prompt,
)
from .schemas import (
    DonorWeights, ExplainRequest, ExplainResponse,
    ForecastRequest,
    ParseGoalRequest, ParseGoalResponse,
    SummarizePlanRequest, SummarizePlanResponse,
    WeightOverrides,
)

# Load .env on startup. override=True so the .env file wins even when the
# shell injects an empty ANTHROPIC_API_KEY (common under `uv run`) — without
# it, load_dotenv would keep the empty ambient value and auth would fail.
load_dotenv(override=True)

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
    allow_methods=["POST", "OPTIONS", "GET"],
    allow_headers=["*"],
)

MODEL_FAST = "claude-haiku-4-5"    # structured extraction, short outputs
MODEL_EXPLAIN = "claude-sonnet-4-6"  # user-visible prose in the district card

# Conversational assistant (streaming /api/chat) — see backend/llm/chat.py
app.include_router(chat_router)


# ---------------------------------------------------------------------------
# POST /api/forecast — TabPFN-assisted scenario projection for one area
# ---------------------------------------------------------------------------

@app.post("/api/forecast")
async def forecast(req: ForecastRequest) -> dict:
    """
    Project a metric for one district/neighbourhood over a horizon, with
    Low/Expected/High trajectory, TabPFN future indicators, housing-derived
    numbers and rules-based recommendations. Runs off the event loop (TabPFN
    is CPU-bound). See backend/llm/forecast.run_forecast.
    """
    return await asyncio.to_thread(
        run_forecast,
        req.unit, req.granularity, req.target, req.horizon_years,
    )


# ---------------------------------------------------------------------------
# POST /api/parse-goal
# ---------------------------------------------------------------------------

@app.post("/api/parse-goal", response_model=ParseGoalResponse)
async def parse_goal(req: ParseGoalRequest) -> ParseGoalResponse:
    """
    Translate a natural-language planning goal into structured scenario
    parameters (target, goal_delta, donor_weights, cluster_strength, weight_overrides).

    The LLM is forced to call the set_scenario tool so the output is always
    structured JSON — never free text that would need regex extraction.
    """
    try:
        client = get_client()
        system = PARSE_SYSTEM.format(locale="Traditional Chinese (繁中)" if req.locale == "yue" else "English")
        response = client.messages.create(
            model=MODEL_FAST,
            max_tokens=768,
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

    dw_raw = tool_input.get("donor_weights", {})
    donor_weights = DonorWeights(
        residential=dw_raw.get("residential"),
        industrial=dw_raw.get("industrial"),
        commercial=dw_raw.get("commercial"),
        agricultural=dw_raw.get("agricultural"),
        recreational=dw_raw.get("recreational"),
        institutional=dw_raw.get("institutional"),
    )

    return ParseGoalResponse(
        target=tool_input["target"],
        goal_delta=float(tool_input.get("goal_delta", 0.10)),
        donor_weights=donor_weights,
        cluster_strength=float(tool_input.get("cluster_strength", 1.0)),
        weight_overrides=overrides,
        horizon_year=int(tool_input.get("horizon_year", 2040)),
        label=tool_input.get("label", req.text[:40]),
        rationale=tool_input.get("rationale", ""),
    )


# ---------------------------------------------------------------------------
# POST /api/summarize-plan
# ---------------------------------------------------------------------------

@app.post("/api/summarize-plan", response_model=SummarizePlanResponse)
async def summarize_plan(req: SummarizePlanRequest) -> SummarizePlanResponse:
    """
    Given the computed reallocation outcome (goal vs achieved, city-wide deltas,
    top districts), return 2–3 sentences confirming what was done and whether
    constraints held.
    """
    try:
        client = get_client()
        system = SUMMARIZE_SYSTEM.format(locale_desc=_locale_desc(req.locale))
        user_prompt = build_summarize_user_prompt(req)
        response = client.messages.create(
            model=MODEL_FAST,
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
    return SummarizePlanResponse(prose=prose)


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
            model=MODEL_EXPLAIN,
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
