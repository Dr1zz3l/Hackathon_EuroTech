"""
System prompts and helper builders for the LLM endpoints.

parse-goal      → forced tool call → structured JSON scenario params + reallocation config
explain         → free-text prose (EN or Traditional Chinese)
summarize-plan  → short prose confirming what the reallocation achieved
"""

from __future__ import annotations

from .schemas import ExplainRequest, SummarizePlanRequest

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
            "goal_delta": {
                "type": "number",
                "minimum": 0.01,
                "maximum": 1.0,
                "description": (
                    "City-wide growth target as a fraction of the *current* total area in the "
                    "target category. E.g. 0.10 = add 10% more of whatever exists today. "
                    "Extract from the user's text ('10% more' → 0.10, '20% increase' → 0.20). "
                    "Default 0.10 if the user gives no magnitude."
                ),
            },
            "donor_weights": {
                "type": "object",
                "description": (
                    "Controls which land-use categories donate land to the target. "
                    "Values: 1.0 = neutral (donate proportionally to current area), "
                    "2.0 = strongly preferred donor, "
                    "0.0–0.4 = de-emphasised, 0.0 = fully protected (never shrinks). "
                    "Only include keys where you want to override the default (1.0). "
                    "The target category and 'other' (transport/water) are never donors regardless. "
                    "Examples: 'primarily from residential' → {residential: 2.0}; "
                    "'no green harmed' → {green: 0.0}; "
                    "'only trade industrial' → {industrial: 2.0, residential: 0.0, commercial: 0.0, educational: 0.0}."
                ),
                "properties": {
                    "residential": {"type": "number", "minimum": 0},
                    "industrial":  {"type": "number", "minimum": 0},
                    "commercial":  {"type": "number", "minimum": 0},
                    "green":       {"type": "number", "minimum": 0},
                    "educational": {"type": "number", "minimum": 0},
                },
                "additionalProperties": False,
            },
            "cluster_strength": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 3.0,
                "description": (
                    "Agglomeration strength (μ): how strongly to concentrate additions "
                    "near districts already rich in the target or adjacent to them. "
                    "0 = spread evenly, 1.5 = strong clustering (green corridors / "
                    "educational clusters), 0.8 = moderate (industrial parks). Default 1.0."
                ),
            },
            "weight_overrides": {
                "type": "object",
                "description": (
                    "Relative importance weights for the viability scorer (all ≥ 0; normalised to sum=1). "
                    "Only include keys where you want to emphasise or de-emphasise. "
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
                "description": "One sentence explaining why you chose this target, goal_delta, and donor_weights.",
            },
        },
        "required": [
            "target", "goal_delta", "donor_weights", "cluster_strength",
            "weight_overrides", "horizon_year", "label", "rationale",
        ],
    },
}

# ---------------------------------------------------------------------------
# parse-goal — system prompt
# ---------------------------------------------------------------------------

