import logging
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from psycopg.errors import UniqueViolation

from app.core.config import Settings
from app.core.exceptions import AdminUnauthorizedError
from app.core.security import hash_password, verify_password
from app.main import create_app
from app.schemas.admin import ChangeAdminPasswordRequest, RegisterAdminRequest
from tests.mocks import MockLLMClient

AUTHCODE = "test-admin-authorization-secret"
PAYLOAD = {
    "username": "admin_test",
    "password": "test-password",
    "display_name": "测试管理员",
    "authcode": AUTHCODE,
}


class FakeAdmins:
    def __init__(self):
        self.register_calls = []
        self.account = {
            "id": "admin-one",
            "username": "admin_test",
            "display_name": "测试管理员",
            "created_at": "2026-11-12T08:00:00+00:00",
            "last_active_at": "2026-11-12T08:00:00+00:00",
            "access_token": "admin-session",
        }
        self.valid = True
        self.deleted = False
        self.delete_calls = []
        self.change_calls = []
        self.password = "test-password"

    def register(self, **kwargs):
        self.register_calls.append(kwargs)
        if len(self.register_calls) > 1:
            raise UniqueViolation()
        return self.account

    def login(self, *, username, password):
        return (
            self.account
            if username == "admin_test"
            and password == self.password
            and not self.deleted
            else None
        )

    def from_token(self, token):
        if token != "admin-session" or not self.valid:
            raise AdminUnauthorizedError()
        return self.account

    def logout(self, token):
        self.valid = False

    def delete_current(self, *, token, password):
        self.delete_calls.append({"token": token, "password": password})
        self.from_token(token)
        if password != self.password:
            return False
        self.deleted = True
        self.valid = False
        return True

    def change_password(self, *, token, current_password, new_password):
        self.change_calls.append(
            {
                "token": token,
                "current_password": current_password,
                "new_password": new_password,
            }
        )
        self.from_token(token)
        if current_password != self.password:
            return False
        self.password = new_password
        self.valid = False
        return True


@pytest.fixture
def api():
    repository = FakeAdmins()
    app = create_app(
        Settings(_env_file=None, app_env="test", admin_authcode=AUTHCODE),
        llm_client=MockLLMClient(),
        learning_repository=object(),
        admin_repository=repository,
    )
    with TestClient(app) as client:
        yield client, repository


@pytest.mark.parametrize("authcode", ["wrong-code", "授权码错误", " " + AUTHCODE])
def test_wrong_authcode_cannot_create_administrator(api, authcode):
    client, repository = api
    response = client.post(
        "/api/v1/admins/register", json={**PAYLOAD, "authcode": authcode}
    )
    assert response.status_code == 403
    assert repository.register_calls == []
    assert AUTHCODE not in response.text


def test_missing_authcode_and_empty_configuration_disable_creation(api):
    client, repository = api
    assert (
        client.post(
            "/api/v1/admins/register",
            json={key: value for key, value in PAYLOAD.items() if key != "authcode"},
        ).status_code
        == 422
    )
    client.app.state.settings = Settings(_env_file=None)
    assert client.post("/api/v1/admins/register", json=PAYLOAD).status_code == 503
    assert repository.register_calls == []
    assert (
        client.post(
            "/api/v1/admins/login",
            json={"username": "admin_test", "password": "test-password"},
        ).status_code
        == 200
    )


def test_register_returns_only_public_profile_and_rejects_duplicate_username(api):
    client, repository = api
    created = client.post("/api/v1/admins/register", json=PAYLOAD)
    assert created.status_code == 201
    assert set(created.json()) == {
        "admin_id",
        "username",
        "display_name",
        "role",
        "created_at",
        "last_active_at",
        "access_token",
    }
    assert created.json()["role"] == "admin"
    assert AUTHCODE not in created.text and PAYLOAD["password"] not in created.text
    assert "authcode" not in repository.register_calls[0]
    assert client.post("/api/v1/admins/register", json=PAYLOAD).status_code == 409


@pytest.mark.parametrize(
    "authorization",
    [None, "Basic admin-session", "Bearer student-session", "Bearer invalid"],
)
def test_protected_admin_route_rejects_missing_invalid_and_student_sessions(
    api, authorization
):
    client, _ = api
    headers = {"Authorization": authorization} if authorization else {}
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 401
    assert client.post("/api/v1/admins/logout", headers=headers).status_code == 401


@pytest.mark.parametrize(
    "authorization",
    [None, "Basic admin-session", "Bearer student-session", "Bearer invalid"],
)
def test_student_account_creation_requires_admin_session(api, authorization):
    client, _ = api
    headers = {"Authorization": authorization} if authorization else {}
    response = client.post(
        "/api/v1/students/register",
        json={
            "username": "allocated_student",
            "password": "initial-password",
            "display_name": "分配的学生",
        },
        headers=headers,
    )
    assert response.status_code == 401


