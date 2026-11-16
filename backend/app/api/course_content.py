"""Stable canonical curriculum navigation."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request

from app.api.dependencies import student_id_from_authorization
from app.core.types import Course

router = APIRouter(prefix="/api/v1", tags=["course-content"])


@router.get("/courses/{course}/outline")
def outline(
    course: Course,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    repository = request.app.state.learning_repository
    course_record = repository.require_course(course)
    student_id = student_id_from_authorization(authorization, repository)
    with repository._connect() as connection:
        chapters = connection.execute(
            "SELECT id,title,sort_order FROM course_chapters WHERE course_id=? ORDER BY sort_order,id",
            (course.value,),
        ).fetchall()
        topics = [
            repository._topic_record(row)
            for row in connection.execute(
                """SELECT t.*,ch.title AS chapter_title,ch.sort_order AS chapter_order
            FROM curriculum_topics t
            JOIN course_chapters ch ON ch.id=t.chapter_id AND ch.course_id=t.course
            WHERE t.course=? ORDER BY ch.sort_order,t.order_index,t.id""",
                (course.value,),
            )
        ]
        topic_ids = [topic["id"] for topic in topics]
        states = {}
        if student_id:
            states = {
                row["topic_id"]: dict(row)
                for row in connection.execute(
                    "SELECT * FROM student_topic_states WHERE student_id=? AND topic_id = ANY(?)",
                    (student_id, topic_ids),
                )
            }
    groups: dict[str, dict] = {
        chapter["id"]: {
            "id": chapter["id"],
            "title": chapter["title"],
            "parent_group_id": None,
            "order_index": index,
            "sort_order": chapter["sort_order"],
            "topics": [],
        }
        for index, chapter in enumerate(chapters)
    }
    recommended = None
    for topic in topics:
        topic_id = topic["id"]
        state = states.get(topic_id)
        group = groups.setdefault(
            topic["chapter_id"],
            {
                "id": topic["chapter_id"],
                "title": topic["chapter_title"],
                "parent_group_id": None,
                "order_index": topic["chapter_order"] - 1,
                "sort_order": topic["chapter_order"],
                "topics": [],
            },
        )
        status = state["status"] if state else "not_started"
        group["topics"].append(
            {
                "id": topic_id,
                "topic_id": topic_id,
                "title": topic["title"],
                "description": topic["description"],
                "learning_objectives": topic["learning_objectives"],
                "order_index": topic["order_index"],
                "status": status,
                "mastery": float(state["mastery"])
                if state and state["evidence_count"]
                else None,
            }
        )
        if recommended is None and status != "mastered":
            recommended = topic_id
    return {
        "course": course.value,
        "title": course_record["title"],
        "groups": sorted(
            groups.values(), key=lambda group: (group["sort_order"], group["id"])
        ),
        "recommended_topic_id": recommended,
    }
