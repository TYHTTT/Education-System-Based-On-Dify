from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.core.types import Course

TopicStatus = Literal[
    "not_started",
    "learning",
    "mastered",
]


class TopicSummaryResponse(BaseModel):
    id: str
    title: str
    order_index: int
    description: str
    status: TopicStatus | None = None
    mastery: float | None = None
    mastery_display: str | None = None
    latest_score: float | None = None
    evidence_count: int = 0


class CurriculumStageResponse(BaseModel):
    stage: int
    title: str
    topics: list[TopicSummaryResponse]


class CurriculumResponse(BaseModel):
    course: Course
    stages: list[CurriculumStageResponse]


class TopicDetailResponse(TopicSummaryResponse):
    course: Course
    stage: int
    stage_title: str
    learning_objectives: list[str]
    created_at: datetime
    updated_at: datetime