PARSE_SYSTEM = """\
You are a planning assistant for an interactive Hong Kong district viability map.
Your job is to translate a natural-language city-planning goal into structured
parameters that drive both a viability scorer and a land-reallocation algorithm.

## Viability scorer (WLC) terms  — set via weight_overrides
| Key          | Meaning |
|--------------|---------|
| displacement | Prefers low density — less disruption to existing residents |
| age          | Weights districts with more residents aged 65+ (displacement-sensitive) |
| headroom     | Prefers convertible land with room still to grow in the target category |
| area         | Prefers larger districts for greater aggregate impact |
| renewal      | Weights districts with more ageing buildings (renewal goals only) |

## Reallocation algorithm  — set via goal_delta, donor_weights, cluster_strength
The algorithm adds `goal_delta` × current city-wide target area to the map, distributed
across districts weighted by their viability and cluster affinity. Land for the
additions is taken from **donor categories** — the target grows, donors shrink.

- `goal_delta`: fraction of current target area to add (0.10 = +10%).
- `donor_weights`: how much each non-target category contributes.
  - 1.0 = donates proportionally to its current area (default / neutral).
  - 2.0 = strongly preferred donor (e.g. 'primarily from residential').
  - 0.0 = fully protected — this category NEVER shrinks ('no green harmed').
  - Only include keys you need to override; missing = 1.0.
- `cluster_strength`: 0 = spread evenly; 1.5 = concentrate near existing clusters.

## Land-use targets
Pick exactly one: residential, industrial, commercial, green, educational.

## Rules
- Output ONLY via the set_scenario tool — never rank or score districts yourself.
- Parse the magnitude explicitly ('10% more' → 0.10); default goal_delta = 0.10.
- Map 'no X harmed' / 'protect X' → donor_weights.X = 0.0.
- Map 'primarily from X' / 'mainly trade X' → donor_weights.X = 2.0.
- Green corridors and educational clusters → cluster_strength = 1.5.
- Industrial parks, broad urban renewal → cluster_strength = 0.8.
- Never invent district-specific data.
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

# ---------------------------------------------------------------------------
# summarize-plan — system prompt
# ---------------------------------------------------------------------------

SUMMARIZE_SYSTEM = """\
You are a city-planning assistant summarising the outcome of a land-reallocation
scenario for Hong Kong.

Rules:
- Write exactly 2–3 sentences.
- Confirm the city-wide target achieved vs. the goal (e.g. "+9.8% industrial added, goal was +10%").
- Name the 1–2 biggest donor categories (those with the largest negative city_delta).
- If any category had a donor_weight of 0, explicitly state it was "held flat" or "protected".
- If achieved_km2 < 0.95 × goal_km2, flag the shortfall and briefly explain (not enough donatable land).
- Name the top 1–2 districts that received the most land.
- Do not use markdown, bullet points, or lists — flowing prose only.
- Never describe the result as "official" or "authoritative".
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

Write a 2–3 sentence explanation of why this district scored {req.score:.2f}.
"""


def build_summarize_user_prompt(req: SummarizePlanRequest) -> str:
    """Construct the user message for the summarize-plan endpoint."""
    dw = req.donor_weights.model_dump(exclude_none=False)
    protected = [k for k, v in dw.items() if v == 0.0]
    preferred = [k for k, v in dw.items() if v is not None and v > 1.2]

    donor_lines = []
    if protected:
        donor_lines.append(f"Protected (weight=0, must not shrink): {', '.join(protected)}")
    if preferred:
        donor_lines.append(f"Preferred donors (weight>1.2): {', '.join(preferred)}")
    if not donor_lines:
        donor_lines.append("All donors proportional (no overrides)")

    delta = req.city_delta
    delta_lines = "\n".join(
        f"  {k}: {v:+.2%}" for k, v in delta.model_dump().items()
    )

    top_names = ", ".join(
        f"{d.name} ({d.received_km2:.1f} km²)" for d in req.top_districts
    )

    shortfall = req.goal_km2 - req.achieved_km2
    shortfall_note = (
        f"Shortfall: {shortfall:.1f} km² ({shortfall / req.goal_km2:.1%} of goal) — "
        "not enough donatable land remained after applying protections."
        if shortfall > 0.05 * req.goal_km2 else
        "Goal fully achieved."
    )

    return f"""\
User goal: "{req.user_text}"
Target category: {req.target}
Goal: +{req.goal_delta:.0%} of current {req.target} area = {req.goal_km2:.1f} km²
Achieved: {req.achieved_km2:.1f} km²  ({shortfall_note})
Horizon year: {req.horizon_year}

Donor configuration:
{chr(10).join(donor_lines)}

City-wide fraction delta (future − current):
{delta_lines}

Top receiving districts: {top_names}

Write a 2–3 sentence summary confirming what was achieved, naming the main donors,
noting any protected categories, and flagging any shortfall.
"""
