import pytest
from fastapi.testclient import TestClient
from psycopg.errors import UniqueViolation

from app.core.config import Settings
from app.core.exceptions import AdminUnauthorizedError, StudentNotFoundError
from app.core.security import verify_password
from app.main import create_app
from tests.mocks import MockLLMClient


class Accounts:
    def __init__(self, role):
        self.role = role
        self.token = role + "-session"
        self.valid = True
        self.calls = []
        self.account = {
            "id": role + "-one",
            "username": role + "_test",
            "display_name": "测试用户",
            "created_at": "2026-11-16T08:00:00+00:00",
            "last_active_at": "2026-11-16T08:00:00+00:00",
        }

    def from_token(self, token):
        if not self.valid or token != self.token:
            raise AdminUnauthorizedError()
        return dict(self.account)

    def student_from_token(self, token):
        if not self.valid or token != self.token:
            raise StudentNotFoundError()
        return dict(self.account)

    def update_profile(self, *, token, username, display_name):
        self.from_token(token)
        return self.update(username, display_name)

    def update_student_profile(self, *, token, username, display_name):
        self.student_from_token(token)
        return self.update(username, display_name)

    def update(self, username, display_name):
        self.calls.append((username, display_name))
        if username == "taken_name":
            raise UniqueViolation()
        self.account.update(username=username, display_name=display_name)
        return {**self.account, "password_hash": "private-hash"}

    def change_student_password(self, *, token, current_password, new_password):
        self.student_from_token(token)
        self.calls.append((current_password, new_password))
        if current_password != "old-password":
            return False
        self.valid = False
        return True


@pytest.fixture
def api():
    students, admins = Accounts("student"), Accounts("admin")
    app = create_app(
        Settings(_env_file=None, app_env="test"),
        llm_client=MockLLMClient(),
        learning_repository=students,
        admin_repository=admins,
    )
    with TestClient(app) as client:
        yield client, students, admins


@pytest.mark.parametrize(
    "role,path", [("student", "/api/v1/students/me"), ("admin", "/api/v1/admins/me")]
)
def test_profile_update_normalizes_and_returns_only_public_fields(api, role, path):
    client, students, admins = api
    response = client.patch(
        path,
        json={"username": " New_Name ", "display_name": " 新姓名 "},
        headers={"Authorization": f"Bearer {role}-session"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "new_name"
    assert response.json()["display_name"] == "新姓名"
    assert (
        "password_hash" not in response.json() and "access_token" not in response.json()
    )
    repository = students if role == "student" else admins
    assert repository.valid and repository.calls == [("new_name", "新姓名")]
    conflict = client.patch(
        path,
        json={"username": "taken_name", "display_name": "不应保存"},
        headers={"Authorization": f"Bearer {role}-session"},
    )
    assert conflict.status_code == 409
    assert repository.account["username"] == "new_name"
    assert repository.account["display_name"] == "新姓名"


@pytest.mark.parametrize(
    "role,path", [("student", "/api/v1/students/me"), ("admin", "/api/v1/admins/me")]
)
@pytest.mark.parametrize(
    "payload",
    [
        {"username": "ab", "display_name": "姓名"},
        {"username": "valid_name", "display_name": " "},
        {"username": "invalid,name", "display_name": "姓名"},
        {"username": "valid_name", "display_name": "名" * 65},
        {
            "username": "valid_name",
            "display_name": "姓名",
            "student_id": "another-user",
        },
    ],
)
def test_invalid_or_targeted_profile_updates_do_not_write(api, role, path, payload):
    client, students, admins = api
    assert (
        client.patch(
            path, json=payload, headers={"Authorization": f"Bearer {role}-session"}
        ).status_code
        == 422
    )
    assert students.calls == [] and admins.calls == []


@pytest.mark.parametrize(
    "path,authorization,status",
    [
        ("/api/v1/admins/me", None, 401),
        ("/api/v1/admins/me", "Bearer student-session", 401),
        ("/api/v1/students/me", "Bearer admin-session", 404),
        ("/api/v1/students/me", "Bearer invalid", 404),
    ],
)
def test_profile_updates_require_matching_role_credentials(
    api, path, authorization, status
):
    client, students, admins = api
    headers = {"Authorization": authorization} if authorization else {}
    assert (
        client.patch(
            path,
            json={"username": "new_name", "display_name": "新姓名"},
            headers=headers,
        ).status_code
        == status
    )
    assert students.calls == [] and admins.calls == []


def test_student_password_checks_current_password_and_revokes_session(api):
    client, students, admins = api
    headers = {"Authorization": "Bearer student-session"}
    payload = {"current_password": "wrong-password", "new_password": "new-password"}
    assert (
        client.put(
            "/api/v1/students/me/password", json=payload, headers=headers
        ).status_code
        == 403
    )
    assert students.valid
    changed = client.put(
        "/api/v1/students/me/password",
        json={**payload, "current_password": "old-password"},
        headers=headers,
    )
    assert changed.status_code == 204 and changed.content == b""
    assert not students.valid and admins.valid
    assert client.get("/api/v1/students/me", headers=headers).status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"current_password": "old-password", "new_password": "short"},
        {"current_password": "", "new_password": "new-password"},
        {
            "current_password": "old-password",
            "new_password": "new-password",
            "student_id": "other",
        },
    ],
)
def test_invalid_student_password_requests_do_not_write(api, payload):
    client, students, _ = api
    assert (
        client.put(
            "/api/v1/students/me/password",
            json=payload,
            headers={"Authorization": "Bearer student-session"},
        ).status_code
        == 422
    )
    assert students.calls == []


