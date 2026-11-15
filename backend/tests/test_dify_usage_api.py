import json
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.dify import DifyClient
from app.services.dify_call_logs import DifyCallLogRepository


@pytest.mark.parametrize("carrier", ["json", "stream"])
def test_chat_does_not_expose_internal_usage_or_upstream_ids(monkeypatch, carrier):
    settings = Settings(_env_file=None, app_env="test", dify_api_key="app-test-secret")
    identifiers = {
        "conversation_id": "private-conversation",
        "message_id": "private-message",
        "task_id": "private-task",
        "workflow_run_id": "private-workflow",
    }
    metadata = {
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 2,
            "total_tokens": 12,
            "total_price": "0.0001234567890123456789",
            "currency": "USD",
        }
    }

    def handler(request):
        if carrier == "json":
            return httpx.Response(
                200, json={"answer": "回答", "metadata": metadata, **identifiers}
            )
        events = [
            {"event": "agent_message", "answer": "回答", **identifiers},
            {"event": "message_end", "metadata": metadata},
        ]
        return httpx.Response(
            200,
            headers={"Content-Type": "text/event-stream"},
            text="".join("data: " + json.dumps(event) + "\n\n" for event in events),
        )

    call_logs = Mock(spec=DifyCallLogRepository)
    call_logs.start.return_value = "call-one"
    app = create_app(
        settings,
        llm_client=DifyClient(settings, transport=httpx.MockTransport(handler)),
        dify_call_log_repository=call_logs,
    )
    monkeypatch.setattr(
        app.state.dify_settings_repository,
        "runtime_settings",
        lambda course=None: settings,
    )
    with TestClient(app) as client:
        response = client.post("/api/v1/chat", json={"message": "问题"})
    assert response.status_code == 200
    assert response.json()["answer"] == "回答"
    call_logs.start.assert_called_once()
    call_logs.finish.assert_called_once()
    assert "usage" not in response.json()
    for name, value in identifiers.items():
        assert name not in response.json()
        assert value not in response.text
