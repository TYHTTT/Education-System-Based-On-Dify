from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.exceptions import AdminUnauthorizedError, StudentNotFoundError
from app.main import create_app
from app.services.learning_repository import LearningRepository
from tests.mocks import MockLLMClient

STUDENT_ID = "00000000-0000-4000-8000-000000000001"
HEADERS = {"Authorization": "Bearer admin-session"}


class FakeAdmins:
    def from_token(self, token):
        if token != "admin-session":
            raise AdminUnauthorizedError()
        return {"id": "admin-one"}


class FakeStudents:
    def __init__(self):
        self.calls = []
        self.students = {
            STUDENT_ID: {
                "student_id": STUDENT_ID,
                "username": "student_001",
                "display_name": "测试学生",
                "active": True,
                "created_at": "2026-11-16T08:00:00+00:00",
                "last_active_at": "2026-11-16T09:00:00+00:00",
                "password_hash": "must-not-be-returned",
                "access_token": "must-not-be-returned",
            }
        }

    def list_students(self, *, query, page, page_size):
        self.calls.append(("list", query, page, page_size))
        return {
            "items": list(self.students.values()),
            "total": len(self.students),
            "page": page,
            "page_size": page_size,
        }

    def delete_student(self, student_id):
        self.calls.append(("delete", student_id))
        return self.students.pop(student_id, None) is not None


@pytest.fixture
def api():
    students = FakeStudents()
    app = create_app(
        Settings(_env_file=None, app_env="test"),
        llm_client=MockLLMClient(),
        learning_repository=students,
        admin_repository=FakeAdmins(),
    )
    with TestClient(app) as client:
        yield client, students


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/v1/admin/students"),
        ("DELETE", f"/api/v1/admin/students/{STUDENT_ID}"),
    ],
)
@pytest.mark.parametrize(
    "authorization",
    [None, "Basic admin-session", "Bearer student-session", "Bearer invalid"],
)
def test_student_management_requires_admin(api, method, path, authorization):
    client, students = api
    headers = {"Authorization": authorization} if authorization else {}
    assert client.request(method, path, headers=headers).status_code == 401
    assert students.calls == []
    assert STUDENT_ID in students.students