def test_admin_can_allocate_student_account_and_duplicate_is_rejected(api):
    client, _ = api
    calls = []
    payload = {
        "username": "allocated_student",
        "password": "initial-password",
        "display_name": "分配的学生",
    }

    def register_student(**kwargs):
        calls.append(kwargs)
        if len(calls) > 1:
            raise ValueError("username_taken")
        return {
            "id": "student-one",
            "username": kwargs["username"],
            "display_name": kwargs["display_name"],
            "access_token": "allocated-student-session",
            "created_at": "2026-11-16T08:00:00+00:00",
        }

    client.app.state.learning_repository = SimpleNamespace(
        register_student=register_student
    )
    headers = {"Authorization": "Bearer admin-session"}
    created = client.post("/api/v1/students/register", json=payload, headers=headers)
    assert created.status_code == 201
    assert created.json()["username"] == payload["username"]
    assert created.json()["display_name"] == payload["display_name"]
    assert "password" not in created.json()
    assert calls == [payload]
    assert (
        client.post(
            "/api/v1/students/register", json=payload, headers=headers
        ).status_code
        == 409
    )


def test_login_profile_and_logout_revoke_access(api):
    client, _ = api
    assert (
        client.post(
            "/api/v1/admins/login",
            json={"username": "admin_test", "password": "incorrect"},
        ).status_code
        == 401
    )
    login = client.post(
        "/api/v1/admins/login",
        json={"username": "admin_test", "password": "test-password"},
    )
    assert login.status_code == 200
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    profile = client.get("/api/v1/admins/me", headers=headers)
    assert profile.status_code == 200
    assert "access_token" not in profile.json()
    assert client.post("/api/v1/admins/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 401


def test_authcode_and_password_are_not_exposed_in_repr_or_validation_logs(api, caplog):
    request = RegisterAdminRequest.model_validate(PAYLOAD)
    assert AUTHCODE not in repr(request) and PAYLOAD["password"] not in repr(request)
    client, _ = api
    secret = "validation-input-secret-unique"
    with caplog.at_level(logging.INFO):
        response = client.post(
            "/api/v1/admins/register", json={**PAYLOAD, "authcode": secret * 40}
        )
    assert response.status_code == 422
    assert secret not in caplog.text and secret not in response.text
    assert AUTHCODE not in repr(Settings(_env_file=None, admin_authcode=AUTHCODE))


def test_shared_password_hashing_preserves_existing_student_format():
    encoded = hash_password("student-password")
    assert encoded.startswith("pbkdf2_sha256$600000$")
    assert verify_password("student-password", encoded)
    assert not verify_password("wrong", encoded)
    assert not verify_password("student-password", "invalid")


@pytest.mark.parametrize(
    "authorization",
    [None, "Basic admin-session", "Bearer student-session", "Bearer invalid"],
)
def test_delete_current_admin_requires_admin_session(api, authorization):
    client, repository = api
    headers = {"Authorization": authorization} if authorization else {}
    response = client.request(
        "DELETE",
        "/api/v1/admins/me",
        json={"password": "test-password"},
        headers=headers,
    )
    assert response.status_code == 401
    assert repository.delete_calls == []
    assert not repository.deleted


def test_delete_current_admin_verifies_password_and_revokes_access(api):
    client, repository = api
    headers = {"Authorization": "Bearer admin-session"}
    wrong = client.request(
        "DELETE",
        "/api/v1/admins/me",
        json={"password": "wrong-password"},
        headers=headers,
    )
    assert wrong.status_code == 403
    assert "wrong-password" not in wrong.text
    assert not repository.deleted
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 200
    deleted = client.request(
        "DELETE",
        "/api/v1/admins/me",
        json={"password": "test-password"},
        headers=headers,
    )
    assert deleted.status_code == 204 and deleted.content == b""
    assert repository.deleted
    assert repository.delete_calls[-1] == {
        "token": "admin-session",
        "password": "test-password",
    }
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 401
    assert (
        client.request(
            "DELETE",
            "/api/v1/admins/me",
            json={"password": "test-password"},
            headers=headers,
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/admins/login",
            json={"username": "admin_test", "password": "test-password"},
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"password": ""},
        {"password": "p" * 129},
        {"password": "test-password", "admin_id": "another-admin"},
    ],
)
def test_delete_current_admin_rejects_invalid_or_targeted_payload(api, payload):
    client, repository = api
    assert (
        client.request(
            "DELETE",
            "/api/v1/admins/me",
            json=payload,
            headers={"Authorization": "Bearer admin-session"},
        ).status_code
        == 422
    )
    assert repository.delete_calls == []
    assert not repository.deleted


