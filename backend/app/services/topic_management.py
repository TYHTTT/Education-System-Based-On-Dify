import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException

from app.core.exceptions import CourseNotFoundError, TopicNotFoundError
from app.db.database import PostgresDatabase
from app.services.curriculum_cleanup import delete_topics


def fail(message, status=409):
    raise HTTPException(status_code=status, detail=message)


class TopicManagement:
    def __init__(self, database_url):
        self.database = PostgresDatabase(database_url)

    @staticmethod
    def _now():
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _course(connection, course, *, lock=False):
        row = connection.execute(
            "SELECT * FROM courses WHERE id=?" + (" FOR UPDATE" if lock else ""),
            (str(course),),
        ).fetchone()
        if row is None:
            raise CourseNotFoundError()
        return dict(row)

    @staticmethod
    def _owned(connection, course, topic_id):
        row = connection.execute(
            "SELECT * FROM curriculum_topics WHERE id=?", (topic_id,)
        ).fetchone()
        if row is None:
            raise TopicNotFoundError()
        if row["course"] != str(course):
            fail("只能在知识点所属课程编辑其内容。", 403)
        return dict(row)

    @staticmethod
    def _chapter(connection, course, chapter_id):
        row = connection.execute(
            "SELECT * FROM course_chapters WHERE id=? AND course_id=?",
            (chapter_id, str(course)),
        ).fetchone()
        if row is None:
            fail("章节不存在或不属于当前课程，请刷新目录后重试。", 404)
        return dict(row)

    @staticmethod
    def _related(connection, topic_ids):
        result = {topic_id: [] for topic_id in topic_ids}
        if not topic_ids:
            return result
        rows = connection.execute(
            """SELECT e.topic_a_id,e.topic_b_id,t.id,t.title,t.course,c.title AS course_title,
            c.active AS course_active,t.chapter_id,ch.title AS chapter_title
            FROM topic_relations e
            CROSS JOIN LATERAL (VALUES (e.topic_a_id,e.topic_b_id),(e.topic_b_id,e.topic_a_id)) AS pair(topic_id,related_id)
            JOIN curriculum_topics t ON t.id=pair.related_id JOIN courses c ON c.id=t.course
            JOIN course_chapters ch ON ch.id=t.chapter_id AND ch.course_id=t.course
            WHERE e.relation_type='related' AND pair.topic_id=ANY(?) ORDER BY t.title,t.id""",
            (topic_ids,),
        ).fetchall()
        for row in rows:
            source = (
                row["topic_b_id"]
                if row["id"] == row["topic_a_id"]
                else row["topic_a_id"]
            )
            result[source].append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "course": row["course"],
                    "course_title": row["course_title"],
                    "course_active": bool(row["course_active"]),
                    "chapter_id": row["chapter_id"],
                    "chapter_title": row["chapter_title"],
                }
            )
        return result

    @staticmethod
    def _save_related(connection, topic_id, ids):
        if topic_id in ids:
            fail("不能将知识点自身设为相关知识点。", 422)
        old = {
            item["id"]
            for item in TopicManagement._related(connection, [topic_id])[topic_id]
        }
        added = list(set(ids) - old)
        if added:
            valid = connection.execute(
                """SELECT t.id FROM curriculum_topics t JOIN courses c ON c.id=t.course
                WHERE t.id=ANY(?)""",
                (added,),
            ).fetchall()
            if len(valid) != len(added):
                fail("部分相关知识点已不存在，请刷新后重试。", 422)
        connection.execute(
            """DELETE FROM topic_relations WHERE relation_type='related'
            AND ((topic_a_id=? AND NOT(topic_b_id=ANY(?))) OR (topic_b_id=? AND NOT(topic_a_id=ANY(?))))""",
            (topic_id, ids, topic_id, ids),
        )
        for target in ids:
            connection.execute(
                """INSERT INTO topic_relations(topic_a_id,topic_b_id)
                VALUES (LEAST(?::text,?::text),GREATEST(?::text,?::text)) ON CONFLICT DO NOTHING""",
                (topic_id, target, topic_id, target),
            )

    def related_candidates(
        self, query="", course=None, exclude=None, page=1, page_size=30
    ):
        query = query.strip()
        with self.database.connect() as connection:
            courses = [
                dict(row)
                for row in connection.execute(
                    "SELECT id,title,active FROM courses ORDER BY title,id"
                )
            ]
            if not query:
                return {
                    "items": [],
                    "courses": [
                        {**item, "active": bool(item["active"])} for item in courses
                    ],
                    "total": 0,
                    "page": page,
                    "page_size": page_size,
                }
            where = (
                "(t.title ILIKE ? OR t.id ILIKE ? OR c.title ILIKE ?)"
            )
            params = [f"%{query}%"] * 3
            if course is not None:
                where += " AND t.course=?"
                params.append(str(course))
            if exclude is not None:
                where += " AND t.id<>?"
                params.append(exclude)
            total = connection.execute(
                "SELECT count(*) AS n FROM curriculum_topics t JOIN courses c ON c.id=t.course WHERE "
                + where,
                params,
            ).fetchone()["n"]
            rows = connection.execute(
                """SELECT t.id,t.title,t.course,c.title AS course_title,c.active AS course_active,
                t.chapter_id,ch.title AS chapter_title
                FROM curriculum_topics t JOIN courses c ON c.id=t.course
                JOIN course_chapters ch ON ch.id=t.chapter_id AND ch.course_id=t.course WHERE """
                + where
                + " ORDER BY c.title,c.id,ch.sort_order,t.order_index,t.id LIMIT ? OFFSET ?",
                (*params, page_size, (page - 1) * page_size),
            ).fetchall()
        return {
            "items": [
                {
                    **dict(row),
                    "course_active": bool(row["course_active"]),
                }
                for row in rows
            ],
            "courses": [
                {**course, "active": bool(course["active"])} for course in courses
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def outline(self, course):
        with self.database.connect() as connection:
            record = self._course(connection, course)
            chapters = connection.execute(
                "SELECT id,title,sort_order FROM course_chapters WHERE course_id=? ORDER BY sort_order,id",
                (str(course),),
            ).fetchall()
            rows = connection.execute(
                """SELECT t.*,ch.sort_order AS stage,ch.title AS stage_title
                FROM curriculum_topics t
                JOIN course_chapters ch ON ch.id=t.chapter_id AND ch.course_id=t.course
                WHERE t.course=? ORDER BY ch.sort_order,t.order_index,t.id""",
                (str(course),),
            ).fetchall()
            related = self._related(connection, [row["id"] for row in rows])
        groups = {
            chapter["id"]: {**dict(chapter), "topics": []} for chapter in chapters
        }
        for raw in rows:
            item = dict(raw)
            for key in ("learning_objectives",):
                item[key] = json.loads(item.pop(key + "_json"))
            item["related_topics"] = related[item["id"]]
            item["related_topic_ids"] = [
                topic["id"] for topic in item["related_topics"]
            ]
            group = groups.setdefault(
                item["chapter_id"],
                {
                    "id": item["chapter_id"],
                    "title": item["stage_title"],
                    "sort_order": item["stage"],
                    "topics": [],
                },
            )
            group["topics"].append(item)
        return {
            "course": {
                "id": record["id"],
                "title": record["title"],
                "active": bool(record["active"]),
            },
            "groups": sorted(groups.values(), key=lambda group: (group["sort_order"], group["id"])),
        }

    def create_chapter(self, course, title):
        return self.create_chapters(course, [title])

    def create_chapters(self, course, titles):
        with self.database.connect() as connection:
            self._course(connection, course, lock=True)
            order = connection.execute(
                "SELECT coalesce(max(sort_order),0)+1 AS position FROM course_chapters WHERE course_id=?",
                (str(course),),
            ).fetchone()["position"]
            connection.executemany(
                "INSERT INTO course_chapters(id,course_id,sort_order,title) VALUES (?,?,?,?)",
                [
                    (str(uuid4()), str(course), order + index, title)
                    for index, title in enumerate(titles)
                ],
            )
            connection.execute(
                "UPDATE courses SET updated_at=? WHERE id=?", (self._now(), str(course))
            )
        return self.outline(course)

    def create_topics(self, course, chapter_id, titles):
        with self.database.connect() as connection:
            self._course(connection, course, lock=True)
            self._chapter(connection, course, chapter_id)
            position = connection.execute(
                """SELECT coalesce(max(order_index),0)+1 AS position
                FROM curriculum_topics WHERE course=? AND chapter_id=?""",
                (str(course), chapter_id),
            ).fetchone()["position"]
            now = self._now()
            topics = []
            for index, title in enumerate(titles):
                topic_id = f"{course}.t_{uuid4().hex[:12]}"
                order = position + index
                topics.append(
                    (
                        topic_id,
                        str(course),
                        chapter_id,
                        title,
                        order,
                        "",
                        "[]",
                        now,
                        now,
                    )
                )
            connection.executemany(
                """INSERT INTO curriculum_topics(id,course,chapter_id,title,
                order_index,description,learning_objectives_json,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                topics,
            )
            connection.execute(
                "UPDATE courses SET updated_at=? WHERE id=?", (now, str(course))
            )
        return self.outline(course)

    def save(self, course, values, topic_id=None):
        with self.database.connect() as connection:
            if values.get("related_topic_ids") is not None:
                connection.execute("SELECT pg_advisory_xact_lock(725498104)")
            self._course(connection, course, lock=True)
            if topic_id:
                existing = self._owned(connection, course, topic_id)
            else:
                existing = None
                topic_id = f"{course}.t_{uuid4().hex[:12]}"
            chapter = self._chapter(connection, course, values["chapter_id"])
            now = self._now()
            if existing and existing["chapter_id"] == chapter["id"]:
                position = existing["order_index"]
            else:
                position = connection.execute(
                    "SELECT coalesce(max(order_index),0)+1 AS position FROM curriculum_topics WHERE course=? AND chapter_id=?",
                    (str(course), chapter["id"]),
                ).fetchone()["position"]
            if not existing:
                connection.execute(
                    """INSERT INTO curriculum_topics(id,course,chapter_id,title,order_index,description,
                    learning_objectives_json,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?)""",
                    (
                        topic_id,
                        str(course),
                        chapter["id"],
                        values["title"],
                        position,
                        values["description"],
                        json.dumps(values["learning_objectives"]),
                        now,
                        now,
                    ),
                )
            else:
                connection.execute(
                    """UPDATE curriculum_topics SET title=?,chapter_id=?,order_index=?,description=?,learning_objectives_json=?,
                    updated_at=? WHERE id=?""",
                    (
                        values["title"],
                        chapter["id"],
                        position,
                        values["description"],
                        json.dumps(values["learning_objectives"]),
                        now,
                        topic_id,
                    ),
                )
            if values.get("related_topic_ids") is not None:
                self._save_related(connection, topic_id, values["related_topic_ids"])
            connection.execute(
                "UPDATE courses SET updated_at=? WHERE id=?", (now, str(course))
            )
        return self.outline(course)

    def remove(self, course, topic_id):
        with self.database.connect() as connection:
            # Use the same lock order as relation edits, including cross-course edges.
            connection.execute("SELECT pg_advisory_xact_lock(725498104)")
            self._course(connection, course, lock=True)
            self._owned(connection, course, topic_id)
            delete_topics(connection, [topic_id])
            connection.execute(
                "UPDATE courses SET updated_at=? WHERE id=?", (self._now(), str(course))
            )
        return self.outline(course)

    def remove_chapter(self, course, chapter_id, title, topic_ids):
        with self.database.connect() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(725498104)")
            self._course(connection, course, lock=True)
            chapter = self._chapter(connection, course, chapter_id)
            rows = connection.execute(
                "SELECT id FROM curriculum_topics WHERE course=? AND chapter_id=? ORDER BY id",
                (str(course), chapter_id),
            ).fetchall()
            if {row["id"] for row in rows} != set(topic_ids) or chapter[
                "title"
            ] != title:
                fail("章节名称或知识点已变化，请刷新目录后重新确认删除。")
            delete_topics(connection, [row["id"] for row in rows])
            connection.execute(
                "DELETE FROM course_chapters WHERE id=? AND course_id=?",
                (chapter_id, str(course)),
            )
            connection.execute(
                "UPDATE courses SET updated_at=? WHERE id=?", (self._now(), str(course))
            )
        return self.outline(course)

    def reorder(self, course, group_id, ids):
        with self.database.connect() as connection:
            self._course(connection, course, lock=True)
            self._chapter(connection, course, group_id)
            rows = connection.execute(
                """SELECT id AS topic_id FROM curriculum_topics
                WHERE course=? AND chapter_id=?""",
                (str(course), group_id),
            ).fetchall()
            if set(ids) != {row["topic_id"] for row in rows}:
                fail("目录已变化，请刷新后重新排序。")
            for position, topic_id in enumerate(ids, 1):
                connection.execute(
                    "UPDATE curriculum_topics SET order_index=?,updated_at=? WHERE id=?",
                    (position, self._now(), topic_id),
                )
        return self.outline(course)

    def rename_chapter(self, course, chapter_id, title):
        with self.database.connect() as connection:
            self._course(connection, course, lock=True)
            self._chapter(connection, course, chapter_id)
            connection.execute(
                "UPDATE course_chapters SET title=? WHERE id=? AND course_id=?",
                (title, chapter_id, str(course)),
            )
            connection.execute(
                "UPDATE courses SET updated_at=? WHERE id=?", (self._now(), str(course))
            )
        return self.outline(course)

    def reorder_chapters(self, course, ids):
        with self.database.connect() as connection:
            self._course(connection, course, lock=True)
            groups = connection.execute(
                "SELECT id FROM course_chapters WHERE course_id=?", (str(course),)
            ).fetchall()
            if set(ids) != {group["id"] for group in groups}:
                fail("章节已变化，请刷新后重新排序。")
            now = self._now()
            for position, chapter_id in enumerate(ids, 1):
                connection.execute(
                    "UPDATE course_chapters SET sort_order=? WHERE id=? AND course_id=?",
                    (position, chapter_id, str(course)),
                )
            connection.execute(
                "UPDATE courses SET updated_at=? WHERE id=?", (now, str(course))
            )
        return self.outline(course)
