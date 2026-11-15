from __future__ import annotations

from collections import OrderedDict

from fastapi import APIRouter, Header, Request

from app.api.dependencies import student_id_from_authorization
from app.api.students import learning_repository_from_request
from app.core.types import Course
from app.schemas.curriculum import (
    CurriculumResponse,
    CurriculumStageResponse,
    TopicDetailResponse,
    TopicSummaryResponse,
)
from app.services.learning_repository import LearningRepository

router = APIRouter(prefix="/api/v1/curriculum", tags=["curriculum"])


def _mastery_display(value: float | None) -> str | None:
    return None if value is None else f"{round(value * 100)}%"


def _student_view(
    repository: LearningRepository,
    topic: dict,
    student_id: str | None,
) -> dict:
    if student_id is None:
        return {
            "status": None,
            "mastery": None,
            "mastery_display": None,
            "confidence": None,
        }

    stored_status = topic.get("state_status")
    status = stored_status or "not_started"
    started = stored_status not in (None, "not_started")
    mastery = topic.get("state_mastery") if started else None
    confidence = topic.get("state_confidence") if started else None
    return {
        "status": status,
        "mastery": mastery,
        "mastery_display": _mastery_display(mastery),
        "confidence": confidence,
    }


def _summary(
    repository: LearningRepository,
    topic: dict,
    student_id: str | None,
) -> TopicSummaryResponse:
    return TopicSummaryResponse(
        id=topic["id"],
        slug=topic["slug"],
        title=topic["title"],
        order_index=topic["order_index"],
        description=topic["description"],
        **_student_view(repository, topic, student_id),
    )


@router.get("/topics", response_model=CurriculumResponse)
def list_topics(
    request: Request,
    course: Course,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> CurriculumResponse:
    repository = learning_repository_from_request(request)
    student_id = student_id_from_authorization(authorization, repository)
    topics = repository.list_topics(course, student_id=student_id)
    grouped: OrderedDict[int, CurriculumStageResponse] = OrderedDict()
    for topic in topics:
        stage = grouped.setdefault(
            topic["stage"],
            CurriculumStageResponse(
                stage=topic["stage"], title=topic["stage_title"], topics=[]
            ),
        )
        stage.topics.append(_summary(repository, topic, student_id))
    return CurriculumResponse(course=course, stages=list(grouped.values()))


@router.get("/topics/{topic_id}", response_model=TopicDetailResponse)
def topic_detail(
    topic_id: str,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> TopicDetailResponse:
    repository = learning_repository_from_request(request)
    student_id = student_id_from_authorization(authorization, repository)
    topic = repository.require_topic(topic_id, student_id=student_id)
    summary = _summary(repository, topic, student_id)
    return TopicDetailResponse(
        **summary.model_dump(),
        course=topic["course"],
        stage=topic["stage"],
        stage_title=topic["stage_title"],
        learning_objectives=topic["learning_objectives"],
        active=topic["active"],
        created_at=topic["created_at"],
        updated_at=topic["updated_at"],
    )
