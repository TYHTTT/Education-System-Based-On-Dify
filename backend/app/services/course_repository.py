from datetime import UTC, datetime
from uuid import uuid4

from psycopg.errors import UniqueViolation

from app.core.exceptions import CourseConflictError, CourseNotFoundError
from app.db.database import PostgresDatabase
from app.core.config import get_settings
from app.core.settings_cipher import SettingsCipher
from app.services.curriculum_cleanup import delete_course

# Prefer distinct saturated hues before reusing a color in larger catalogs.
COURSE_GRAPH_COLORS = (
    "#2563eb",
    "#c2410c",
    "#047857",
    "#9333ea",
    "#be185d",
    "#0e7490",
    "#a16207",
    "#475569",
)


COURSE_SELECT = """SELECT c.*,
    (SELECT count(*) FROM curriculum_topics t WHERE t.course=c.id) AS topic_count,
    (SELECT count(*) FROM course_chapters ch WHERE ch.course_id=c.id) AS stage_count
    FROM courses c"""


class CourseRepository:
    def __init__(self, database_url: str, *, cipher=None):
        self.database = PostgresDatabase(database_url)
        self.cipher = cipher or SettingsCipher(get_settings())

    @staticmethod
    def _public_record(row):
        record = dict(row)
        record["dify_api_key_configured"] = bool(record.pop("dify_api_key_encrypted", None))
        return record

    def list(self, *, query="", status="all", page=1, page_size=20, public=False):
        where = "TRUE"
        parameters = []
        if public or status != "all":
            where += " AND c.active=?"
            parameters.append(1 if public or status == "active" else 0)
        if query.strip():
            where += " AND (c.id ILIKE ? OR c.title ILIKE ?)"
            parameters.extend([f"%{query.strip()}%"] * 2)
        with self.database.connect() as connection:
            total = connection.execute(
                f"SELECT count(*) AS count FROM courses c WHERE {where}",
                tuple(parameters),
            ).fetchone()["count"]
            query_sql = COURSE_SELECT + f" WHERE {where} ORDER BY c.title,c.id"
            if not public:
                query_sql += " LIMIT ? OFFSET ?"
                parameters.extend([page_size, (page - 1) * page_size])
            items = [
                self._public_record(row) for row in connection.execute(query_sql, tuple(parameters))
            ]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    def get(self, course_id, *, detail=False):
        with self.database.connect() as connection:
            row = connection.execute(
                COURSE_SELECT + " WHERE c.id=?", (str(course_id),)
            ).fetchone()
            if row is None:
                raise CourseNotFoundError()
            result = self._public_record(row)
            if detail:
                result["topics"] = [
                    dict(topic)
                    for topic in connection.execute(
                        """SELECT t.id,t.title,ch.sort_order AS stage,ch.title AS stage_title
                        FROM curriculum_topics t JOIN course_chapters ch ON ch.id=t.chapter_id AND ch.course_id=t.course
                        WHERE t.course=? ORDER BY ch.sort_order,t.order_index,t.id""",
                        (str(course_id),),
                    )
                ]
        return result

    def create(self, values):
        course_id = str(uuid4())
        now = datetime.now(UTC).isoformat()
        try:
            with self.database.connect() as connection:
                # Serialize color allocation so simultaneous creates do not pick the same unused hue.
                connection.execute("SELECT pg_advisory_xact_lock(725498105)")
                usage = {
                    row["graph_color"]: row["count"]
                    for row in connection.execute(
                        "SELECT graph_color,count(*) AS count FROM courses GROUP BY graph_color"
                    )
                }
                color = min(COURSE_GRAPH_COLORS, key=lambda value: usage.get(value, 0))
                secret = values.get("dify_api_key")
                encrypted = self.cipher.encrypt(secret.get_secret_value()) if secret else None
                connection.execute(
                    """INSERT INTO courses(id,title,description,active,graph_color,completion_threshold,
                    dify_api_base_url,dify_api_key_encrypted,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (
                        course_id,
                        values["title"],
                        values["description"],
                        int(values["active"]),
                        color,
                        values.get("completion_threshold", 80),
                        values.get("dify_api_base_url", "https://api.dify.ai/v1"),
                        encrypted,
                        now,
                        now,
                    ),
                )
        except UniqueViolation:
            raise CourseConflictError() from None
        return self.get(course_id)

    def update(self, course_id, values):
        # Column names come only from the validated request's fixed allowlist.
        allowed = {"title", "description", "active", "completion_threshold", "dify_api_base_url", "dify_api_key"}
        if not values or not set(values) <= allowed:
            raise ValueError("Invalid course update fields")
        values = dict(values)
        secret = values.pop("dify_api_key", None)
        if secret:
            values["dify_api_key_encrypted"] = self.cipher.encrypt(secret.get_secret_value())
        if not values:
            return self.get(course_id)
        values["updated_at"] = datetime.now(UTC).isoformat()
        if "active" in values:
            values["active"] = int(values["active"])
        assignments = ", ".join(f"{name}=?" for name in values)
        with self.database.connect() as connection:
            previous = connection.execute("SELECT completion_threshold FROM courses WHERE id=? FOR UPDATE", (str(course_id),)).fetchone()
            if previous is None:
                raise CourseNotFoundError()
            row = connection.execute(
                f"UPDATE courses SET {assignments} WHERE id=? RETURNING id",
                (*values.values(), str(course_id)),
            ).fetchone()
            if row is None:
                raise CourseNotFoundError()
            if "completion_threshold" in values and values["completion_threshold"] != previous["completion_threshold"]:
                connection.execute("""UPDATE student_topic_states s SET
                    status=CASE WHEN s.latest_score>? THEN 'mastered' ELSE 'learning' END,
                    mastered_at=CASE WHEN s.latest_score>? THEN coalesce(s.mastered_at,?) ELSE NULL END,
                    updated_at=? FROM curriculum_topics t
                    WHERE t.id=s.topic_id AND t.course=? AND s.latest_score IS NOT NULL""",
                    (values["completion_threshold"], values["completion_threshold"], values["updated_at"],
                     values["updated_at"], str(course_id)))
        return self.get(course_id)

    def delete(self, course_id):
        with self.database.connect() as connection:
            delete_course(connection, course_id)
