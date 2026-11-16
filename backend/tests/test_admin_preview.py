from unittest.mock import MagicMock
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.core.admin_preview import ADMIN_PREVIEW_PREFIX, admin_preview_student_id
from app.core.exceptions import AdminUnauthorizedError, StudentNotFoundError
from app.core.security import hash_session_token
from app.schemas.student import RegisterStudentRequest
from app.services.admin_repository import AdminRepository
from app.services.learning_repository import LearningRepository


def test_preview_identity_is_stable_private_to_each_admin_and_not_a_login_username():
    first = admin_preview_student_id("admin-one")
    assert UUID(first).version == 5
    assert first == admin_preview_student_id("admin-one")
    assert first != admin_preview_student_id("admin-two")
    with pytest.raises(ValidationError):
        RegisterStudentRequest(
            username=ADMIN_PREVIEW_PREFIX + "admin-one",
            password="test-password",
            display_name="预览",
        )


@pytest.mark.parametrize("token", ["", "invalid", "student-session"])
def test_invalid_preview_session_cannot_create_a_preview_identity(token, monkeypatch):
    repository = LearningRepository("postgresql://unused")
    connection = MagicMock()
    connection.execute.return_value.fetchone.return_value = None
    connection.__enter__.return_value = connection
    monkeypatch.setattr(repository, "_connect", lambda: connection)
    with pytest.raises(AdminUnauthorizedError):
        repository.student_from_token(ADMIN_PREVIEW_PREFIX + token)
    assert connection.execute.call_count == 1
    assert connection.execute.call_args.args[1][0] == hash_session_token(token)


def test_preview_profiles_are_isolated_and_hidden_from_real_student_list(
    postgres_test_database_url,
):
    admins = AdminRepository(postgres_test_database_url)
    students = LearningRepository(postgres_test_database_url)
    first = admins.register(
        username="admin_one", password="test-password", display_name="管理员一"
    )
    second = admins.register(
        username="admin_two", password="test-password", display_name="管理员二"
    )
    real = students.register_student(
        username="real_student", password="test-password", display_name="真实学生"
    )
    profile = students.student_from_token(ADMIN_PREVIEW_PREFIX + first["access_token"])
    again = students.student_from_token(ADMIN_PREVIEW_PREFIX + first["access_token"])
    other = students.student_from_token(ADMIN_PREVIEW_PREFIX + second["access_token"])
    assert profile["id"] == again["id"] == admin_preview_student_id(first["id"])
    assert profile["id"] != other["id"] != real["id"]
    assert profile["display_name"] == "管理员预览 · 管理员一"
    listed = students.list_students()
    assert listed["total"] == 1 and listed["items"][0]["student_id"] == real["id"]
    assert (
        students.authenticate_student(
            username=profile["username"], password="test-password"
        )
        is None
    )
    with pytest.raises(StudentNotFoundError):
        students.student_from_token(first["access_token"])
    with pytest.raises(AdminUnauthorizedError):
        students.student_from_token(ADMIN_PREVIEW_PREFIX + real["access_token"])
    with students.database.connect() as connection:
        assert (
            connection.execute("SELECT count(*) AS n FROM students").fetchone()["n"]
            == 3
        )
        assert (
            connection.execute(
                "SELECT count(*) AS n FROM student_sessions WHERE student_id=?",
                (profile["id"],),
            ).fetchone()["n"]
            == 0
        )


@pytest.mark.parametrize(
    "action", ["logout", "password", "delete", "disable", "expiry"]
)
def test_preview_requires_live_admin_session_and_delete_cleans_up_identity(
    postgres_test_database_url, action
):
    admins = AdminRepository(postgres_test_database_url)
    students = LearningRepository(postgres_test_database_url)
    account = admins.register(
        username="admin_test", password="test-password", display_name="管理员"
    )
    token = ADMIN_PREVIEW_PREFIX + account["access_token"]
    profile = students.student_from_token(token)
    if action == "logout":
        admins.logout(account["access_token"])
    elif action == "password":
        assert admins.change_password(
            token=account["access_token"],
            current_password="test-password",
            new_password="new-password",
        )
    elif action == "delete":
        assert admins.delete_current(
            token=account["access_token"], password="test-password"
        )
        assert students.get_student(profile["id"]) is None
    else:
        with admins.database.connect() as connection:
            if action == "disable":
                connection.execute(
                    "UPDATE administrators SET active=0 WHERE id=?", (account["id"],)
                )
            else:
                connection.execute(
                    "UPDATE administrators SET session_expires_at='2000-01-01T00:00:00+00:00' WHERE id=?",
                    (account["id"],),
                )
    with pytest.raises(AdminUnauthorizedError):
        students.student_from_token(token)
