from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import ConfigurationError
from app.main import create_app
from app.schemas.course import CreateCourseRequest, UpdateCourseRequest
from app.schemas.dify_settings import DifySettingsWrite
from app.services.course_repository import CourseRepository
from app.services.dify_credentials import canonical_api_url
from app.services.dify_settings_repository import DifySettingsRepository
from tests.mocks import MockLLMClient

API_URL = "https://dify.example/v1"
KEY = "app-shared-test-secret"


@pytest.fixture
def repositories(postgres_test_database_url):
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=postgres_test_database_url,
        settings_encryption_key=Fernet.generate_key().decode("ascii"),
    )
    dify = DifySettingsRepository(settings)
    courses = CourseRepository(settings.database_url, cipher=dify.cipher)
    return settings, dify, courses


def create_course(courses, *, key=KEY, url=API_URL):
    return courses.create(
        CreateCourseRequest(
            title="测试课程", dify_api_base_url=url, dify_api_key=key
        ).model_dump()
    )["id"]


def save_free_qa(dify, *, key=KEY, url=API_URL):
    return dify.save_free_qa(
        DifySettingsWrite(api_base_url=url, api_key=key).model_dump()
    )


def credentials(dify):
    with dify.database.connect() as connection:
        return connection.execute(
            "SELECT * FROM dify_credentials ORDER BY created_at,id"
        ).fetchall()


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (" HTTPS://DIFY.EXAMPLE:443/v1/ ", API_URL),
        ("http://DIFY.EXAMPLE:80/v1/", "http://dify.example/v1"),
        ("https://dify.example:8443/v1/", "https://dify.example:8443/v1"),
        ("https://dify.example/tenant/v1/", "https://dify.example/tenant/v1"),
        ("https://dify.example/V1", "https://dify.example/V1"),
        ("http://[::1]:80/v1", "http://[::1]/v1"),
    ],
)
def test_service_identity_normalizes_only_equivalent_urls(value, expected):
    assert canonical_api_url(value) == expected


def test_courses_and_free_qa_share_identity_without_exposing_secrets(repositories):
    _, dify, courses = repositories
    first = create_course(courses)
    second = create_course(courses, url="HTTPS://DIFY.EXAMPLE:443/v1/")
    public_qa = save_free_qa(dify)
    snapshots = [
        dify.runtime_settings(first),
        dify.runtime_settings(second),
        dify.runtime_settings(),
    ]
    assert len({item.dify_credential_id for item in snapshots}) == 1
    assert snapshots[0].dify_credential_id is not None
    rows = credentials(dify)
    assert len(rows) == 1
    assert dify.cipher.decrypt(rows[0]["api_key_encrypted"]) == KEY
    assert rows[0]["key_fingerprint"] != KEY
    with dify.database.connect() as connection:
        ciphertexts = connection.execute(
            "SELECT dify_api_key_encrypted FROM courses WHERE id=ANY(?)",
            ([first, second],),
        ).fetchall()
    assert (
        ciphertexts[0]["dify_api_key_encrypted"]
        != ciphertexts[1]["dify_api_key_encrypted"]
    )
    for record in [courses.get(first), *courses.list()["items"], public_qa]:
        assert "dify_credential_id" not in record
        assert "key_fingerprint" not in record
        assert "api_key_encrypted" not in record
        assert "dify_api_key_encrypted" not in record
        assert KEY not in str(record)
    assert "dify_credential_id" not in snapshots[0].model_dump()


