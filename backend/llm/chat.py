"""
Conversational assistant — streaming /api/chat endpoint.

A multi-turn agentic loop over Claude (Sonnet) with four tools:

  Client-effect tools (executed by the FRONTEND, not here):
    - highlight_map(districts[], color?, label?)  → recolour/outline polygons
    - zoom_to(district)                           → fly the camera to a district

  Server-executed tools (resolved here from in-memory geodata):
    - query_district(name)                        → full property record
    - rank_districts(metric, order, limit)        → sorted top-N

Transport: Server-Sent Events. Each `data:` line is a JSON object:
    {"type": "text",        "text": "..."}        incremental assistant prose
    {"type": "map_command", "name": "...", "input": {...}}   frontend executes
    {"type": "tool",        "name": "...", "status": "running|done"}  (UI hint)
    {"type": "error",       "message": "..."}
    {"type": "done"}

The map-control tools have no server-side effect — we emit them to the client
and hand Claude a synthetic `{"ok": true}` tool_result so the loop continues.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

import anthropic
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from .client import get_async_client
from .data import (
    DISTRICT_NAMES,
    NEIGHBOURHOODS,
    field_catalogue_text,
    list_neighbourhoods,
    query_district,
    rank_districts,
)
from .forecast import run_forecast
from .predict import tabpfn_predict
from .schemas import ChatRequest
from .social import AUDIENCE_SUBREDDITS, fetch_social_digest

logger = logging.getLogger(__name__)

router = APIRouter()

# Sonnet by default; override with CHAT_MODEL if a different alias is preferred.
CHAT_MODEL = os.environ.get("CHAT_MODEL", "claude-sonnet-4-6")

# Cap the agentic loop so a misbehaving model can't spin forever.
MAX_TURNS = 6
MAX_TOKENS = 1024

# Tools whose execution is a frontend effect (no server-side work).
CLIENT_TOOLS = {"highlight_map", "zoom_to", "add_layer", "remove_layer"}


# ---------------------------------------------------------------------------
# Tool definitions (Anthropic tool-use schema)
# ---------------------------------------------------------------------------

TOOLS: list[dict] = [
    {
        "name": "highlight_map",
        "description": (
            "Visually highlight one or more Hong Kong districts on the map "
            "(coloured outline + raised fill) to draw the user's attention. "
            "Use this whenever you reference specific districts in your answer "
            "so the user can see them. Pass an empty list to clear all highlights."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "districts": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Exact district names to highlight (empty = clear).",
                },
                "color": {
                    "type": "string",
                    "description": "Optional hex colour for the highlight, e.g. '#0070f3' (blue), '#ff0080' (pink), '#f5a623' (amber). Defaults to blue.",
                },
                "label": {
                    "type": "string",
                    "description": "Optional short caption describing why these are highlighted.",
                },
            },
            "required": ["districts"],
        },
    },
    {
        "name": "zoom_to",
        "description": (
            "Fly the map camera to fit a single district, or pass 'all' to "
            "zoom back out to the whole of Hong Kong."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "district": {
                    "type": "string",
                    "description": "Exact district name, or 'all' to reset to the full territory.",
                },
            },
            "required": ["district"],
        },
    },
    {
        "name": "add_layer",
        "description": (
            "Create an extra analytical map layer that visualises ONE metric "
            "across the whole city. Use this whenever the user asks to 'show', "
            "'map', 'visualise', or 'heatmap' a metric — e.g. 'heatmap of the "
            "most densely populated areas', 'map the elderly share', 'bubble "
            "map of population by area'. Three layer types:\n"
            "  - 'heatmap': a smooth intensity surface highlighting hotspots — "
            "best for density / concentration questions. Defaults to the finer "
            "neighbourhood resolution.\n"
            "  - 'choropleth': recolours every area by the metric with a "
            "graduated heat ramp (faithful to the polygon boundaries).\n"
            "  - 'bubble': proportional circles sized by the metric — best for "
            "absolute totals like population.\n"
            "The layer is drawn on top of the map and listed in the Layers "
            "panel, where the user can toggle or delete it. Briefly tell the "
            "user you've added it and what it shows. You can add several layers."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["heatmap", "choropleth", "bubble"],
                    "description": "The visualisation style (see tool description).",
                },
                "metric": {
                    "type": "string",
                    "description": (
                        "Metric to visualise. One of: pop, density, pct_over65, "
                        "median_age, area_km2, ageing_building_share (district "
                        "level only), land.residential, land.industrial, land.commercial, "
                        "land.agricultural, land.recreational, land.institutional, "
                        "land.misc, land.infrastructure, land.protected."
                    ),
                },
                "granularity": {
                    "type": "string",
                    "enum": ["district", "neighbourhood"],
                    "description": "'district' (18 units) or 'neighbourhood' (211 STPU units). Heatmaps look best at neighbourhood resolution.",
                },
                "label": {
                    "type": "string",
                    "description": "Optional short title for the layer, e.g. 'Density hotspots'.",
                },
                "color": {
                    "type": "string",
                    "description": "Optional hex accent colour (mainly for bubble layers), e.g. '#0070f3'.",
                },
            },
            "required": ["type", "metric"],
        },
    },
    {
        "name": "remove_layer",
        "description": (
            "Remove analytical layers previously added with add_layer. Pass "
            "all=true to clear every dynamic layer, or a label to remove one."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "description": "Label of the layer to remove."},
                "all": {"type": "boolean", "description": "If true, remove all dynamic layers."},
            },
        },
    },
    {
        "name": "query_district",
        "description": (
            "Look up the full factual record for one district OR one STPU "
            "neighbourhood: population, density, % aged 65+, median age, area, "
            "and land-use breakdown (districts also have ageing-building share). "
            "ALWAYS use this instead of guessing numbers. For a neighbourhood, "
            "set granularity='neighbourhood' and pass its exact coded name "
            "(e.g. 'Sham Shui Po · 255'), which you can get from "
            "list_neighbourhoods or rank_districts."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Exact district or neighbourhood name."},
                "granularity": {
                    "type": "string",
                    "enum": ["district", "neighbourhood"],
                    "description": "'district' (default, 18 units) or 'neighbourhood' (211 STPU units).",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "rank_districts",
        "description": (
            "Rank units by a metric and return the top results — use for "
            "superlative questions ('which has the oldest population / most "
            "green space / highest density'). Works at two levels: across all "
            "18 districts (granularity='district', default), or across the 211 "
            "STPU neighbourhoods (granularity='neighbourhood'). To rank "
            "neighbourhoods inside ONE district, also pass parent_district."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "description": "Metric to sort by. One of the valid metric keys (e.g. 'median_age', 'density', 'ageing_building_share', 'land.recreational'). Note: ageing_building_share exists only at district level.",
                },
                "order": {
                    "type": "string",
                    "enum": ["desc", "asc"],
                    "description": "'desc' = largest first (default), 'asc' = smallest first.",
                },
                "limit": {
                    "type": "integer",
                    "description": "How many to return (default 5).",
                },
                "granularity": {
                    "type": "string",
                    "enum": ["district", "neighbourhood"],
                    "description": "'district' (18 units, default) or 'neighbourhood' (211 STPU units).",
                },
                "parent_district": {
                    "type": "string",
                    "description": "Only with granularity='neighbourhood': restrict the ranking to STPU units inside this one district (e.g. 'Kwun Tong').",
                },
            },
            "required": ["metric"],
        },
    },
    {
        "name": "list_neighbourhoods",
        "description": (
            "List the STPU neighbourhood units inside one district, with their "
            "coded names and key stats. Use this to discover the exact "
            "neighbourhood names (e.g. 'Kwun Tong · 410') before querying or "
            "highlighting them."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "parent_district": {
                    "type": "string",
                    "description": "Exact district name whose neighbourhoods to list (e.g. 'Sham Shui Po').",
                },
            },
            "required": ["parent_district"],
        },
    },
    {
        "name": "tabpfn_predict",
        "description": (
            "Predict a numeric metric for districts or neighbourhoods using "
            "TabPFN, PriorLabs' tabular foundation model. Use this whenever the "
            "user asks to 'predict', 'estimate', 'forecast', 'model', or get the "
            "'expected' value of a data point (e.g. predicted average age, "
            "expected density, modelled elderly share). Two modes:\n"
            "  - Pass `units` (specific district/neighbourhood names) to get a "
            "predicted value for each, trained on all the OTHER areas — returns "
            "predicted vs actual.\n"
            "  - Omit `units` to model the whole set (out-of-sample) and surface "
            "the areas that diverge MOST from their predicted profile — i.e. "
            "areas that over- or under-perform what their attributes suggest.\n"
            "Optional `whatif`: multiply input features (e.g. {'density': 1.2} = "
            "+20%) to see how the predicted target would shift.\n"
            "IMPORTANT: the data is a single 2021 census snapshot with NO time "
            "series, so this is a cross-sectional estimate, NOT a temporal "
            "forecast. For population-GROWTH questions, say this, then predict "
            "the age structure (median_age or pct_over65) as a renewal/growth "
            "proxy, or use whatif to show sensitivity. After predicting you may "
            "highlight the notable areas with highlight_map."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "description": (
                        "Metric to predict. One of: pop, density, pct_over65, "
                        "median_age, area_km2, ageing_building_share (district "
                        "level only), land.residential, land.industrial, land.commercial, "
                        "land.agricultural, land.recreational, land.institutional, "
                        "land.misc, land.infrastructure, land.protected."
                    ),
                },
                "granularity": {
                    "type": "string",
                    "enum": ["district", "neighbourhood"],
                    "description": "'district' (18 units) or 'neighbourhood' (211 STPU units, default).",
                },
                "units": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional: specific area names to predict (predicted vs actual). Omit to model the whole set.",
                },
                "whatif": {
                    "type": "object",
                    "description": "Optional feature→multiplier overrides, e.g. {'density': 1.2}. Only used with `units`.",
                    "additionalProperties": {"type": "number"},
                },
            },
            "required": ["target"],
        },
    },
    {
        "name": "social_listening",
        "description": (
            "Pull recent real opinions from Reddit to gauge how a SECTOR is "
            "perceived — and how it could be improved — for a given audience. "
            "Use this for any 'what do people think', 'sentiment', 'reviews', "
            "'how can we improve X for tourists/expats/talent', 'what's good / "
            "bad about Y' question. It searches a curated set of subreddits "
            "(chosen by audience), returns posts + top comments with permalinks. "
            "From that digest YOU produce: a 0–100 score, what's already good, "
            "what to improve, and numbered actionable steps — each grounded in "
            "the posts. This is perceived sentiment, NOT official data; say so. "
            "If it returns an 'error' field, relay the hint to the user."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": (
                        "The sector / theme to listen on, e.g. 'transport', "
                        "'housing rent', 'nightlife', 'safety', 'visa immigration', "
                        "'English friendliness', 'job market', 'healthcare'."
                    ),
                },
                "audience": {
                    "type": "string",
                    "enum": ["tourist", "talent", "citizen", "any"],
                    "description": (
                        "Whose perspective: 'tourist' (visitors), 'talent' "
                        "(expats / foreign professionals relocating), 'citizen' "
                        "(residents), or 'any'. Picks which subreddits to search."
                    ),
                },
                "area": {
                    "type": "string",
                    "description": (
                        "Optional Hong Kong district or neighbourhood to focus on "
                        "(e.g. 'Sham Shui Po'). Omit for territory-wide sentiment."
                    ),
                },
            },
            "required": ["topic"],
        },
    },
    {
        "name": "show_forecast",
        "description": (
            "Project ONE area's metric over MULTIPLE YEARS and open the Forecast "
            "panel (a chart with Low/Expected/High trajectory, TabPFN-predicted "
            "future indicators, and planning recommendations/warnings). Use this "
            "for multi-year / over-time questions about a SPECIFIC district or "
            "neighbourhood — e.g. 'population of Sha Tin in the next 10 years', "
            "'how will Kwun Tong change by 2035', 'forecast the elderly share of "
            "this area'. It returns the projected numbers and recommendations for "
            "you to summarise in chat (and the panel shows the chart). "
            "Use `tabpfn_predict` instead for present-day estimates or anomalies "
            "across many areas. The projection is a scenario estimate from the "
            "2021 snapshot, not a measured trend — say so."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "unit": {
                    "type": "string",
                    "description": "Exact district or neighbourhood name to forecast.",
                },
                "granularity": {
                    "type": "string",
                    "enum": ["district", "neighbourhood"],
                    "description": "'district' (default) or 'neighbourhood'.",
                },
                "target": {
                    "type": "string",
                    "description": (
                        "Metric to project: pop (default), median_age, pct_over65, "
                        "density, or a land.* share."
                    ),
                },
                "horizon_years": {
                    "type": "integer",
                    "description": "Years ahead to project (default 10; 1–30).",
                },
            },
            "required": ["unit"],
        },
    },
]


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

def _system_prompt(locale: str) -> str:
    lang = "Traditional Chinese (繁體中文)" if locale == "yue" else "English"
    names = ", ".join(DISTRICT_NAMES)
    n_nbhd = len(NEIGHBOURHOODS)
    audiences = ", ".join(AUDIENCE_SUBREDDITS.keys())
    return f"""\
