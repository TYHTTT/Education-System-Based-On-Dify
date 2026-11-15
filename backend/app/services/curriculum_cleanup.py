"""Permanent curriculum deletion inside the caller's database transaction."""

from app.core.exceptions import CourseNotFoundError


def delete_topics(connection, topic_ids):
    if not topic_ids:
        return
    connection.execute(
        "SELECT id FROM curriculum_topics WHERE id=ANY(?) ORDER BY id FOR UPDATE",
        (topic_ids,),
    ).fetchall()
    connection.execute(
        "DELETE FROM student_topic_states WHERE topic_id=ANY(?)", (topic_ids,)
    )
    connection.execute(
        "DELETE FROM topic_relations WHERE topic_a_id=ANY(?) OR topic_b_id=ANY(?)",
        (topic_ids, topic_ids),
    )
    connection.execute("DELETE FROM curriculum_topics WHERE id=ANY(?)", (topic_ids,))


def delete_course(connection, course_id):
    # Match relation and chapter edits: graph lock, course lock, then child locks.
    connection.execute("SELECT pg_advisory_xact_lock(725498104)")
    course_id = str(course_id)
    row = connection.execute(
        "SELECT id FROM courses WHERE id=? FOR UPDATE", (course_id,)
    ).fetchone()
    if row is None:
        raise CourseNotFoundError()
    topics = connection.execute(
        "SELECT id FROM curriculum_topics WHERE course=? ORDER BY id", (course_id,)
    ).fetchall()
    delete_topics(connection, [topic["id"] for topic in topics])
    connection.execute("DELETE FROM course_chapters WHERE course_id=?", (course_id,))
    connection.execute("DELETE FROM courses WHERE id=?", (course_id,))
