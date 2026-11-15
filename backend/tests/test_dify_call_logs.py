import asyncio
import json
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from psycopg import OperationalError
from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import (
    CallLogUnavailableError,
    ConfigurationError,
    LLMServiceError,
)
from app.main import create_app
from app.services.course_repository import CourseRepository
from app.services.dify import DifyClient
from app.services.dify_call_logs import (
    DifyCallContext,
    DifyCallLogRepository,
    DifyCallOutcome,
)
from app.services.dify_settings_repository import DifySettingsRepository
from app.services.learning_repository import LearningRepository

KEY = "app-call-logs-secret"
USAGE = {
    "prompt_tokens": 10,
    "completion_tokens": 2,
    "total_tokens": 12,
    "total_price": "0.000123456789012345678901",
    "currency": "USD",
}
REMOTE_IDS = {
    "message_id": "message-one",
    "task_id": "task-one",
    "workflow_run_id": "workflow-one",
    "conversation_id": "conversation-one",
}


@pytest.fixture
def logging_setup(postgres_test_database_url):
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=postgres_test_database_url,
        settings_encryption_key=Fernet.generate_key().decode("ascii"),
    )
    dify = DifySettingsRepository(settings)
    dify.save_free_qa(
        {"api_base_url": "https://dify.example/v1", "api_key": SecretStr(KEY)}
    )
    return settings, dify, DifyCallLogRepository(settings.database_url)


def rows(logs):
    with logs.database.connect() as connection:
        return connection.execute(
            "SELECT * FROM dify_call_logs ORDER BY started_at,id"
        ).fetchall()


def stream(events):
    return httpx.Response(
        200,
        headers={"Content-Type": "text/event-stream"},
        text="".join("data: " + json.dumps(event) + "\n\n" for event in events),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["json", "stream"])
async def test_attempt_is_committed_before_request_and_finalized_once(
    logging_setup, carrier
):
    _, dify, logs = logging_setup
    context = DifyCallContext(
        student_id="student-one",
        course_id="machine_learning",
        topic_id="ml.log_topic",
        business_type="topic_practice",
    )

    def handler(request):
        pending = rows(logs)
        assert len(pending) == 1
        assert pending[0]["status"] == "in_progress"
        assert pending[0]["total_tokens"] is None
        if carrier == "json":
            return httpx.Response(
                200, json={"answer": "回答", "metadata": {"usage": USAGE}, **REMOTE_IDS}
            )
        return stream(
            [
                {"event": "agent_message", "answer": "回答", **REMOTE_IDS},
                {"event": "message_end", "metadata": {"usage": USAGE}},
            ]
        )

    settings = dify.runtime_settings()
    agent = DifyClient(
        settings,
        transport=httpx.MockTransport(handler),
        call_logs=logs,
        call_context=context,
    )
    try:
        result = await agent.answer(course=None, question="不应记录的问题", history=[])
        assert result["answer"] == "回答"
    finally:
        await agent.close()
    (log,) = rows(logs)
    assert log["request_id"] == context.request_id
    assert log["credential_id"] == settings.dify_credential_id
    assert log["student_id"] == "student-one"
    assert log["course_id"] == "machine_learning"
    assert log["topic_id"] == "ml.log_topic"
    assert log["business_type"] == "topic_practice"
    assert log["is_anonymous"] is False
    assert log["status"] == "succeeded"
    assert log["error_code"] is None
    assert log["http_status"] == 200
    assert log["started_at"].tzinfo is not None
    assert log["finished_at"] >= log["started_at"]
    assert log["duration_ms"] >= 0
    assert log["total_price"] == Decimal(USAGE["total_price"])
    for name, value in REMOTE_IDS.items():
        assert log[name] == value
    for name in ("prompt_tokens", "completion_tokens", "total_tokens", "currency"):
        assert log[name] == USAGE[name]
    assert KEY not in str(log)
    assert "不应记录的问题" not in str(log)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure,expected_status,error_code,http_status",
    [
        ("http", "failed", "http_error", 401),
        ("timeout", "timeout", "timeout", None),
        ("connection", "failed", "transport_error", None),
        ("sse_error", "failed", "upstream_error", 200),
        ("truncated", "failed", "incomplete_response", 200),
        ("json", "failed", "invalid_response", 200),
    ],
)
async def test_failures_are_logged_without_error_bodies_or_invented_usage(
    logging_setup, failure, expected_status, error_code, http_status
):
    _, dify, logs = logging_setup

    def handler(request):
        if failure == "http":
            return httpx.Response(401, text=KEY + " secret upstream debug")
        if failure == "timeout":
            raise httpx.ReadTimeout(KEY + " private timeout")
        if failure == "connection":
            raise httpx.ConnectError(KEY + " private connection")
        if failure == "json":
            return httpx.Response(
                200, headers={"Content-Type": "application/json"}, text="invalid " + KEY
            )
        events = [{"event": "agent_message", "answer": "部分回答", **REMOTE_IDS}]
        if failure == "sse_error":
            events.append(
                {
                    "event": "error",
                    "code": KEY,
                    "message": KEY + " secret upstream debug",
                }
            )
        return stream(events)

    agent = DifyClient(
        dify.runtime_settings(), transport=httpx.MockTransport(handler), call_logs=logs
    )
    try:
        with pytest.raises(LLMServiceError) as error:
            await agent.run("问题")
        assert KEY not in str(error.value)
    finally:
        await agent.close()
    (log,) = rows(logs)
    assert log["status"] == expected_status
    assert log["error_code"] == error_code
    assert log["http_status"] == http_status
    assert log["is_anonymous"] is True
    for name in (
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "total_price",
        "currency",
    ):
        assert log[name] is None
    if failure in {"sse_error", "truncated"}:
        assert log["task_id"] == "task-one"
    assert KEY not in str(log)
    assert "secret upstream debug" not in str(log)