def test_list_students_returns_only_public_profile_and_passes_filters(api):
    client, students = api
    response = client.get(
        "/api/v1/admin/students",
        params={"q": "测试_%", "page": 2, "page_size": 5},
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert students.calls == [("list", "测试_%", 2, 5)]
    body = response.json()
    assert (body["total"], body["page"], body["page_size"]) == (1, 2, 5)
    assert set(body["items"][0]) == {
        "student_id",
        "username",
        "display_name",
        "active",
        "created_at",
        "last_active_at",
    }
    assert "must-not-be-returned" not in response.text


@pytest.mark.parametrize(
    "params", [{"page": 0}, {"page_size": 0}, {"page_size": 51}, {"q": "a" * 101}]
)
def test_list_rejects_invalid_pagination_and_search(api, params):
    client, students = api
    assert (
        client.get("/api/v1/admin/students", params=params, headers=HEADERS).status_code
        == 422
    )
    assert students.calls == []


def test_delete_student_removes_only_selected_account_and_returns_404_on_repeat(api):
    client, students = api
    response = client.delete(f"/api/v1/admin/students/{STUDENT_ID}", headers=HEADERS)
    assert response.status_code == 204
    assert response.content == b""
    assert students.calls == [("delete", STUDENT_ID)]
    assert client.get("/api/v1/admin/students", headers=HEADERS).json()["items"] == []
    missing = client.delete(f"/api/v1/admin/students/{STUDENT_ID}", headers=HEADERS)
    assert missing.status_code == 404
    assert missing.json()["error"]["message"] == "学生账号不存在或已删除"


def test_delete_rejects_invalid_id_before_accessing_repository(api):
    client, students = api
    assert (
        client.delete("/api/v1/admin/students/not-an-id", headers=HEADERS).status_code
        == 422
    )
    assert students.calls == []


def test_deletion_revokes_sessions_removes_learning_and_preserves_logs(
    postgres_test_database_url,
):
    repository = LearningRepository(postgres_test_database_url)
    student = repository.register_student(
        username="delete_me", password="test-password", display_name="待删除学生"
    )
    other = repository.register_student(
        username="keep_me", password="test-password", display_name="保留学生"
    )
    second_session = repository.authenticate_student(
        username="delete_me", password="test-password"
    )
    log_id = str(uuid4())
    with repository.database.connect() as connection:
        connection.execute("""INSERT INTO course_chapters(id,course_id,sort_order,title)
            VALUES ('delete-test-chapter','machine_learning',1,'测试章节')""")
        connection.execute("""INSERT INTO curriculum_topics(id,course,chapter_id,title,order_index,
            description,learning_objectives_json,created_at,updated_at) VALUES
            ('ml.delete_test','machine_learning','delete-test-chapter','测试知识点',1,'','[]','2026-11-16','2026-11-16')""")
        for account in (student, other):
            connection.execute(
                """INSERT INTO student_topic_states(student_id,topic_id,status,updated_at)
                VALUES (?,'ml.delete_test','learning','2026-11-16')""",
                (account["id"],),
            )
        connection.execute(
            """INSERT INTO dify_call_logs(id,request_id,student_id,business_type,
            is_anonymous,started_at,status) VALUES (?,?,?,'free_qa',FALSE,CURRENT_TIMESTAMP,'in_progress')""",
            (log_id, str(uuid4()), student["id"]),
        )
        original_log = dict(
            connection.execute(
                "SELECT * FROM dify_call_logs WHERE id=?", (log_id,)
            ).fetchone()
        )

    assert repository.delete_student(student["id"])
    assert repository.get_student(student["id"]) is None
    assert (
        repository.authenticate_student(username="delete_me", password="test-password")
        is None
    )
    for account in (student, second_session):
        with pytest.raises(StudentNotFoundError):
            repository.student_from_token(account["access_token"])
    assert repository.student_from_token(other["access_token"])["id"] == other["id"]
    with repository.database.connect() as connection:
        assert (
            connection.execute(
                "SELECT count(*) AS n FROM student_sessions WHERE student_id=?",
                (student["id"],),
            ).fetchone()["n"]
            == 0
        )
        assert (
            connection.execute(
                "SELECT count(*) AS n FROM student_topic_states WHERE student_id=?",
                (student["id"],),
            ).fetchone()["n"]
            == 0
        )
        assert (
            connection.execute(
                "SELECT count(*) AS n FROM student_topic_states WHERE student_id=?",
                (other["id"],),
            ).fetchone()["n"]
            == 1
        )
        assert (
            dict(
                connection.execute(
                    "SELECT * FROM dify_call_logs WHERE id=?", (log_id,)
                ).fetchone()
            )
            == original_log
        )
    assert not repository.delete_student(student["id"])
    assert (
        repository.register_student(
            username="delete_me", password="new-password", display_name="新账号"
        )["id"]
        != student["id"]
    )


def test_database_student_search_is_literal_and_paginated(postgres_test_database_url):
    repository = LearningRepository(postgres_test_database_url)
    for username, name in [
        ("test_001", "张三"),
        ("test_002", "李四"),
        ("other", "王五"),
    ]:
        repository.register_student(
            username=username, password="test-password", display_name=name
        )
    first = repository.list_students(query="TEST_", page_size=1)
    second = repository.list_students(query="test_", page=2, page_size=1)
    assert first["total"] == second["total"] == 2
    assert first["items"][0]["student_id"] != second["items"][0]["student_id"]
    assert repository.list_students(query="三")["total"] == 1
    assert repository.list_students(query="% ")["total"] == 0
    assert repository.list_students(query="  ")["total"] == 3