You are the map assistant for an interactive Hong Kong urban-planning tool. \
You help city planners explore the 18 districts of Hong Kong, answer questions \
about the data, and control the map to illustrate your answers.

## The map — two levels of detail
The data exists at TWO geographic granularities:
- **District** (18 units): {names}.
- **Neighbourhood / STPU** ({n_nbhd} units): finer Small Tertiary Planning \
Units nested inside districts. Their names are coded as "<District> · <code>" \
(e.g. "Kwun Tong · 410"). You cannot guess these — discover them with \
`list_neighbourhoods(district)` or `rank_districts(granularity='neighbourhood')`.

Choose the level the user asks for. "Which district…" → district level. \
"Which neighbourhood / area / part of <District>…", or any request for finer / \
block-level / within-district detail → neighbourhood level (set \
granularity='neighbourhood', and parent_district when scoped to one district).

When you mention specific places, call `highlight_map` so the user can see them \
(district OR neighbourhood names both work), and `zoom_to` when focusing on one. \
Use `highlight_map` with an empty list to clear highlights when changing topic.

## Creating map layers
When the user asks to "show", "map", "visualise", or "heatmap" a metric across \
the city (rather than asking about one place), call `add_layer` to drop an \
analytical overlay. Pick the layer type that fits the question: `heatmap` for \
density / hotspot questions ("where are the most crowded areas?"), `choropleth` \
to shade every area by a metric, `bubble` for absolute totals like population. \
Prefer neighbourhood granularity for heatmaps. After adding a layer, say one \
line about what it shows; the user can toggle or delete it in the Layers panel. \
Use `remove_layer` (all=true) to clear overlays when the user is done with them. \
For superlative questions you can BOTH add a layer and highlight the top units.

