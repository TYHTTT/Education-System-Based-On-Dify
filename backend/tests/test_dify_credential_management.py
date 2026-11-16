import asyncio
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock
from uuid import uuid4

import httpx
import pytest
from app.core.config import Settings
from app.core.exceptions import DifyCredentialDisabledError
from app.main import create_app
from app.schemas.course import CreateCourseRequest
from app.services.dify import DifyClient
from app.services.dify_call_logs import (
    DifyCallContext,
    DifyCallLogRepository,
    DifyCallOutcome,
)
from app.services.dify_credential_management import DifyCredentialManagementRepository
from fastapi.testclient import TestClient
from pydantic import SecretStr

from tests.mocks import MockLLMClient
from tests.test_admin_api import FakeAdmins
from tests.test_dify_call_logs import logging_setup as _logging_setup
from tests.test_dify_call_logs_api import api as _api
from tests.test_dify_credentials import (
    KEY,
    create_course,
    credentials,
    save_free_qa,
)
from tests.test_dify_credentials import repositories as _repositories

api = _api
logging_setup = _logging_setup
repositories = _repositories
PATH = "/api/v1/admin/dify/credentials"


def seed(logs, *, key="a"):
    with logs.database.connect() as connection:
        return connection.execute(
            """INSERT INTO dify_credentials(api_base_url,key_fingerprint,api_key_encrypted)
            VALUES ('https://example.test/v1',?, 'encrypted-secret') RETURNING id""",
            (key * 64,),
        ).fetchone()["id"]


def test_empty_list_is_private_and_paged(api):
    client, _, headers, _ = api
    response = client.get(PATH, headers=headers)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}


def test_per_key_usage_matches_overview_and_preserves_unknowns_and_currencies(api):
    client, logs, headers, _ = api
    first, unused = seed(logs), seed(logs, key="b")
    for usage in (
        {
            "prompt_tokens": 10,
            "completion_tokens": 2,
            "total_tokens": 12,
            "total_price": Decimal("0.000000000001"),
            "currency": "USD",
        },
        {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "total_price": Decimal(0),
            "currency": "CNY",
        },
        {"total_price": Decimal("1.25")},
    ):
        call = logs.start(DifyCallContext(), first)
        logs.finish(
            call, DifyCallOutcome(status="failed", usage=usage), 1, secret="key"
        )
    logs.start(DifyCallContext(), first)
    response = client.get(PATH, headers=headers)
    assert response.status_code == 200
    items = {item["id"]: item for item in response.json()["items"]}
    overview = client.get(
        "/api/v1/admin/dify/call-logs/overview",
        headers=headers,
        params={"credential_id": first},
    ).json()
    for field in (
        "total_calls",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "unknown_prompt_calls",
        "unknown_completion_calls",
        "unknown_total_token_calls",
        "unknown_usage_calls",
        "unknown_cost_calls",
        "currencies",
    ):
        assert items[first][field] == overview[field]
    assert items[first]["in_progress_calls"] == 1
    assert items[first]["prompt_tokens"] == 10
    assert items[first]["unknown_cost_calls"] == 2
    assert items[unused]["total_calls"] == items[unused]["total_tokens"] == 0
    assert items[unused]["currencies"] == []
    currencies = {item["currency"]: item for item in items[first]["currencies"]}
    assert Decimal(currencies["USD"]["total_price"]) == Decimal("0.000000000001")
    assert currencies["USD"]["cny_conversion"]["amount"] == "0.0000000000066646"
    assert currencies[None]["call_count"] == 2
    for secret in ("encrypted-secret", "key_fingerprint", "api_key", "api_base_url"):
        assert secret not in response.text


def test_all_unknown_is_not_zero_and_unassigned_calls_not_attributed(api):
    client, logs, headers, _ = api
    credential_id = seed(logs)
    logs.start(DifyCallContext(), credential_id)
    logs.start(DifyCallContext(), None)
    item = client.get(PATH, headers=headers).json()["items"][0]
    assert item["total_calls"] == item["unknown_usage_calls"] == 1
    assert (
        item["prompt_tokens"]
        is item["completion_tokens"]
        is item["total_tokens"]
        is None
    )
    assert item["currencies"][0]["total_price"] is None


