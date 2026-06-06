"""
Pydantic request / response models for the LLM layer endpoints.

Mirrors the TypeScript types in frontend/src/types.ts — keep in sync
if the shared contract changes.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Shared sub-types
# ---------------------------------------------------------------------------

LandCategory = Literal["residential", "industrial", "commercial", "agricultural", "recreational", "institutional"]
Locale = Literal["en", "yue"]

WEIGHT_KEYS = {"displacement", "age", "headroom", "area", "renewal"}


class LandUseInfo(BaseModel):
    residential:    float
    industrial:     float
    commercial:     float
    agricultural:   float
    recreational:   float
    institutional:  float
    misc:           float
    infrastructure: float
    protected:      float


class DistrictInfo(BaseModel):
    name: str
    name_tc: str
    pop: int
    density: float
    area_km2: float
    pct_over65: float
    land: LandUseInfo
    land_source: Literal["raster_2024", "estimated"]


class ScenarioInfo(BaseModel):
    target: LandCategory
    label: str
    horizon_year: int


class TermInfo(BaseModel):
    key: str
    display_value: str
    contribution: float


# ---------------------------------------------------------------------------
# /api/parse-goal
# ---------------------------------------------------------------------------

class ParseGoalRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    locale: Locale = "en"


class WeightOverrides(BaseModel):
    displacement: float | None = None
    age: float | None = None
    headroom: float | None = None
    area: float | None = None
    renewal: float | None = None


class DonorWeights(BaseModel):
    """Per-category donor weight (0 = frozen, 1 = neutral, >1 = preferred donor)."""
    residential:   float | None = None
    industrial:    float | None = None
    commercial:    float | None = None
    agricultural:  float | None = None
    recreational:  float | None = None
    institutional: float | None = None


class ParseGoalResponse(BaseModel):
    target: LandCategory
    weight_overrides: WeightOverrides
    goal_delta: float          # fraction of current target area to add, e.g. 0.10
    donor_weights: DonorWeights
    cluster_strength: float    # agglomeration μ, e.g. 1.0–1.5
    horizon_year: int
    label: str
    rationale: str


# ---------------------------------------------------------------------------
# /api/summarize-plan
# ---------------------------------------------------------------------------

class CityDelta(BaseModel):
    """City-wide per-category signed fraction delta (area-weighted average)."""
    residential:    float
    industrial:     float
    commercial:     float
    agricultural:   float
    recreational:   float
    institutional:  float
    misc:           float
    infrastructure: float
    protected:      float


class TopDistrict(BaseModel):
    name: str
    name_tc: str
    received_km2: float


class SummarizePlanRequest(BaseModel):
    user_text: str = Field(..., min_length=1, max_length=500)
    locale: Locale = "en"
    target: LandCategory
    goal_delta: float
    donor_weights: DonorWeights
    horizon_year: int
    goal_km2: float
    achieved_km2: float
    city_delta: CityDelta
    top_districts: list[TopDistrict]  # top 3 by received_km2


class SummarizePlanResponse(BaseModel):
    prose: str


# ---------------------------------------------------------------------------
# /api/explain
# ---------------------------------------------------------------------------

class ExplainRequest(BaseModel):
    district: DistrictInfo
    scenario: ScenarioInfo
    score: float = Field(..., ge=0.0, le=1.0)
    terms: list[TermInfo]
    locale: Locale = "en"


class ExplainResponse(BaseModel):
    prose: str