@pytest.mark.asyncio
async def test_cancellation_retains_received_ids(logging_setup):
    _, dify, logs = logging_setup
    ready = asyncio.Event()

    class WaitingStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"event":"agent_message","answer":"partial","task_id":"task-one"}\n\n'
            ready.set()
            await asyncio.Event().wait()

    agent = DifyClient(
        dify.runtime_settings(),
        call_logs=logs,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                headers={"Content-Type": "text/event-stream"},
                stream=WaitingStream(),
            )
        ),
    )
    task = asyncio.create_task(agent.run("问题"))
    try:
        await asyncio.wait_for(ready.wait(), timeout=5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    finally:
        await agent.close()
    (log,) = rows(logs)
    assert log["status"] == "cancelled"
    assert log["task_id"] == "task-one"
    assert log["total_tokens"] is None


@pytest.mark.asyncio
async def test_known_usage_survives_a_later_stream_timeout(logging_setup):
    _, dify, logs = logging_setup

    class TimedOutStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"event":"message","answer":"answer"}\n\n'
            yield (
                "data: "
                + json.dumps({"event": "message_end", "metadata": {"usage": USAGE}})
                + "\n\n"
            ).encode()
            raise httpx.ReadTimeout(KEY)

    agent = DifyClient(
        dify.runtime_settings(),
        call_logs=logs,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                headers={"Content-Type": "text/event-stream"},
                stream=TimedOutStream(),
            )
        ),
    )
    try:
        with pytest.raises(LLMServiceError):
            await agent.run("问题")
    finally:
        await agent.close()
    (log,) = rows(logs)
    assert log["status"] == "timeout"
    assert log["total_tokens"] == 12
    assert log["total_price"] == Decimal(USAGE["total_price"])


def test_finalization_is_idempotent_and_retries_remain_separate(logging_setup):
    _, dify, logs = logging_setup
    context = DifyCallContext()
    first = logs.start(context, dify.runtime_settings().dify_credential_id)
    second = logs.start(context, dify.runtime_settings().dify_credential_id)
    outcome = DifyCallOutcome(
        status="succeeded",
        error_code=None,
        usage={**USAGE, "total_price": Decimal(USAGE["total_price"])},
    )
    logs.finish(first, outcome, 10, secret=KEY)
    logs.finish(first, DifyCallOutcome(status="timeout"), 99, secret=KEY)
    logs.finish(second, outcome, 15, secret=KEY)
    attempts = rows(logs)
    assert first != second
    assert len(attempts) == 2
    assert {row["request_id"] for row in attempts} == {context.request_id}
    assert [row["status"] for row in attempts] == ["succeeded", "succeeded"]
    assert sum(row["total_tokens"] for row in attempts) == 24
    assert attempts[0]["duration_ms"] == 10


