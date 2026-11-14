"""Permanent curriculum deletion inside the caller's database transaction."""

from app.core.exceptions import CourseNotFoundError


def delete_practice_sets(connection, set_ids):
    if not set_ids:
        return
    # Block new questions/submissions while their parents are being deleted.
    connection.execute("SELECT id FROM practice_sets WHERE id=ANY(?) ORDER BY id FOR UPDATE", (set_ids,)).fetchall()
    connection.execute("SELECT id FROM practice_questions WHERE practice_set_id=ANY(?) ORDER BY id FOR UPDATE", (set_ids,)).fetchall()
    # Attempts restrict question deletion, including attempts in other submissions.
    connection.execute("""DELETE FROM practice_attempts WHERE question_id IN
        (SELECT id FROM practice_questions WHERE practice_set_id=ANY(?))""", (set_ids,))
    # Sets cascade to questions, submissions, their attempts and error records.
    connection.execute("DELETE FROM practice_sets WHERE id=ANY(?)", (set_ids,))


def delete_topics(connection, topic_ids):
    if not topic_ids:
        return
    connection.execute("SELECT id FROM curriculum_topics WHERE id=ANY(?) ORDER BY id FOR UPDATE", (topic_ids,)).fetchall()
    sets = connection.execute("SELECT id FROM practice_sets WHERE topic_id=ANY(?)", (topic_ids,)).fetchall()
    delete_practice_sets(connection, [row["id"] for row in sets])
    connection.execute("DELETE FROM misconception_events WHERE topic_id=ANY(?)", (topic_ids,))
    connection.execute("DELETE FROM student_dimension_states WHERE topic_id=ANY(?)", (topic_ids,))
    connection.execute("DELETE FROM student_topic_states WHERE topic_id=ANY(?)", (topic_ids,))
    # Explicit deletion avoids leaving SET NULL sessions behind.
    connection.execute("DELETE FROM learning_sessions WHERE topic_id=ANY(?)", (topic_ids,))
    connection.execute("DELETE FROM topic_relations WHERE topic_a_id=ANY(?) OR topic_b_id=ANY(?)", (topic_ids, topic_ids))
    connection.execute("DELETE FROM topic_placements WHERE topic_id=ANY(?)", (topic_ids,))
    connection.execute("DELETE FROM curriculum_topics WHERE id=ANY(?)", (topic_ids,))


def delete_course(connection, course_id):
    # Match relation and chapter edits: graph lock, course lock, then child locks.
    connection.execute("SELECT pg_advisory_xact_lock(725498104)")
    course_id = str(course_id)
    row = connection.execute("SELECT id FROM courses WHERE id=? FOR UPDATE", (course_id,)).fetchone()
    if row is None:
        raise CourseNotFoundError()
    topics = connection.execute("SELECT id FROM curriculum_topics WHERE course=? ORDER BY id", (course_id,)).fetchall()
    delete_topics(connection, [topic["id"] for topic in topics])
    # Include historical course records with missing or inconsistent topic scopes.
    sets = connection.execute("SELECT id FROM practice_sets WHERE course=?", (course_id,)).fetchall()
    delete_practice_sets(connection, [item["id"] for item in sets])
    connection.execute("DELETE FROM learning_sessions WHERE course=?", (course_id,))
    connection.execute("DELETE FROM topic_placements WHERE course_id=?", (course_id,))
    connection.execute("DELETE FROM course_chapters WHERE course_id=?", (course_id,))
    connection.execute("DELETE FROM courses WHERE id=?", (course_id,))