## Predictions (TabPFN foundation model)
Call `tabpfn_predict` for "predict / estimate / forecast / expected / model" \
questions about a numeric metric — e.g. "predict the average age of this area", \
"which neighbourhoods are richer/poorer than expected", "estimate density". It \
runs PriorLabs' TabPFN model on the area attributes and returns out-of-sample \
predicted-vs-actual values (and, for whole-set runs, the areas diverging most \
from their predicted profile). The data is a single 2021 snapshot with NO time \
series, so always frame results as cross-sectional model estimates, not \
temporal forecasts. For population-GROWTH questions, state this caveat, then \
predict the age structure (median_age / pct_over65) as a renewal/growth proxy, \
or use the what-if mode to show sensitivity. After predicting, highlight the \
notable areas with highlight_map so the user can see them.

## Multi-year forecasts (Forecast panel)
For a projection of ONE specific area over several years — e.g. "population of \
Sha Tin in the next 10 years", "how will Kwun Tong change by 2035", "forecast \
this neighbourhood's elderly share" — call `show_forecast` with the area, a \
target metric (default pop) and a horizon. It opens the Forecast panel (a chart \
with Low/Expected/High bands plus recommendations) AND returns the projected \
numbers; summarise them in chat — the headline change, and the key warning (e.g. \
housing supply) if one is flagged. It is a scenario estimate from the 2021 \
snapshot, not a measured trend — say so briefly. Use `tabpfn_predict` (not this) \
for present-day cross-sectional estimates or anomalies across many areas.