@pytest.mark.parametrize(
    "authorization",
    [None, "Basic admin-session", "Bearer student-session", "Bearer invalid"],
)
def test_change_password_requires_admin(api, authorization):
    client, repository = api
    headers = {"Authorization": authorization} if authorization else {}
    response = client.put(
        "/api/v1/admins/me/password",
        json={"current_password": "test-password", "new_password": "new-password"},
        headers=headers,
    )
    assert response.status_code == 401
    assert repository.change_calls == []


def test_change_password_verifies_current_password_and_revokes_session(api):
    client, repository = api
    headers = {"Authorization": "Bearer admin-session"}
    wrong = client.put(
        "/api/v1/admins/me/password",
        json={"current_password": "wrong-password", "new_password": "new-password"},
        headers=headers,
    )
    assert wrong.status_code == 403
    assert repository.password == "test-password"
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 200
    changed = client.put(
        "/api/v1/admins/me/password",
        json={"current_password": "test-password", "new_password": "new-password"},
        headers=headers,
    )
    assert changed.status_code == 204 and changed.content == b""
    assert repository.password == "new-password"
    assert not repository.deleted
    assert repository.change_calls[-1]["token"] == "admin-session"
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/v1/admins/login",
            json={"username": "admin_test", "password": "test-password"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/admins/login",
            json={"username": "admin_test", "password": "new-password"},
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"current_password": "test-password"},
        {"current_password": "", "new_password": "new-password"},
        {"current_password": "p" * 129, "new_password": "new-password"},
        {"current_password": "test-password", "new_password": "short"},
        {"current_password": "test-password", "new_password": "p" * 129},
        {
            "current_password": "test-password",
            "new_password": "new-password",
            "admin_id": "other",
        },
    ],
)
def test_change_password_rejects_invalid_or_targeted_payload(api, payload):
    client, repository = api
    assert (
        client.put(
            "/api/v1/admins/me/password",
            json=payload,
            headers={"Authorization": "Bearer admin-session"},
        ).status_code
        == 422
    )
    assert repository.change_calls == []


def test_change_password_secrets_are_not_exposed(api, caplog):
    payload = {
        "current_password": "unique-current-secret",
        "new_password": "unique-new-secret",
    }
    parsed = ChangeAdminPasswordRequest.model_validate(payload)
    assert all(secret not in repr(parsed) for secret in payload.values())
    client, _ = api
    with caplog.at_level(logging.INFO):
        response = client.put(
            "/api/v1/admins/me/password",
            json={**payload, "new_password": payload["new_password"] * 30},
            headers={"Authorization": "Bearer admin-session"},
        )
    assert response.status_code == 422
    assert all(
        secret not in response.text and secret not in caplog.text
        for secret in payload.values()
    )


@pytest.fixture
def database_api(postgres_test_database_url):
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=postgres_test_database_url,
        admin_authcode=AUTHCODE,
    )
    app = create_app(settings, llm_client=MockLLMClient())
    with TestClient(app) as client:
        yield client, app.state.admin_repository, app.state.learning_repository


def test_database_accounts_are_separate_and_hashes_are_not_plaintext(database_api):
    client, admins, students = database_api
    student = students.register_student(
        username="admin_test", password="student-password", display_name="同名学生"
    )
    created = client.post("/api/v1/admins/register", json=PAYLOAD)
    assert created.status_code == 201
    account = created.json()
    with admins.database.connect() as connection:
        row = connection.execute(
            "SELECT * FROM administrators WHERE id=?", (account["admin_id"],)
        ).fetchone()
        assert verify_password(PAYLOAD["password"], row["password_hash"])
        assert row["password_hash"] != PAYLOAD["password"]
        assert row["session_token_hash"] != account["access_token"]
    assert students.student_from_token(student["access_token"])["id"] == student["id"]
    assert (
        client.get(
            "/api/v1/admins/me",
            headers={"Authorization": "Bearer " + student["access_token"]},
        ).status_code
        == 401
    )
    assert (
        client.get(
            "/api/v1/students/me",
            headers={"Authorization": "Bearer " + account["access_token"]},
        ).status_code
        == 404
    )
    assert client.post("/api/v1/admins/register", json=PAYLOAD).status_code == 409


