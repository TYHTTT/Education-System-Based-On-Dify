from datetime import datetime, timezone
from uuid import uuid4

from psycopg.errors import UniqueViolation

from app.core.exceptions import CourseNotFoundError, CourseConflictError
from app.db.database import PostgresDatabase
from app.services.curriculum_cleanup import delete_course


# Prefer distinct saturated hues before reusing a color in larger catalogs.
COURSE_GRAPH_COLORS = (
    "#2563eb", "#c2410c", "#047857", "#9333ea",
    "#be185d", "#0e7490", "#a16207", "#475569",
)


COURSE_SELECT = """SELECT c.*,
    (SELECT count(*) FROM curriculum_topics t WHERE t.course=c.id AND t.active=1) AS topic_count,
    (SELECT count(*) FROM course_chapters ch WHERE ch.course_id=c.id) AS stage_count
    FROM courses c"""


class CourseRepository:
    def __init__(self, database_url: str):
        self.database = PostgresDatabase(database_url)

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
            total = connection.execute(f"SELECT count(*) AS count FROM courses c WHERE {where}", tuple(parameters)).fetchone()["count"]
            query_sql = COURSE_SELECT + f" WHERE {where} ORDER BY c.title,c.id"
            if not public:
                query_sql += " LIMIT ? OFFSET ?"
                parameters.extend([page_size, (page - 1) * page_size])
            items = [dict(row) for row in connection.execute(query_sql, tuple(parameters))]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    def get(self, course_id, *, detail=False):
        with self.database.connect() as connection:
            row = connection.execute(COURSE_SELECT + " WHERE c.id=?", (str(course_id),)).fetchone()
            if row is None:
                raise CourseNotFoundError()
            result = dict(row)
            if detail:
                result["topics"] = [dict(topic) for topic in connection.execute(
                    "SELECT id,title,stage,stage_title,active FROM curriculum_topics WHERE course=? ORDER BY stage,order_index",
                    (str(course_id),),
                )]
        return result

    def create(self, values):
        course_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()
        try:
            with self.database.connect() as connection:
                # Serialize color allocation so simultaneous creates do not pick the same unused hue.
                connection.execute("SELECT pg_advisory_xact_lock(725498105)")
                usage = {row["graph_color"]: row["count"] for row in connection.execute(
                    "SELECT graph_color,count(*) AS count FROM courses GROUP BY graph_color")}
                color = min(COURSE_GRAPH_COLORS, key=lambda value: usage.get(value, 0))
                connection.execute("""INSERT INTO courses(id,title,description,active,graph_color,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?)""", (course_id, values["title"], values["description"],
                    int(values["active"]), color, now, now))
        except UniqueViolation:
            raise CourseConflictError() from None
        return self.get(course_id)

    def update(self, course_id, values):
        # Column names come only from the validated request's fixed allowlist.
        allowed = {"title", "description", "active"}
        if not values or not set(values) <= allowed:
            raise ValueError("Invalid course update fields")
        values = {**values, "updated_at": datetime.now(timezone.utc).isoformat()}
        if "active" in values:
            values["active"] = int(values["active"])
        assignments = ", ".join(f"{name}=?" for name in values)
        with self.database.connect() as connection:
            row = connection.execute(f"UPDATE courses SET {assignments} WHERE id=? RETURNING id",
                                     (*values.values(), str(course_id))).fetchone()
            if row is None:
                raise CourseNotFoundError()
        return self.get(course_id)

    def delete(self, course_id):
        with self.database.connect() as connection:
            delete_course(connection, course_id)
