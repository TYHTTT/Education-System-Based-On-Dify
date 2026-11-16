from __future__ import annotations

import json
import secrets
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.exceptions import (
    CourseNotFoundError,
    StudentNotFoundError,
    TopicNotFoundError,
)
from app.core.security import hash_password, hash_session_token, verify_password
from app.core.types import Course
from app.curriculum.models import CurriculumSeed
from app.curriculum.validation import TopicOwnershipError
from app.db.database import PostgresConnection, PostgresDatabase


class LearningRepository:
    """Persistence for accounts, curriculum and learning scores."""

    TOPIC_STATE_UPDATE_FIELDS = frozenset(
        {
            "mastery",
            "evidence_count",
            "attempt_count",
            "latest_score",
            "best_score",
            "status",
            "started_at",
            "last_practiced_at",
            "mastered_at",
        }
    )

    def __init__(self, database_url: str | PostgresDatabase) -> None:
        self.database = (
            database_url
            if isinstance(database_url, PostgresDatabase)
            else PostgresDatabase(database_url)
        )

    def _connect(self) -> PostgresConnection:
        """Return a connection to the configured PostgreSQL database."""

        return self.database.connect()

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _row(row: dict[str, Any] | None) -> dict[str, Any] | None:
        return dict(row) if row is not None else None

    def register_student(
        self, *, username: str, password: str, display_name: str
    ) -> dict[str, Any]:
        student_id, now = str(uuid.uuid4()), self._now()
        normalized_username = username.strip().lower()
        with self._connect() as connection:
            existing = connection.execute(
                "SELECT 1 FROM students WHERE username = ?", (normalized_username,)
            ).fetchone()
            if existing is not None:
                raise ValueError("username_taken")
            connection.execute(
                """INSERT INTO students(id, username, display_name, password_hash, created_at, last_active_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    student_id,
                    normalized_username,
                    display_name.strip(),
                    hash_password(password),
                    now,
                    now,
                ),
            )
        return self._issue_session(student_id)

    def list_students(self, *, query: str = "", page: int = 1, page_size: int = 20) -> dict:
        term = query.strip().lower()
        condition = "strpos(lower(coalesce(username,'')), ?) > 0 OR strpos(lower(coalesce(display_name,'')), ?) > 0"
        with self._connect() as connection:
            connection.execute(
                "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
            )
            total = connection.execute(
                f"SELECT count(*) AS total FROM students WHERE {condition}",
                (term, term),
            ).fetchone()["total"]
            items = connection.execute(
                f"""SELECT id AS student_id, username, display_name, active=1 AS active,
                    created_at, last_active_at FROM students WHERE {condition}
                    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
                (term, term, page_size, (page - 1) * page_size),
            ).fetchall()
        return {
            "items": [dict(row) for row in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def delete_student(self, student_id: str) -> bool:
        # Foreign keys remove sessions and learning states; accounting logs survive.
        with self._connect() as connection:
            row = connection.execute(
                "DELETE FROM students WHERE id = ? RETURNING id", (student_id,)
            ).fetchone()
        return row is not None

    def authenticate_student(
        self, *, username: str, password: str
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            student = connection.execute(
                "SELECT id, username, display_name, password_hash, created_at FROM students WHERE username = ? AND active = 1",
                (username.strip().lower(),),
            ).fetchone()
        if student is None or not verify_password(
            password, student["password_hash"] or ""
        ):
            return None
        return self._issue_session(student["id"])

    def _issue_session(self, student_id: str) -> dict[str, Any]:
        token, session_id, now = (
            secrets.token_urlsafe(32),
            str(uuid.uuid4()),
            self._now(),
        )
        expires_at = (datetime.now(UTC) + timedelta(days=30)).isoformat()
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO student_sessions(id, student_id, token_hash, expires_at, created_at, last_used_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    session_id,
                    student_id,
                    hash_session_token(token),
                    expires_at,
                    now,
                    now,
                ),
            )
            student = connection.execute(
                "SELECT id, username, display_name, created_at FROM students WHERE id = ?",
                (student_id,),
            ).fetchone()
        return {**dict(student), "access_token": token}

    def student_from_token(self, token: str, *, touch: bool = True) -> dict[str, Any]:
        now = self._now()
        with self._connect() as connection:
            student = connection.execute(
                """SELECT s.id, s.username, s.display_name, s.created_at, s.last_active_at
                   FROM student_sessions ss JOIN students s ON s.id = ss.student_id
                   WHERE ss.token_hash = ? AND ss.expires_at > ? AND s.active = 1""",
                (hash_session_token(token), now),
            ).fetchone()
            if student is None:
                raise StudentNotFoundError()
            if touch:
                connection.execute(
                    "UPDATE student_sessions SET last_used_at = ? WHERE token_hash = ?",
                    (now, hash_session_token(token)),
                )
                connection.execute(
                    "UPDATE students SET last_active_at = ? WHERE id = ?",
                    (now, student["id"]),
                )
        return dict(student)

    def revoke_session(self, token: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM student_sessions WHERE token_hash = ?",
                (hash_session_token(token),),
            )

    def get_student(self, student_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id, created_at, last_active_at FROM students WHERE id = ?",
                (student_id,),
            ).fetchone()
        return self._row(row)

    def require_student(self, student_id: str, *, touch: bool = True) -> dict[str, Any]:
        try:
            normalized = str(uuid.UUID(student_id))
        except (ValueError, AttributeError, TypeError) as exc:
            raise StudentNotFoundError() from exc
        now = self._now()
        with self._connect() as connection:
            if touch:
                cursor = connection.execute(
                    "UPDATE students SET last_active_at = ? WHERE id = ?",
                    (now, normalized),
                )
                if cursor.rowcount == 0:
                    raise StudentNotFoundError()
            row = connection.execute(
                "SELECT id, created_at, last_active_at FROM students WHERE id = ?",
                (normalized,),
            ).fetchone()
        if row is None:
            raise StudentNotFoundError()
        return dict(row)

    def upsert_curriculum(self, seeds: Sequence[CurriculumSeed]) -> None:
        """Upsert stable topics and their chapters atomically."""

        now = self._now()
        topics = [(seed.course.value, topic) for seed in seeds for topic in seed.topics]
        with self._connect() as connection:
            chapters = {}
            used_chapters = []
            for course in sorted({course for course, _ in topics}):
                connection.execute(
                    "SELECT id FROM courses WHERE id=? FOR UPDATE", (course,)
                ).fetchone()
            for course, topic in topics:
                key = (course, topic.stage)
                if key in chapters:
                    continue
                chapter = connection.execute(
                    """SELECT id,sort_order,title FROM course_chapters
                    WHERE course_id=? AND title=? AND NOT(id=ANY(?)) ORDER BY sort_order,id LIMIT 1""",
                    (course, topic.stage_title, used_chapters),
                ).fetchone()
                if chapter is None:
                    order = connection.execute(
                        "SELECT coalesce(max(sort_order),0)+1 AS position FROM course_chapters WHERE course_id=?",
                        (course,),
                    ).fetchone()["position"]
                    chapter = {
                        "id": str(uuid.uuid4()),
                        "sort_order": order,
                        "title": topic.stage_title,
                    }
                    connection.execute(
                        "INSERT INTO course_chapters(id,course_id,sort_order,title) VALUES (?,?,?,?)",
                        (chapter["id"], course, order, chapter["title"]),
                    )
                chapters[key] = dict(chapter)
                used_chapters.append(chapter["id"])
            for course, topic in topics:
                chapter = chapters[(course, topic.stage)]
                existing = connection.execute(
                    "SELECT course FROM curriculum_topics WHERE id = ?", (topic.id,)
                ).fetchone()
                if existing is not None and existing["course"] != course:
                    raise TopicOwnershipError(
                        f"稳定知识点 ID {topic.id} 不能从 {existing['course']} 迁移到 {course}"
                    )
                connection.execute(
                    """
                    INSERT INTO curriculum_topics (
                        id, course, chapter_id, title, order_index,
                        description, learning_objectives_json,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        chapter_id = excluded.chapter_id,
                        order_index = excluded.order_index,
                        description = excluded.description,
                        learning_objectives_json = excluded.learning_objectives_json,
                        updated_at = excluded.updated_at
                    """,
                    (
                        topic.id,
                        course,
                        chapter["id"],
                        topic.title,
                        topic.order_index,
                        topic.description,
                        self._dump_json(topic.learning_objectives),
                        now,
                        now,
                    ),
                )

    @staticmethod
    def _dump_json(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _load_json(value: str | None, fallback: Any) -> Any:
        return json.loads(value) if value else fallback

    def _topic_record(self, row: dict[str, Any]) -> dict[str, Any]:
        record = dict(row)
        for column, output in (("learning_objectives_json", "learning_objectives"),):
            record[output] = self._load_json(record.pop(column), [])
        return record

    def require_course(self, course: Course | str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM courses WHERE id=? AND active=1",
                (course.value if isinstance(course, Course) else course,),
            ).fetchone()
        if row is None:
            raise CourseNotFoundError()
        return dict(row)

    def list_topics(
        self,
        course: Course | str,
        *,
        student_id: str | None = None,
    ) -> list[dict[str, Any]]:
        course_value = (
            course.value if isinstance(course, Course) else Course(course).value
        )
        self.require_course(course_value)
        params: list[Any] = []
        state_columns = "NULL AS state_status, NULL AS state_mastery, NULL AS state_evidence_count, NULL AS state_latest_score"
        join = ""
        if student_id is not None:
            params.append(student_id)
            join = (
                "LEFT JOIN student_topic_states sts "
                "ON sts.topic_id = t.id AND sts.student_id = ?"
            )
            state_columns = (
                "sts.status AS state_status, sts.mastery AS state_mastery, "
                "sts.evidence_count AS state_evidence_count, sts.latest_score AS state_latest_score"
            )
        params.append(course_value)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT t.*, ch.sort_order AS stage, ch.title AS stage_title, {state_columns}
                FROM curriculum_topics t
                JOIN course_chapters ch ON ch.id=t.chapter_id AND ch.course_id=t.course
                {join}
                WHERE t.course = ?
                ORDER BY ch.sort_order, t.order_index, t.id
                """,
                tuple(params),
            ).fetchall()
        return [self._topic_record(row) for row in rows]

    def get_topic(
        self, topic_id: str, *, student_id: str | None = None
    ) -> dict[str, Any] | None:
        params: list[Any] = []
        join = ""
        state_columns = "NULL AS state_status, NULL AS state_mastery, NULL AS state_evidence_count, NULL AS state_latest_score"
        if student_id is not None:
            params.append(student_id)
            join = (
                "LEFT JOIN student_topic_states sts "
                "ON sts.topic_id = t.id AND sts.student_id = ?"
            )
            state_columns = (
                "sts.status AS state_status, sts.mastery AS state_mastery, "
                "sts.evidence_count AS state_evidence_count, sts.latest_score AS state_latest_score"
            )
        params.append(topic_id)
        with self._connect() as connection:
            row = connection.execute(
                f"""
                SELECT t.*, ch.sort_order AS stage, ch.title AS stage_title, {state_columns}
                FROM curriculum_topics t
                JOIN course_chapters ch ON ch.id=t.chapter_id AND ch.course_id=t.course
                JOIN courses owner_course ON owner_course.id=t.course AND owner_course.active=1
                {join}
                WHERE t.id = ?
                """,
                tuple(params),
            ).fetchone()
        if row is None:
            return None
        return self._topic_record(row)

    def require_topic(
        self, topic_id: str, *, student_id: str | None = None
    ) -> dict[str, Any]:
        topic = self.get_topic(topic_id, student_id=student_id)
        if topic is None:
            raise TopicNotFoundError()
        return topic

    def get_related_topics(self, topic_id: str) -> list[dict[str, Any]]:
        """Read both directions of saved relations, limited to student-visible topics."""
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT t.id,t.title,t.course,c.title AS course_title
                FROM topic_relations relation
                JOIN curriculum_topics t ON t.id=CASE
                    WHEN relation.topic_a_id=? THEN relation.topic_b_id
                    ELSE relation.topic_a_id END
                JOIN courses c ON c.id=t.course
                JOIN course_chapters ch ON ch.id=t.chapter_id AND ch.course_id=t.course
                WHERE (relation.topic_a_id=? OR relation.topic_b_id=?)
                    AND relation.relation_type='related' AND c.active=1
                ORDER BY c.title,c.id,ch.sort_order,t.order_index,t.id
                """,
                (topic_id, topic_id, topic_id),
            ).fetchall()
        return [dict(row) for row in rows]

    def ensure_topic_state(
        self,
        student_id: str,
        topic_id: str,
        *,
        status: str = "not_started",
    ) -> dict[str, Any]:
        self.require_student(student_id, touch=False)
        self.require_topic(topic_id)
        now = self._now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO student_topic_states(student_id, topic_id, status, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(student_id, topic_id) DO NOTHING
                """,
                (student_id, topic_id, status, now),
            )
        state = self.get_topic_state(student_id, topic_id)
        assert state is not None
        return state

    def get_topic_state(self, student_id: str, topic_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM student_topic_states WHERE student_id = ? AND topic_id = ?",
                (student_id, topic_id),
            ).fetchone()
        return self._row(row)

    def update_topic_state(
        self,
        student_id: str,
        topic_id: str,
        **changes: Any,
    ) -> dict[str, Any]:
        invalid = set(changes) - self.TOPIC_STATE_UPDATE_FIELDS
        if invalid:
            raise ValueError(f"不允许更新字段: {', '.join(sorted(invalid))}")
        self.ensure_topic_state(student_id, topic_id)
        if not changes:
            state = self.get_topic_state(student_id, topic_id)
            assert state is not None
            return state
        changes["updated_at"] = self._now()
        assignments = ", ".join(f"{field} = ?" for field in changes)
        with self._connect() as connection:
            connection.execute(
                f"""
                UPDATE student_topic_states SET {assignments}
                WHERE student_id = ? AND topic_id = ?
                """,
                (*changes.values(), student_id, topic_id),
            )
        state = self.get_topic_state(student_id, topic_id)
        assert state is not None
        return state

    def record_topic_score(
        self,
        *,
        student_id: str,
        topic_id: str,
        course: Course | str,
        score: float,
    ) -> dict[str, Any]:
        if not 0 <= score <= 100:
            raise ValueError("评分必须在 0 到 100 之间")
        self.require_student(student_id, touch=False)
        now = self._now()
        with self._connect() as connection:
            # Match course/topic deletion lock order while persisting the result.
            owner = connection.execute(
                "SELECT id,completion_threshold FROM courses WHERE id=? AND active=1 FOR SHARE",
                (str(course),),
            ).fetchone()
            if owner is None:
                raise CourseNotFoundError()
            threshold = owner["completion_threshold"]
            status = "mastered" if score > threshold else "learning"
            topic = connection.execute(
                """SELECT id FROM curriculum_topics
                WHERE id=? AND course=? FOR KEY SHARE""",
                (topic_id, str(course)),
            ).fetchone()
            if topic is None:
                raise TopicNotFoundError()
            row = connection.execute(
                """INSERT INTO student_topic_states(
                    student_id,topic_id,latest_score,best_score,mastery,evidence_count,attempt_count,
                    status,started_at,last_practiced_at,mastered_at,updated_at)
                VALUES (?,?,?,?,?,1,1,?,?,?,?,?)
                ON CONFLICT(student_id,topic_id) DO UPDATE SET
                    latest_score=excluded.latest_score,
                    best_score=GREATEST(coalesce(student_topic_states.best_score,excluded.best_score),excluded.best_score),
                    mastery=excluded.mastery,
                    evidence_count=student_topic_states.evidence_count+1,
                    attempt_count=student_topic_states.attempt_count+1,
                    status=excluded.status,
                    started_at=coalesce(student_topic_states.started_at,excluded.started_at),
                    last_practiced_at=excluded.last_practiced_at,
                    mastered_at=CASE WHEN excluded.status='mastered'
                        THEN coalesce(student_topic_states.mastered_at,excluded.mastered_at) ELSE NULL END,
                    updated_at=excluded.updated_at
                RETURNING *""",
                (
                    student_id,
                    topic_id,
                    score,
                    score,
                    score / 100,
                    status,
                    now,
                    now,
                    now if status == "mastered" else None,
                    now,
                ),
            ).fetchone()
        return {**dict(row), "completion_threshold": threshold}
