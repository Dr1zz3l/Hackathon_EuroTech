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

LandCategory = Literal["residential", "industrial", "commercial", "green", "educational"]
Locale = Literal["en", "yue"]

WEIGHT_KEYS = {"displacement", "age", "headroom", "area", "renewal"}


class LandUseInfo(BaseModel):
    residential: float
    industrial: float
    commercial: float
    green: float
    educational: float
    other: float


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


class ParseGoalResponse(BaseModel):
    target: LandCategory
    weight_overrides: WeightOverrides
    horizon_year: int
    label: str
    rationale: str


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