def test_lists_shared_associations_and_retains_rotated_and_disabled_keys(api):
    client, logs, headers, _ = api
    dify = client.app.state.dify_settings_repository
    courses = client.app.state.course_repository
    body = CreateCourseRequest(
        title="共享课程",
        dify_api_base_url="https://example.test/v1",
        dify_api_key="app-test",
    ).model_dump()
    courses.create(body)
    dify.save_free_qa(
        {"api_base_url": body["dify_api_base_url"], "api_key": body["dify_api_key"]}
    )
    credential_id = dify.runtime_settings().dify_credential_id
    before = client.get(PATH, headers=headers).json()["items"][0]
    assert before["course_titles"] == ["共享课程"] and before["free_qa"]
    call = logs.start(DifyCallContext(), credential_id)
    response = client.patch(
        PATH + "/" + credential_id, headers=headers, json={"enabled": False}
    )
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == {"id": credential_id, "enabled": False}
    for _ in range(2):
        assert (
            client.patch(
                PATH + "/" + credential_id, headers=headers, json={"enabled": False}
            ).status_code
            == 200
        )
    dify.save_free_qa(
        {"api_base_url": body["dify_api_base_url"], "api_key": body["dify_api_key"]}
    )
    assert client.get(PATH, headers=headers).json()["items"][0]["enabled"] is False
    dify.save_free_qa(
        {"api_base_url": body["dify_api_base_url"], "api_key": SecretStr("app-rotated")}
    )
    result = client.get(PATH, headers=headers).json()
    assert result["total"] == 2
    old = next(item for item in result["items"] if item["id"] == credential_id)
    assert old["total_calls"] == 1 and not old["enabled"] and not old["free_qa"]
    assert (
        client.get("/api/v1/admin/dify/call-logs/" + call, headers=headers).status_code
        == 200
    )


def test_pagination_includes_unused_historical_keys_without_duplicates(api):
    client, logs, headers, _ = api
    for i in range(23):
        with logs.database.connect() as connection:
            connection.execute(
                """INSERT INTO dify_credentials(api_base_url,key_fingerprint,api_key_encrypted)
                VALUES ('https://example.test/v1',?, 'cipher')""",
                (f"{i:064x}",),
            )
    first = client.get(PATH, headers=headers).json()
    second = client.get(PATH, headers=headers, params={"page": 2}).json()
    assert first["total"] == second["total"] == 23
    assert len(first["items"]) == 20 and len(second["items"]) == 3
    assert len({item["id"] for item in first["items"] + second["items"]}) == 23


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"enabled": "false"},
        {"enabled": 0},
        {"enabled": None},
        {"enabled": False, "key": "secret"},
    ],
)
def test_strict_status_validation_and_not_found(api, body):
    client, _, headers, _ = api
    assert (
        client.patch(PATH + "/" + str(uuid4()), headers=headers, json=body).status_code
        == 422
    )


def test_unknown_and_invalid_identity_and_pagination(api):
    client, _, headers, _ = api
    assert (
        client.patch(
            PATH + "/bad", headers=headers, json={"enabled": False}
        ).status_code
        == 422
    )
    assert (
        client.patch(
            PATH + "/" + str(uuid4()), headers=headers, json={"enabled": False}
        ).status_code
        == 404
    )
    for query in ({"page": 0}, {"page_size": 51}, {"unknown": "value"}):
        assert client.get(PATH, headers=headers, params=query).status_code == 422


@pytest.mark.parametrize(
    "authorization",
    [None, "Basic admin-session", "Bearer student-session", "Bearer invalid"],
)
def test_permissions_checked_before_management_reads_and_writes(authorization):
    repository = Mock(spec=DifyCredentialManagementRepository)
    app = create_app(
        Settings(_env_file=None, app_env="test"),
        llm_client=MockLLMClient(),
        admin_repository=FakeAdmins(),
        dify_credential_management_repository=repository,
    )
    headers = {"Authorization": authorization} if authorization else {}
    with TestClient(app) as client:
        assert client.get(PATH, headers=headers).status_code == 401
        assert (
            client.patch(
                PATH + "/" + str(uuid4()), headers=headers, json={"enabled": False}
            ).status_code
            == 401
        )
    repository.list.assert_not_called()
    repository.set_enabled.assert_not_called()


def test_real_student_cannot_list_or_toggle(api):
    client, logs, _, student = api
    credential_id = seed(logs)
    headers = {"Authorization": "Bearer " + student["access_token"]}
    assert client.get(PATH, headers=headers).status_code == 401
    assert (
        client.patch(
            PATH + "/" + credential_id, headers=headers, json={"enabled": False}
        ).status_code
        == 401
    )
    with logs.database.connect() as connection:
        assert connection.execute("SELECT enabled FROM dify_credentials").fetchone()[
            "enabled"
        ]


@pytest.mark.asyncio
async def test_stale_runtime_settings_block_upstream_then_enable_resumes(logging_setup):
    settings, dify, logs = logging_setup
    snapshot = dify.runtime_settings()
    repository = DifyCredentialManagementRepository(settings.database_url)
    handler = Mock(return_value=httpx.Response(200, json={"answer": "回答"}))
    agent = DifyClient(snapshot, call_logs=logs, transport=httpx.MockTransport(handler))
    try:
        repository.set_enabled(snapshot.dify_credential_id, False)
        with pytest.raises(DifyCredentialDisabledError):
            await agent.run("不应发给上游")
        handler.assert_not_called()
        assert logs.list()["total"] == 0
        repository.set_enabled(snapshot.dify_credential_id, True)
        await agent.run("恢复调用")
        assert handler.call_count == 1
        assert logs.list()["total"] == 1
    finally:
        await agent.close()


