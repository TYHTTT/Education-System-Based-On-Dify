"""Ground the initial teaching request in the saved curriculum metadata."""

from typing import Any


def teaching_question(
    question: str,
    topic: dict[str, Any],
    related_topics: list[dict[str, Any]],
) -> str:
    sections = [question]
    if related_topics:
        sections.append(
            "相关知识点：\n"
            + "\n".join(
                f"- {related['course_title']}：{related['title']}"
                for related in related_topics
            )
        )
    objectives = [
        value.strip()
        for value in topic.get("learning_objectives") or []
        if value.strip()
    ]
    if objectives:
        sections.append(
            "学习目标：\n"
            + "\n".join(
                f"{index}. {objective}" for index, objective in enumerate(objectives, 1)
            )
        )
    return "\n\n".join(sections)
