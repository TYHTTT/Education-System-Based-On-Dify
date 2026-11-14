from __future__ import annotations

from typing import Any

from app.core.types import Course
from app.services.learning_repository import LearningRepository


class LearningService:
    """Study state and course overview for Dify-based learning."""

    def __init__(self, *, repository: LearningRepository) -> None:
        self.repository = repository

    def start_topic(self, *, student_id: str, topic_id: str) -> dict[str, Any]:
        self.repository.require_student(student_id)
        topic = self.repository.require_topic(topic_id, student_id=student_id)
        state = self.repository.ensure_topic_state(student_id, topic_id)
        if state["status"] != "mastered":
            changes: dict[str, Any] = {"status": "learning"}
            if not state.get("started_at"):
                changes["started_at"] = self.repository._now()
            state = self.repository.update_topic_state(student_id, topic_id, **changes)
        self.repository.create_learning_session(
            student_id=student_id,
            course=topic["course"],
            topic_id=topic_id,
            state="learning",
        )
        return self.topic_detail(student_id=student_id, topic_id=topic_id)

    def topic_detail(self, *, student_id: str, topic_id: str) -> dict[str, Any]:
        self.repository.require_student(student_id)
        topic = self.repository.require_topic(topic_id, student_id=student_id)
        state = self.repository.get_topic_state(student_id, topic_id)
        status = self._status(state)
        return {
            **{key: value for key, value in topic.items() if not key.startswith("state_")},
            "status": status,
            "mastery": (
                float(state["mastery"])
                if state is not None and int(state["evidence_count"]) > 0
                else None
            ),
            "mastery_display": (
                f"{float(state['mastery']) * 100:.0f}%"
                if state is not None and int(state["evidence_count"]) > 0
                else "尚未评估"
            ),
            "confidence": float(state["confidence"]) if state else 0.0,
        }

    def dashboard(self, *, student_id: str, course: Course) -> dict[str, Any]:
        self.repository.require_student(student_id)
        topics = self.repository.list_topics(course, student_id=student_id)
        views: list[dict[str, Any]] = []
        for topic in topics:
            state = (
                {
                    "status": topic["state_status"],
                    "mastery": topic["state_mastery"],
                    "confidence": topic["state_confidence"],
                    "evidence_count": topic["state_evidence_count"],
                }
                if topic["state_status"] is not None
                else None
            )
            views.append(
                {
                    "id": topic["id"],
                    "title": topic["title"],
                    "stage": topic["stage"],
                    "stage_title": topic["stage_title"],
                    "order_index": topic["order_index"],
                    "status": self._status(state),
                    "mastery": (
                        float(state["mastery"])
                        if state is not None and int(state["evidence_count"]) > 0
                        else None
                    ),
                    "confidence": float(state["confidence"]) if state else 0.0,
                }
            )
        current = self._current_topic(views)
        if not views:
            decision = {"next_action": "start_learning", "reasons": ["当前课程暂无知识点"], "recommended_topic_id": None}
        elif current is None:
            decision = {
                "next_action": "course_completed",
                "reasons": ["当前课程的全部知识点均已学完"],
                "recommended_topic_id": None,
            }
        else:
            starting = current["status"] == "not_started"
            decision = {
                "next_action": "start_learning" if starting else "continue_learning",
                "reasons": ["按课程编排开始下一个知识点" if starting else "继续当前知识点的学习"],
                "recommended_topic_id": current["id"],
            }
        counts = {
            status: sum(item["status"] == status for item in views)
            for status in (
                "mastered",
                "learning",
                "practicing",
                "needs_remediation",
                "ready_for_checkpoint",
                "not_started",
            )
        }
        stages: dict[tuple[int, str], list[dict[str, Any]]] = {}
        for view in views:
            stages.setdefault((view["stage"], view["stage_title"]), []).append(view)
        return {
            "course": course.value,
            "total_topics": len(views),
            "mastered_count": counts["mastered"],
            "learning_count": sum(
                counts[item]
                for item in (
                    "learning",
                    "practicing",
                    "needs_remediation",
                    "ready_for_checkpoint",
                )
            ),
            "not_started_count": counts["not_started"],
            "current_topic": current,
            "recommended_topic_id": decision.get("recommended_topic_id"),
            "next_action": decision["next_action"],
            "reasons": decision["reasons"],
            "stages": [
                {"stage": stage, "title": title, "topics": stage_topics}
                for (stage, title), stage_topics in stages.items()
            ],
        }

    @staticmethod
    def _status(state) -> str:
        if state is not None and state["status"] == "mastered":
            return "mastered"
        return state["status"] if state is not None else "not_started"

    @staticmethod
    def _current_topic(views: list[dict[str, Any]]) -> dict[str, Any] | None:
        for wanted in (
            "needs_remediation",
            "learning",
            "practicing",
            "ready_for_checkpoint",
            "not_started",
        ):
            match = next((item for item in views if item["status"] == wanted), None)
            if match is not None:
                return match
        return None
