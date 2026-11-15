from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.dify_call_logs import (
    DifyCallContext,
    DifyCallLogRepository,
    DifyCallOutcome,
)
from tests.mocks import MockLLMClient
from tests.test_admin_api import FakeAdmins

PATH = "/api/v1/admin/dify/call-logs"


@pytest.fixture
def api(postgres_test_database_url):
    settings = Settings(
        _env_file=None, app_env="test", database_url=postgres_test_database_url
    )
    app = create_app(settings, llm_client=MockLLMClient())
    account = app.state.admin_repository.register(
        username="log_admin", password="test-password", display_name="测试管理员"
    )
    student = app.state.learning_repository.register_student(
        username="log_student", password="test-password", display_name="测试学生"
    )
    with TestClient(app) as client:
        yield (
            client,
            app.state.dify_call_log_repository,
            {"Authorization": "Bearer " + account["access_token"]},
            student,
        )


@pytest.mark.parametrize(
    "authorization",
    [None, "Basic admin-session", "Bearer student-session", "Bearer invalid"],
)
def test_unauthorized_requests_never_query_call_logs(authorization):
    logs = Mock(spec=DifyCallLogRepository)
    app = create_app(
        Settings(_env_file=None, app_env="test"),
        llm_client=MockLLMClient(),
        admin_repository=FakeAdmins(),
        dify_call_log_repository=logs,
    )
    with TestClient(app) as client:
        response = client.get(
            PATH, headers={"Authorization": authorization} if authorization else {}
        )
    assert response.status_code == 401
    logs.list.assert_not_called()


def test_actual_student_session_cannot_access_call_logs(api):
    client, _, _, student = api
    response = client.get(
        PATH, headers={"Authorization": "Bearer " + student["access_token"]}
    )
    assert response.status_code == 401


def test_empty_list_and_no_store_header(api):
    client, _, headers, _ = api
    response = client.get(PATH, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize(
    "query", ["page=0", "page=-1", "page=invalid", "page_size=0", "page_size=51"]
)
def test_invalid_pagination_is_rejected(api, query):
    client, _, headers, _ = api
    assert client.get(PATH + "?" + query, headers=headers).status_code == 422


def test_pages_have_consistent_totals_and_deterministic_newest_first_order(api):
    client, logs, headers, _ = api
    ids = [logs.start(DifyCallContext(), None) for _ in range(43)]
    # Tie all timestamps to exercise the secondary ID sort across page boundaries.
    with logs.database.connect() as connection:
        connection.execute(
            "UPDATE dify_call_logs SET started_at=?",
            (datetime(2026, 1, 1, tzinfo=UTC),),
        )
    collected = []
    for page in range(1, 4):
        response = client.get(PATH, headers=headers, params={"page": page})
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 43
        assert payload["page"] == page
        assert payload["page_size"] == 20
        collected.extend(item["id"] for item in payload["items"])
    assert collected == sorted(ids, reverse=True)
    assert len(set(collected)) == 43
    beyond = client.get(PATH, headers=headers, params={"page": 10}).json()
    assert beyond == {"items": [], "total": 43, "page": 10, "page_size": 20}
    custom = client.get(PATH, headers=headers, params={"page_size": 5}).json()
    assert len(custom["items"]) == 5
    assert custom["page_size"] == 5


def test_summary_joins_names_preserves_decimal_and_excludes_detail_fields(api):
    client, logs, headers, student = api
    with logs.database.connect() as connection:
        connection.execute("""INSERT INTO course_chapters(id,course_id,sort_order,title)
            VALUES ('log-chapter','machine_learning',1,'测试章节')""")
        connection.execute("""INSERT INTO curriculum_topics(id,course,chapter_id,title,order_index,
            description,learning_objectives_json,created_at,updated_at) VALUES
            ('ml.log_topic','machine_learning','log-chapter','测试知识点',1,'','[]','2026-01-01','2026-01-01')""")
    call_id = logs.start(
        DifyCallContext(
            student_id=student["id"],
            course_id="machine_learning",
            topic_id="ml.log_topic",
            business_type="topic_teaching",
        ),
        None,
    )
    logs.finish(
        call_id,
        DifyCallOutcome(
            status="succeeded",
            error_code=None,
            identifiers={"message_id": "private-message", "task_id": "private-task"},
            usage={
                "prompt_tokens": 0,
                "completion_tokens": 2,
                "total_tokens": 2,
                "total_price": Decimal("0.000123456789012345678901"),
                "currency": "USD",
            },
        ),
        1500,
        secret="app-secret",
    )
    (item,) = client.get(PATH, headers=headers).json()["items"]
    assert item["id"] == call_id
    assert item["student_name"] == "测试学生"
    assert item["course_title"] == "机器学习"
    assert item["topic_title"] == "测试知识点"
    assert item["total_price"] == "0.000123456789012345678901"
    assert item["prompt_tokens"] == 0
    assert item["is_anonymous"] is False
    assert item["duration_ms"] == 1500
    assert set(item) == {
        "id",
        "credential_id",
        "student_id",
        "student_name",
        "course_id",
        "course_title",
        "topic_id",
        "topic_title",
        "business_type",
        "is_anonymous",
        "started_at",
        "duration_ms",
        "status",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "total_price",
        "currency",
    }
    assert "private-message" not in str(item)
    assert "private-task" not in str(item)


def test_anonymous_unknown_zero_and_deleted_entities_remain_visible(api):
    client, logs, headers, student = api
    anonymous_id = logs.start(DifyCallContext(), None)
    zero_id = logs.start(DifyCallContext(), None)
    logs.finish(
        zero_id,
        DifyCallOutcome(
            status="succeeded",
            error_code=None,
            usage={
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "total_price": Decimal(0),
                "currency": "USD",
            },
        ),
        0,
        secret="app-secret",
    )
    deleted_id = logs.start(
        DifyCallContext(
            student_id=student["id"],
            course_id="removed-course",
            topic_id="removed-topic",
        ),
        None,
    )
    with logs.database.connect() as connection:
        connection.execute("DELETE FROM students WHERE id=?", (student["id"],))
    payload = client.get(PATH, headers=headers).json()
    by_id = {item["id"]: item for item in payload["items"]}
    assert len(by_id) == 3
    assert by_id[anonymous_id]["is_anonymous"] is True
    assert by_id[anonymous_id]["total_price"] is None
    assert by_id[anonymous_id]["total_tokens"] is None
    assert by_id[zero_id]["total_price"] == "0"
    assert by_id[zero_id]["total_tokens"] == 0
    assert by_id[deleted_id]["student_id"] == student["id"]
    assert by_id[deleted_id]["student_name"] is None
    assert by_id[deleted_id]["course_id"] == "removed-course"
    assert by_id[deleted_id]["course_title"] is None
    assert by_id[deleted_id]["topic_id"] == "removed-topic"
    assert by_id[deleted_id]["topic_title"] is None