def test_database_login_rotation_expiry_disable_and_revocation(database_api):
    client, admins, _ = database_api
    first = client.post("/api/v1/admins/register", json=PAYLOAD).json()
    assert (
        client.post(
            "/api/v1/admins/login", json={"username": "admin_test", "password": "wrong"}
        ).status_code
        == 401
    )
    second = client.post(
        "/api/v1/admins/login",
        json={"username": "ADMIN_TEST", "password": PAYLOAD["password"]},
    ).json()
    old_headers = {"Authorization": "Bearer " + first["access_token"]}
    headers = {"Authorization": "Bearer " + second["access_token"]}
    assert second["access_token"] != first["access_token"]
    assert client.get("/api/v1/admins/me", headers=old_headers).status_code == 401
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 200
    with admins.database.connect() as connection:
        connection.execute(
            "UPDATE administrators SET session_expires_at='2000-01-01T00:00:00+00:00'"
        )
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 401
    third = client.post(
        "/api/v1/admins/login",
        json={"username": "admin_test", "password": PAYLOAD["password"]},
    ).json()
    headers = {"Authorization": "Bearer " + third["access_token"]}
    with admins.database.connect() as connection:
        connection.execute("UPDATE administrators SET active=0")
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/v1/admins/login",
            json={"username": "admin_test", "password": PAYLOAD["password"]},
        ).status_code
        == 401
    )
    with admins.database.connect() as connection:
        connection.execute("UPDATE administrators SET active=1")
    assert client.post("/api/v1/admins/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/admins/me", headers=headers).status_code == 401


def test_database_delete_current_admin_preserves_other_accounts_and_courses(
    database_api,
):
    client, admins, students = database_api
    first = client.post("/api/v1/admins/register", json=PAYLOAD).json()
    second = admins.register(
        username="other_admin", password="other-password", display_name="其他管理员"
    )
    student = students.register_student(
        username="admin_test", password="student-password", display_name="同名学生"
    )
    headers = {"Authorization": "Bearer " + first["access_token"]}
    with admins.database.connect() as connection:
        courses = connection.execute("SELECT * FROM courses ORDER BY id").fetchall()
    assert (
        client.request(
            "DELETE",
            "/api/v1/admins/me",
            json={"password": "wrong-password"},
            headers=headers,
        ).status_code
        == 403
    )
    assert admins.from_token(first["access_token"])["id"] == first["admin_id"]
    assert (
        client.request(
            "DELETE",
            "/api/v1/admins/me",
            json={"password": PAYLOAD["password"]},
            headers=headers,
        ).status_code
        == 204
    )
    with pytest.raises(AdminUnauthorizedError):
        admins.from_token(first["access_token"])
    assert admins.login(username="admin_test", password=PAYLOAD["password"]) is None
    assert admins.from_token(second["access_token"])["id"] == second["id"]
    assert students.student_from_token(student["access_token"])["id"] == student["id"]
    with admins.database.connect() as connection:
        assert (
            connection.execute("SELECT * FROM courses ORDER BY id").fetchall()
            == courses
        )
        assert (
            connection.execute(
                "SELECT id FROM administrators WHERE id=?", (first["admin_id"],)
            ).fetchone()
            is None
        )


def test_database_password_change_hashes_password_and_revokes_only_current_admin(
    database_api,
):
    client, admins, students = database_api
    account = client.post("/api/v1/admins/register", json=PAYLOAD).json()
    other = admins.register(
        username="other_admin", password="other-password", display_name="其他管理员"
    )
    student = students.register_student(
        username="admin_test", password="student-password", display_name="同名学生"
    )
    headers = {"Authorization": "Bearer " + account["access_token"]}
    payload = {
        "current_password": PAYLOAD["password"],
        "new_password": "new-test-password",
    }
    assert (
        client.put(
            "/api/v1/admins/me/password",
            json={**payload, "current_password": "wrong"},
            headers=headers,
        ).status_code
        == 403
    )
    assert admins.login(username="admin_test", password=payload["new_password"]) is None
    assert (
        client.put(
            "/api/v1/admins/me/password", json=payload, headers=headers
        ).status_code
        == 204
    )
    with pytest.raises(AdminUnauthorizedError):
        admins.from_token(account["access_token"])
    assert admins.login(username="admin_test", password=PAYLOAD["password"]) is None
    with admins.database.connect() as connection:
        row = connection.execute(
            "SELECT password_hash,session_token_hash,session_expires_at FROM administrators WHERE id=?",
            (account["admin_id"],),
        ).fetchone()
        assert row["password_hash"] != payload["new_password"]
        assert verify_password(payload["new_password"], row["password_hash"])
        assert row["session_token_hash"] is None and row["session_expires_at"] is None
    assert (
        admins.login(username="admin_test", password=payload["new_password"])["id"]
        == account["admin_id"]
    )
    assert admins.from_token(other["access_token"])["id"] == other["id"]
    assert students.student_from_token(student["access_token"])["id"] == student["id"]