@pytest.mark.asyncio
async def test_log_outages_block_untracked_requests_and_keep_pending_records(
    logging_setup, monkeypatch, caplog
):
    _, dify, logs = logging_setup
    upstream = []

    def handler(request):
        upstream.append(request)
        return httpx.Response(200, json={"answer": "回答"})

    def unavailable(*args, **kwargs):
        raise OperationalError(KEY + " private database details")

    agent = DifyClient(
        dify.runtime_settings(), call_logs=logs, transport=httpx.MockTransport(handler)
    )
    try:
        with monkeypatch.context() as patch:
            patch.setattr(logs, "start", unavailable)
            with pytest.raises(CallLogUnavailableError) as error:
                await agent.run("问题")
            assert KEY not in str(error.value)
        assert upstream == []
        monkeypatch.setattr(logs, "finish", unavailable)
        assert (await agent.run("问题"))["answer"] == "回答"
    finally:
        await agent.close()
    (log,) = rows(logs)
    assert log["status"] == "in_progress"
    assert KEY not in caplog.text
    assert "private database details" not in caplog.text


@pytest.mark.asyncio
async def test_local_configuration_rejection_is_not_an_upstream_attempt(logging_setup):
    settings, _, logs = logging_setup
    agent = DifyClient(settings, call_logs=logs)
    try:
        with pytest.raises(ConfigurationError):
            await agent.run("问题")
    finally:
        await agent.close()
    assert rows(logs) == []


def test_call_log_migration_is_idempotent_and_preserves_records(
    logging_setup, monkeypatch
):
    settings, dify, logs = logging_setup
    call_id = logs.start(DifyCallContext(), dify.runtime_settings().dify_credential_id)
    original = rows(logs)
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[2]))
    from operations.database.migrate_dify_call_logs import migrate_database

    migrate_database(settings)
    migrate_database(settings)
    assert rows(logs) == original
    assert rows(logs)[0]["id"] == call_id


@pytest.mark.parametrize(
    "mode",
    [
        "free_qa",
        "topic_teaching",
        "topic_clarification",
        "topic_practice",
        "topic_answer",
    ],
)
def test_chat_records_authenticated_business_context_and_explicit_retry_id(
    logging_setup, mode
):
    settings, dify, logs = logging_setup
    course_repo = CourseRepository(settings.database_url, cipher=dify.cipher)
    course_repo.update(
        "machine_learning",
        {
            "dify_api_base_url": "https://dify.example/v1",
            "dify_api_key": SecretStr(KEY),
        },
    )
    students = LearningRepository(settings.database_url)
    student = students.register_student(
        username="log_student", password="test-password", display_name="测试学生"
    )
    with logs.database.connect() as connection:
        connection.execute("""INSERT INTO course_chapters(id,course_id,sort_order,title)
            VALUES ('chapter-test','machine_learning',1,'测试章节')""")
        connection.execute("""INSERT INTO curriculum_topics(id,course,chapter_id,title,order_index,
            description,learning_objectives_json,created_at,updated_at) VALUES
            ('ml.log_topic','machine_learning','chapter-test','测试知识点',1,'','[]','2026-01-01','2026-01-01')""")
    agent = DifyClient(
        settings,
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={"answer": "教学回答", "metadata": {"usage": USAGE}, **REMOTE_IDS},
            )
        ),
    )
    app = create_app(settings, llm_client=agent, dify_call_log_repository=logs)
    request_id = str(uuid4())
    payload = {
        "request_id": request_id,
        "message": "问题",
        "course": "machine_learning",
        "topic_id": "ml.log_topic",
        "learning_mode": mode,
    }
    with TestClient(app) as client:
        for _ in range(2):
            response = client.post(
                "/api/v1/chat",
                json=payload,
                headers={"Authorization": "Bearer " + student["access_token"]},
            )
            assert response.status_code == 200
            assert "usage" not in response.json()
        rejected = client.post(
            "/api/v1/chat", json={**payload, "request_id": "invalid"}
        )
        assert rejected.status_code == 422
    attempts = rows(logs)
    assert len(attempts) == 2
    assert len({row["id"] for row in attempts}) == 2
    assert {row["request_id"] for row in attempts} == {request_id}
    assert {row["business_type"] for row in attempts} == {mode}
    assert {row["student_id"] for row in attempts} == {student["id"]}
    assert {row["topic_id"] for row in attempts} == {"ml.log_topic"}
    assert all(row["status"] == "succeeded" for row in attempts)
    assert KEY not in str(attempts)
    course_repo.delete("machine_learning")
    with logs.database.connect() as connection:
        connection.execute("DELETE FROM students WHERE id=?", (student["id"],))
    assert rows(logs) == attempts