@pytest.mark.parametrize("target", ["course", "free_qa"])
def test_key_rotation_retains_history_and_reuses_old_identity_on_revert(
    repositories, target
):
    _, dify, courses = repositories
    course_id = create_course(courses)
    save_free_qa(dify)
    original_id = dify.runtime_settings().dify_credential_id

    def write(key):
        if target == "course":
            courses.update(course_id, {"dify_api_key": SecretStr(key)})
        else:
            save_free_qa(dify, key=key)

    def current():
        return dify.runtime_settings(course_id if target == "course" else None)

    write("app-rotated-test-secret")
    rotated = current()
    assert rotated.dify_credential_id != original_id
    assert rotated.dify_api_key.get_secret_value() == "app-rotated-test-secret"
    assert len(credentials(dify)) == 2
    unchanged = dify.runtime_settings(None if target == "course" else course_id)
    assert unchanged.dify_credential_id == original_id
    assert unchanged.dify_api_key.get_secret_value() == KEY
    write(KEY)
    assert current().dify_credential_id == original_id
    assert len(credentials(dify)) == 2
    if target == "course":
        courses.delete(course_id)
        assert len(credentials(dify)) == 2


@pytest.mark.parametrize("target", ["course", "free_qa"])
def test_changing_service_with_blank_key_rebinds_and_preserves_key(
    repositories, target
):
    _, dify, courses = repositories
    course_id = create_course(courses)
    save_free_qa(dify)
    original_id = dify.runtime_settings().dify_credential_id
    other_url = "https://dify.example/other/v1"
    if target == "course":
        courses.update(
            course_id,
            UpdateCourseRequest(
                dify_api_base_url=other_url, dify_api_key=" "
            ).model_dump(exclude_unset=True),
        )
    else:
        save_free_qa(dify, key=" ", url=other_url)
    current = dify.runtime_settings(course_id if target == "course" else None)
    assert current.dify_credential_id != original_id
    assert current.dify_api_key.get_secret_value() == KEY
    assert current.dify_api_base_url == other_url
    assert len(credentials(dify)) == 2


def test_empty_configuration_has_no_identity_and_ordinary_edits_keep_identity(
    repositories,
):
    _, dify, courses = repositories
    course_id = create_course(courses, key=None)
    save_free_qa(dify, key=None)
    assert dify.runtime_settings(course_id).dify_credential_id is None
    assert dify.runtime_settings().dify_credential_id is None
    assert credentials(dify) == []
    courses.update(course_id, {"dify_api_key": SecretStr(KEY)})
    original_id = dify.runtime_settings(course_id).dify_credential_id
    courses.update(course_id, {"title": "只修改名称", "completion_threshold": 90})
    courses.update(
        course_id, UpdateCourseRequest(dify_api_key=" ").model_dump(exclude_unset=True)
    )
    current = dify.runtime_settings(course_id)
    assert current.dify_credential_id == original_id
    assert current.learning_completion_threshold == 90
    assert len(credentials(dify)) == 1


def test_concurrent_resolution_creates_only_one_identity(repositories):
    _, dify, _ = repositories

    def resolve(_):
        encrypted = dify.cipher.encrypt(KEY)
        with dify.database.connect() as connection:
            return dify.credentials.resolve(connection, API_URL, encrypted)

    with ThreadPoolExecutor(max_workers=6) as executor:
        identities = list(executor.map(resolve, range(12)))
    assert len(set(identities)) == 1
    assert len(credentials(dify)) == 1


def seed_legacy_settings(dify):
    encrypted = dify.cipher.encrypt(KEY)
    with dify.database.connect() as connection:
        connection.execute(
            "UPDATE courses SET dify_api_base_url=?,dify_api_key_encrypted=? WHERE id='machine_learning'",
            (API_URL, encrypted),
        )
        connection.execute(
            "UPDATE dify_free_qa_settings SET api_base_url=?,api_key_encrypted=? WHERE id=1",
            (API_URL, encrypted),
        )


@pytest.mark.parametrize("target", ["course", "free_qa"])
def test_rotating_legacy_settings_preserves_both_old_and_new_keys(repositories, target):
    _, dify, courses = repositories
    seed_legacy_settings(dify)
    if target == "course":
        courses.update(
            "machine_learning", {"dify_api_key": SecretStr("app-new-test-key")}
        )
    else:
        save_free_qa(dify, key="app-new-test-key")
    assert {
        dify.cipher.decrypt(row["api_key_encrypted"]) for row in credentials(dify)
    } == {KEY, "app-new-test-key"}