@pytest.mark.parametrize(
    "method,path,payload",
    [
        (
            "PATCH",
            "/api/v1/students/me",
            {"username": "new_name", "display_name": "新姓名"},
        ),
        (
            "PUT",
            "/api/v1/students/me/password",
            {"current_password": "old-password", "new_password": "new-password"},
        ),
    ],
)
def test_admin_preview_cannot_edit_student_identity(api, method, path, payload):
    client, students, admins = api
    assert (
        client.request(
            method,
            path,
            json=payload,
            headers={"Authorization": "Bearer admin-preview:admin-session"},
        ).status_code
        == 403
    )
    assert students.calls == [] and admins.calls == []


def test_database_account_edits_and_student_password_revoke_all_sessions(
    postgres_test_database_url,
):
    app = create_app(
        Settings(
            _env_file=None, app_env="test", database_url=postgres_test_database_url
        ),
        llm_client=MockLLMClient(),
    )
    students, admins = app.state.learning_repository, app.state.admin_repository
    student = students.register_student(
        username="student_one", password="old-password", display_name="学生一"
    )
    second = students.authenticate_student(
        username="student_one", password="old-password"
    )
    other = students.register_student(
        username="student_two", password="other-password", display_name="学生二"
    )
    admin = admins.register(
        username="admin_one", password="admin-password", display_name="管理员"
    )
    with TestClient(app) as client:
        headers = {"Authorization": "Bearer " + student["access_token"]}
        assert (
            client.patch(
                "/api/v1/students/me",
                headers=headers,
                json={"username": "student_new", "display_name": "新学生姓名"},
            ).status_code
            == 200
        )
        assert (
            client.patch(
                "/api/v1/students/me",
                headers=headers,
                json={"username": "student_two", "display_name": "冲突"},
            ).status_code
            == 409
        )
        assert (
            students.authenticate_student(
                username="student_one", password="old-password"
            )
            is None
        )
        assert (
            client.put(
                "/api/v1/students/me/password",
                headers=headers,
                json={
                    "current_password": "old-password",
                    "new_password": "new-password",
                },
            ).status_code
            == 204
        )
        for account in (student, second):
            with pytest.raises(StudentNotFoundError):
                students.student_from_token(account["access_token"])
        assert (
            students.authenticate_student(
                username="student_new", password="old-password"
            )
            is None
        )
        assert (
            students.authenticate_student(
                username="student_new", password="new-password"
            )["id"]
            == student["id"]
        )
        assert students.student_from_token(other["access_token"])["id"] == other["id"]
        admin_headers = {"Authorization": "Bearer " + admin["access_token"]}
        saved = client.patch(
            "/api/v1/admins/me",
            headers=admin_headers,
            json={"username": "admin_new", "display_name": "新管理员姓名"},
        )
        assert saved.status_code == 200
        assert (
            admins.from_token(admin["access_token"])["display_name"] == "新管理员姓名"
        )
        assert admins.login(username="admin_one", password="admin-password") is None
        assert (
            admins.login(username="admin_new", password="admin-password")["id"]
            == admin["id"]
        )


def test_student_login_cannot_issue_session_after_password_changed(
    postgres_test_database_url, monkeypatch
):
    from app.services import learning_repository as module

    students = module.LearningRepository(postgres_test_database_url)
    account = students.register_student(
        username="race_student", password="old-password", display_name="学生"
    )
    verify = module.verify_password
    changed = False

    def concurrent_change(password, encoded):
        nonlocal changed
        result = verify(password, encoded)
        if not changed:
            changed = True
            assert students.change_student_password(
                token=account["access_token"],
                current_password="old-password",
                new_password="new-password",
            )
        return result

    monkeypatch.setattr(module, "verify_password", concurrent_change)
    assert (
        students.authenticate_student(username="race_student", password="old-password")
        is None
    )
    assert (
        students.authenticate_student(username="race_student", password="new-password")
        is not None
    )