@pytest.mark.asyncio
async def test_admitted_call_can_finish_after_disable(logging_setup):
    settings, dify, logs = logging_setup
    snapshot = dify.runtime_settings()
    repository = DifyCredentialManagementRepository(settings.database_url)

    async def handler(_):
        await asyncio.to_thread(
            repository.set_enabled, snapshot.dify_credential_id, False
        )
        return httpx.Response(
            200, json={"answer": "完成", "metadata": {"usage": {"total_tokens": 12}}}
        )

    agent = DifyClient(snapshot, call_logs=logs, transport=httpx.MockTransport(handler))
    try:
        await agent.run("已受理调用")
        with pytest.raises(DifyCredentialDisabledError):
            await agent.run("后续调用")
        result = logs.list()
        assert result["total"] == 1
        assert result["items"][0]["status"] == "succeeded"
        assert result["items"][0]["total_tokens"] == 12
    finally:
        await agent.close()


def test_call_admission_waits_for_status_transaction_and_reads_committed_disable(api):
    _, logs, _, _ = api
    credential_id = seed(logs)
    with ThreadPoolExecutor(max_workers=1) as executor:
        with logs.database.connect() as connection:
            connection.execute(
                "UPDATE dify_credentials SET enabled=FALSE WHERE id=?", (credential_id,)
            )
            future = executor.submit(logs.start, DifyCallContext(), credential_id)
            with pytest.raises(TimeoutError):
                future.result(timeout=0.2)
        with pytest.raises(DifyCredentialDisabledError):
            future.result(timeout=5)
    assert logs.list()["total"] == 0


def test_resaving_rotating_and_returning_to_key_preserves_disabled_status(repositories):
    settings, dify, courses = repositories
    course = create_course(courses)
    save_free_qa(dify)
    first = dify.runtime_settings(course).dify_credential_id
    repository = DifyCredentialManagementRepository(settings.database_url)
    repository.set_enabled(first, False)
    save_free_qa(dify, key="app-new-key")
    second = dify.runtime_settings().dify_credential_id
    assert second != first
    save_free_qa(dify, key=KEY)
    assert dify.runtime_settings().dify_credential_id == first
    assert credentials(dify)[0]["enabled"] is False
    with pytest.raises(DifyCredentialDisabledError):
        DifyCallLogRepository(settings.database_url).start(DifyCallContext(), first)


def test_additive_migration_is_repeatable_preserves_disabled_keys_and_logs(api):
    _, logs, _, _ = api
    credential_id = seed(logs)
    logs.start(DifyCallContext(), credential_id)
    sql = (
        Path(__file__).resolve().parents[2]
        / "operations/database/migrate_dify_credential_status.sql"
    ).read_text(encoding="utf-8")
    with logs.database.connect() as connection:
        connection.execute("ALTER TABLE dify_credentials DROP COLUMN enabled")
        connection.execute_script(sql)
        assert connection.execute("SELECT enabled FROM dify_credentials").fetchone()[
            "enabled"
        ]
        connection.execute("UPDATE dify_credentials SET enabled=FALSE")
        connection.execute_script(sql)
        record = connection.execute(
            "SELECT enabled,api_key_encrypted FROM dify_credentials"
        ).fetchone()
        assert record == {"enabled": False, "api_key_encrypted": "encrypted-secret"}
    assert logs.list()["total"] == 1


@pytest.mark.parametrize("course", [None, "machine_learning"])
def test_student_chat_returns_safe_disabled_error_and_resumes_after_enable(
    logging_setup, course
):
    settings, dify, logs = logging_setup
    if course:
        from app.services.course_repository import CourseRepository

        CourseRepository(settings.database_url, cipher=dify.cipher).update(
            course,
            {
                "dify_api_base_url": "https://dify.example/v1",
                "dify_api_key": SecretStr("app-call-logs-secret"),
            },
        )
    credential_id = dify.runtime_settings(course).dify_credential_id
    repository = DifyCredentialManagementRepository(settings.database_url)
    handler = Mock(return_value=httpx.Response(200, json={"answer": "恢复服务"}))
    agent = DifyClient(settings, transport=httpx.MockTransport(handler))
    app = create_app(settings, llm_client=agent, dify_call_log_repository=logs)
    payload = {"message": "问题", **({"course": course} if course else {})}
    with TestClient(app) as client:
        repository.set_enabled(credential_id, False)
        response = client.post("/api/v1/chat", json=payload)
        assert response.status_code == 403
        assert response.json() == {
            "error": {
                "code": "DIFY_CREDENTIAL_DISABLED",
                "message": "当前 AI 服务已停用，请联系管理员",
            }
        }
        handler.assert_not_called()
        assert logs.list()["total"] == 0
        repository.set_enabled(credential_id, True)
        assert client.post("/api/v1/chat", json=payload).status_code == 200
        assert handler.call_count == 1