def test_legacy_settings_bind_on_first_runtime_read(repositories):
    _, dify, _ = repositories
    seed_legacy_settings(dify)
    first = dify.runtime_settings("machine_learning")
    second = dify.runtime_settings()
    assert first.dify_credential_id == second.dify_credential_id
    assert first.dify_credential_id is not None
    assert len(credentials(dify)) == 1


def test_existing_database_upgrade_is_additive_and_idempotent(
    repositories, monkeypatch
):
    settings, dify, _ = repositories
    seed_legacy_settings(dify)
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[2]))
    from operations.database.migrate_dify_credentials import migrate_database

    with dify.database.connect() as connection:
        original = connection.execute(
            "SELECT * FROM courses WHERE id='machine_learning'"
        ).fetchone()
        connection.execute("ALTER TABLE courses DROP COLUMN dify_credential_id")
        connection.execute(
            "ALTER TABLE dify_free_qa_settings DROP COLUMN dify_credential_id"
        )
        connection.execute("DROP TABLE dify_call_logs")
        connection.execute("DROP TABLE dify_credentials")
    assert migrate_database(settings) == {"courses": 1, "free_qa": 1}
    assert migrate_database(settings) == {"courses": 0, "free_qa": 0}
    with dify.database.connect() as connection:
        current = connection.execute(
            "SELECT * FROM courses WHERE id='machine_learning'"
        ).fetchone()
    assert current["dify_credential_id"] is not None
    assert all(
        current[name] == value
        for name, value in original.items()
        if name != "dify_credential_id"
    )
    assert dify.runtime_settings().dify_credential_id == current["dify_credential_id"]
    assert len(credentials(dify)) == 1


def test_failed_backfill_rolls_back_all_identity_writes(repositories):
    _, dify, _ = repositories
    seed_legacy_settings(dify)
    with dify.database.connect() as connection:
        connection.execute(
            "UPDATE dify_free_qa_settings SET api_key_encrypted='invalid-ciphertext'"
        )
    with pytest.raises(ConfigurationError), dify.database.connect() as connection:
        dify.credentials.backfill(connection)
    with dify.database.connect() as connection:
        row = connection.execute(
            "SELECT dify_credential_id FROM courses WHERE id='machine_learning'"
        ).fetchone()
    assert row["dify_credential_id"] is None
    assert credentials(dify) == []


def test_settings_api_keeps_admin_permissions_and_hides_credential_details(
    repositories,
):
    settings, dify, _ = repositories
    app = create_app(settings, llm_client=MockLLMClient())
    account = app.state.admin_repository.register(
        username="credential_admin", password="test-password", display_name="测试管理员"
    )
    headers = {"Authorization": "Bearer " + account["access_token"]}
    with TestClient(app) as client:
        for unauthorized in [{}, {"Authorization": "Bearer student-token"}]:
            assert (
                client.put(
                    "/api/v1/admin/settings/free-qa",
                    headers=unauthorized,
                    json={"api_base_url": API_URL, "api_key": KEY},
                ).status_code
                == 401
            )
            assert (
                client.post(
                    "/api/v1/admin/courses",
                    headers=unauthorized,
                    json={"title": "测试课程"},
                ).status_code
                == 401
            )
        saved = client.put(
            "/api/v1/admin/settings/free-qa",
            headers=headers,
            json={"api_base_url": API_URL, "api_key": KEY},
        )
        created = client.post(
            "/api/v1/admin/courses",
            headers=headers,
            json={
                "title": "测试课程",
                "dify_api_base_url": API_URL,
                "dify_api_key": KEY,
            },
        )
        assert saved.status_code == 200
        assert created.status_code == 201
        for response in [saved, created, client.get("/api/v1/courses")]:
            assert KEY not in response.text
            assert "credential_id" not in response.text
            assert "key_fingerprint" not in response.text
            assert "api_key_encrypted" not in response.text
    assert (
        dify.runtime_settings().dify_credential_id
        == dify.runtime_settings(created.json()["id"]).dify_credential_id
    )