## Social listening (Reddit sentiment)
Call `social_listening` when the user asks how something is *perceived* or how a \
sector could be *improved* for a group — e.g. "how can transport be better for \
tourists?", "what do expats think about housing here?", "what's good and bad \
about nightlife in Wan Chai?". Pick the audience ({audiences}); pass an `area` \
only if the question is about a specific district. The tool returns real Reddit \
posts + top comments with permalinks; from that digest YOU build the answer:
- **Score: NN/100** for the (sector, audience) — higher = better sentiment. \
Base it on the balance of positive vs negative posts, weighted by upvotes; if \
evidence is thin, say "low confidence" and don't over-claim.
- **What's already good** — 2–4 short points drawn from positive posts.
- **What to improve** — 2–4 short points drawn from complaints.
- **Actionable steps** — a numbered list (2–4) of concrete moves a city/agency \
could take, each tied to the pain points above. End by telling the user they can \
ask you to expand any step into detail.
- Attribute lightly (e.g. "several r/HongKong posts mention…") and state once \
that this is perceived sentiment from Reddit, not official data. If the tool \
returns an `error`, relay its `hint` and suggest the user add Reddit credentials.

## Data you can rely on
Each unit has exactly these fields — never invent others:
{field_catalogue_text()}

Note: ageing_building_share exists only at district level (not per STPU). \
Always call `query_district`, `rank_districts`, or `list_neighbourhoods` to get \
real numbers — never state a statistic from memory. If asked about something \
not in the data (e.g. crime, transit times, exact building ages), say it isn't \
in this dataset and offer the closest available proxy.

