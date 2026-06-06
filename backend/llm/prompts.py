"""
System prompts and helper builders for the two LLM endpoints.

parse-goal  → forced tool call → structured JSON weight overrides
explain     → free-text prose (EN or Traditional Chinese)
"""

from __future__ import annotations

from .schemas import ExplainRequest

# ---------------------------------------------------------------------------
# parse-goal — tool definition (forced tool call gives reliable JSON)
# ---------------------------------------------------------------------------

PARSE_TOOL: dict = {
    "name": "set_scenario",
    "description": (
        "Set the planning scenario parameters based on the user's natural-language "
        "planning goal for Hong Kong districts."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "target": {
                "type": "string",
                "enum": ["residential", "industrial", "commercial", "green", "educational"],
                "description": "Which land-use category is the primary planning target.",
            },
            "weight_overrides": {
                "type": "object",
                "description": (
                    "Relative importance weights (all ≥ 0; scorer normalises to sum=1). "
                    "Only include keys where you want to emphasise or de-emphasise the default. "
                    "Valid keys: displacement, age, headroom, area, renewal."
                ),
                "properties": {
                    "displacement": {"type": "number", "minimum": 0},
                    "age":          {"type": "number", "minimum": 0},
                    "headroom":     {"type": "number", "minimum": 0},
                    "area":         {"type": "number", "minimum": 0},
                    "renewal":      {"type": "number", "minimum": 0},
                },
                "additionalProperties": False,
            },
            "horizon_year": {
                "type": "integer",
                "minimum": 2025,
                "maximum": 2100,
                "description": "Target completion year implied by the goal (default 2040 if unspecified).",
            },
            "label": {
                "type": "string",
                "description": (
                    "A concise 2–5 word title for the goal, in the user's locale "
                    "(English if locale='en', Traditional Chinese if locale='yue')."
                ),
            },
            "rationale": {
                "type": "string",
                "description": "One sentence explaining why you chose this target and weight emphasis.",
            },
        },
        "required": ["target", "weight_overrides", "horizon_year", "label", "rationale"],
    },
}

# ---------------------------------------------------------------------------
# parse-goal — system prompt
# ---------------------------------------------------------------------------

PARSE_SYSTEM = """\
You are a planning assistant for an interactive Hong Kong district viability map.
Your job is to translate a natural-language city-planning goal into structured
parameters for a Weighted Linear Combination (WLC) scoring model.

## WLC model terms
The scorer has four (optionally five) weighted terms per district:

| Key          | Meaning |
|--------------|---------|
| displacement | Prefers low population density — less disruption to existing residents |
| age          | Weights districts with a higher share of residents aged 65+ (more displacement-sensitive) |
| headroom     | Prefers districts with more convertible land AND less of the target type already present |
| area         | Prefers larger districts for greater aggregate impact |
| renewal      | Weights districts with more ageing building stock (use only for renewal goals) |

## Land-use targets
Pick exactly one: residential, industrial, commercial, green, educational.

## Rules
- Output ONLY via the set_scenario tool — never rank or score districts yourself.
- Base weight_overrides on relative emphasis (values in 0–1 range); the scorer normalises them.
- If the goal mentions reducing displacement, raise displacement. If it mentions speed / scale, raise area and headroom.
- Never invent district-specific data.
- If the goal is ambiguous, map it to the closest land target with balanced weights.
- The label must be in {locale} (Traditional Chinese if yue, English if en).
"""

# ---------------------------------------------------------------------------
# explain — system prompt
# ---------------------------------------------------------------------------

EXPLAIN_SYSTEM = """\
You are a city-planning assistant generating a brief, factual explanation of why
a Hong Kong district received a particular viability score for a planning scenario.

Rules:
- Write exactly 2–3 sentences.
- Base every claim strictly on the provided district data and score terms — do not invent statistics.
- Never describe the score as "official", "authoritative", or a "government assessment".
- If land_source is "estimated", use hedged language (e.g. "based on estimated land data").
- Do not use markdown headers, bullet points, or lists — output flowing prose only.
- Respond in {locale_desc}.
"""


def _locale_desc(locale: str) -> str:
    return "Traditional Chinese (繁體中文)" if locale == "yue" else "English"


def build_explain_user_prompt(req: ExplainRequest) -> str:
    """Construct the user message for the explain endpoint."""
    d = req.district
    s = req.scenario
    district_name = d.name_tc if req.locale == "yue" else d.name

    land_lines = "\n".join(
        f"  {k}: {v:.1%}" for k, v in req.district.land.model_dump().items()
    )
    term_lines = "\n".join(
        f"  {t.key}: {t.display_value} (contribution {t.contribution:.2f})"
        for t in req.terms
    )

    return f"""\
District: {district_name}
Population: {d.pop:,}  |  Density: {d.density:,.0f}/km²  |  Area: {d.area_km2:.1f} km²
Aged 65+: {d.pct_over65:.1f}%
Land use ({d.land_source}):
{land_lines}

Scenario: {s.label} — target: {s.target}, horizon: {s.horizon_year}
Viability score: {req.score:.2f} / 1.00

Score term breakdown (key: display_value, contribution):
{term_lines}

Write a {2}–{3} sentence explanation of why this district scored {req.score:.2f}.
"""