## Style
- Be concise and concrete — this is a narrow chat panel, not a report.
- Lead with the answer, then a one-line "why" grounded in the data.
- Plain prose only. Do NOT use markdown tables, headings, or bold — the panel
  renders raw text. A short '-' bullet list is fine; keep numbers inline
  (e.g. "Wong Tai Sin (50.1), Eastern (49.0)").
- Note provenance when relevant: land_source 'estimated' means modelled, not measured.
- Never call the figures "official" — this is an illustrative decision-support tool.
- Respond in {lang}.
"""


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _execute_server_tool(name: str, tool_input: dict) -> dict:
    """Run a data tool and return a JSON-serialisable result."""
    try:
        if name == "query_district":
            return query_district(
                str(tool_input.get("name", "")),
                granularity=str(tool_input.get("granularity", "district")),
            )
        if name == "rank_districts":
            parent = tool_input.get("parent_district")
            return rank_districts(
                metric=str(tool_input.get("metric", "")),
                order=str(tool_input.get("order", "desc")),
                limit=int(tool_input.get("limit", 5)),
                granularity=str(tool_input.get("granularity", "district")),
                parent_district=str(parent) if parent else None,
            )
        if name == "list_neighbourhoods":
            return list_neighbourhoods(str(tool_input.get("parent_district", "")))
        if name == "tabpfn_predict":
            units = tool_input.get("units")
            whatif = tool_input.get("whatif")
            return tabpfn_predict(
                target=str(tool_input.get("target", "")),
                granularity=str(tool_input.get("granularity", "neighbourhood")),
                units=list(units) if isinstance(units, list) else None,
                whatif=dict(whatif) if isinstance(whatif, dict) else None,
            )
        if name == "social_listening":
            area = tool_input.get("area")
            return fetch_social_digest(
                topic=str(tool_input.get("topic", "")),
                audience=str(tool_input.get("audience", "any")),
                area=str(area) if area else None,
            )
        if name == "show_forecast":
            return run_forecast(
                unit=str(tool_input.get("unit", "")),
                granularity=str(tool_input.get("granularity", "district")),
                target=str(tool_input.get("target", "pop")),
                horizon_years=int(tool_input.get("horizon_years", 10)),
            )
    except Exception as exc:  # noqa: BLE001 — tool errors must not crash the stream
        logger.exception("Tool %s failed", name)
        return {"error": f"Tool execution failed: {exc}"}
    return {"error": f"Unknown tool '{name}'."}


# ---------------------------------------------------------------------------
# The streaming agentic loop
# ---------------------------------------------------------------------------

async def _event_stream(req: ChatRequest):
    client = get_async_client()
    system = _system_prompt(req.locale)

    # Seed the conversation with the plain-text history from the client.
    messages: list[dict] = [
        {"role": m.role, "content": m.content} for m in req.messages
    ]

    try:
        for _turn in range(MAX_TURNS):
            assistant_content: list = []

            async with client.messages.stream(
                model=CHAT_MODEL,
                max_tokens=MAX_TOKENS,
                system=system,
                tools=TOOLS,
                messages=messages,
            ) as stream:
                # Stream prose deltas to the client as they arrive.
                async for text in stream.text_stream:
                    yield _sse({"type": "text", "text": text})
                final = await stream.get_final_message()

            assistant_content = final.content
            messages.append({"role": "assistant", "content": assistant_content})

            tool_uses = [b for b in assistant_content if b.type == "tool_use"]
            if not tool_uses:
                break  # end_turn — the assistant is done talking

            # Resolve every tool call, then loop so Claude can continue.
            tool_results: list[dict] = []
            for tu in tool_uses:
                tool_input = tu.input if isinstance(tu.input, dict) else {}
                if tu.name in CLIENT_TOOLS:
                    # Frontend effect — emit the command, ack to the model.
                    yield _sse({"type": "map_command", "name": tu.name, "input": tool_input})
                    result: dict = {"ok": True, "executed_on": "client"}
                else:
                    yield _sse({"type": "tool", "name": tu.name, "status": "running"})
                    # TabPFN inference is CPU-bound (torch); social_listening does
                    # blocking network I/O; forecast runs TabPFN — run them off the
                    # event loop so streaming for other clients isn't blocked.
                    if tu.name in ("tabpfn_predict", "social_listening", "show_forecast"):
                        result = await asyncio.to_thread(_execute_server_tool, tu.name, tool_input)
                    else:
                        result = _execute_server_tool(tu.name, tool_input)
                    yield _sse({"type": "tool", "name": tu.name, "status": "done"})
                    # show_forecast is server-executed (so the model can narrate the
                    # numbers) AND opens the Forecast panel on the client.
                    if tu.name == "show_forecast" and "error" not in result:
                        yield _sse({"type": "map_command", "name": "show_forecast", "input": {
                            "unit": result.get("unit", tool_input.get("unit", "")),
                            "granularity": result.get("granularity", "district"),
                            "target": result.get("target", "pop"),
                            "horizon_years": result.get("horizon_years", 10),
                        }})

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })

            messages.append({"role": "user", "content": tool_results})

        yield _sse({"type": "done"})

    except anthropic.AuthenticationError:
        logger.error("Anthropic authentication failed — check ANTHROPIC_API_KEY")
        yield _sse({"type": "error", "message": "auth"})
        yield _sse({"type": "done"})
    except anthropic.APIError as exc:
        logger.error("Anthropic API error: %s", exc)
        yield _sse({"type": "error", "message": "api"})
        yield _sse({"type": "done"})
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected chat error")
        yield _sse({"type": "error", "message": str(exc)[:200]})
        yield _sse({"type": "done"})


@router.post("/api/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    """Streaming conversational endpoint. See module docstring for the protocol."""
    return StreamingResponse(
        _event_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable proxy buffering (nginx / dev proxies)
        },
    )
