import json
from decimal import Decimal

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import LLMServiceError
from app.core.types import Course
from app.services.dify import DifyClient


def client(handler):
    return DifyClient(
        Settings(
            _env_file=None,
            dify_api_base_url="https://dify.example/v1/",
            dify_api_key="app-test-secret",
            dify_inputs={"tenant": "school"},
        ),
        transport=httpx.MockTransport(handler),
    )


def sse(events):
    return httpx.Response(
        200,
        headers={"Content-Type": "text/event-stream"},
        text=": ping\n\n"
        + "".join(
            "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"
            for event in events
        ),
    )


@pytest.mark.asyncio
async def test_agent_stream_history_inputs_credentials_and_remote_citations():
    requests = []

    def handler(request):
        requests.append(request)
        return sse(
            [
                {"event": "agent_thought", "thought": "hidden reasoning"},
                {"event": "agent_message", "answer": "监督"},
                {"event": "agent_message", "answer": "学习"},
                {
                    "event": "message_end",
                    "metadata": {
                        "retriever_resources": [
                            {
                                "content": "训练使用带标签数据",
                                "document_id": "remote-doc",
                                "segment_id": "remote-segment",
                                "document_name": "Dify 课件",
                            }
                        ]
                    },
                },
            ]
        )

    agent = client(handler)
    try:
        result = await agent.answer(
            course=Course.MACHINE_LEARNING,
            question="解释",
            history=[{"role": "user", "content": "此前的问题"}],
            topic_id="ml.machine_learning_basics",
            user="student-1",
        )
        assert result["answer"] == "监督学习"
        assert result["sources"][0]["document_id"] == "remote-doc"
        assert result["retrieval_count"] == 1
        request = requests[0]
        assert str(request.url) == "https://dify.example/v1/chat-messages"
        assert request.headers["Authorization"] == "Bearer app-test-secret"
        body = json.loads(request.content)
        assert body["response_mode"] == "streaming"
        assert body["user"] == "student-1"
        assert body["inputs"] == {
            "course": "machine_learning",
            "topic_id": "ml.machine_learning_basics",
            "tenant": "school",
        }
        assert body["query"] == "此前对话：\n学生：\n此前的问题\n\n学生本次提问：\n解释"
        assert "conversation_id" not in body
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("final_first", [False, True])
async def test_final_message_is_not_appended_to_duplicate_agent_stream(final_first):
    answer = "机器学习可以按学习范式分类。\n\n监督学习使用标签，无监督学习发现结构。"
    fragments = [
        {"event": "agent_message", "answer": answer[:18]},
        {"event": "agent_message", "answer": answer[18:]},
    ]
    final = [{"event": "message", "answer": answer}]
    agent = client(
        lambda request: sse(
            (final + fragments if final_first else fragments + final)
            + [{"event": "message_end", "conversation_id": "conversation-one"}]
        )
    )
    try:
        result = await agent.run("开始学习")
        assert result["answer"] == answer
        assert result["conversation_id"] == "conversation-one"
    finally:
        await agent.close()


@pytest.mark.asyncio
async def test_final_message_deltas_take_precedence_over_agent_draft():
    agent = client(
        lambda request: sse(
            [
                {"event": "agent_message", "answer": "准备检索课程资料。"},
                {"event": "message", "answer": "监督学习"},
                {"event": "message", "answer": "使用带标签数据。"},
                {"event": "message_end"},
            ]
        )
    )
    try:
        assert (await agent.run("问题"))["answer"] == "监督学习使用带标签数据。"
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["message", "agent_message"])
async def test_repeated_deltas_in_the_same_stream_are_preserved(kind):
    agent = client(
        lambda request: sse(
            [
                {"event": kind, "answer": "哈"},
                {"event": kind, "answer": "哈"},
                {"event": "message_end"},
            ]
        )
    )
    try:
        assert (await agent.run("问题"))["answer"] == "哈哈"
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["message", "agent_message"])
async def test_message_replace_replaces_partial_answer_and_ignores_thoughts(kind):
    agent = client(
        lambda request: sse(
            [
                {"event": kind, "answer": "未完成"},
                {"event": "message_replace", "answer": "替换后的回答"},
                {"event": "message_end", "metadata": {}},
            ]
        )
    )
    try:
        assert (await agent.run("问题"))["answer"] == "替换后的回答"
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "events",
    [
        [{"event": "agent_message", "answer": "部分回答"}],
        [{"event": "error", "message": "secret upstream details"}],
        [{"event": "message_end"}],
    ],
)
async def test_agent_errors_empty_and_truncated_streams_are_rejected(events):
    agent = client(lambda request: sse(events))
    try:
        with pytest.raises(LLMServiceError):
            await agent.run("问题")
    finally:
        await agent.close()


@pytest.mark.asyncio
async def test_http_failures_do_not_expose_upstream_body_or_secret():
    agent = client(
        lambda request: httpx.Response(401, text="app-test-secret upstream debug")
    )
    try:
        with pytest.raises(LLMServiceError) as error:
            await agent.run("问题")
        assert "app-test-secret" not in str(error.value)
        assert "upstream debug" not in error.value.message
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["json", "message", "message_end"])
async def test_native_topic_conversation_keeps_query_short_and_captures_remote_id(
    carrier,
):
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        if carrier == "json":
            return httpx.Response(
                200,
                json={"answer": "练习题正文", "conversation_id": "conversation-one"},
            )
        events = [
            {"event": "agent_message", "answer": "练习题正文"},
            {"event": "message_end"},
        ]
        events[0 if carrier == "message" else 1]["conversation_id"] = "conversation-one"
        return sse(events)

    agent = client(handler)
    try:
        first = await agent.answer(
            course=Course.MACHINE_LEARNING,
            question="开始学习",
            history=[],
            user="student-1",
        )
        assert first["conversation_id"] == "conversation-one"
        result = await agent.answer(
            course=Course.MACHINE_LEARNING,
            question="我要做练习",
            user="student-1",
            history=[{"role": "assistant", "content": "此前很长的讲解正文"}],
            conversation_id=first["conversation_id"],
        )
        assert result["answer"] == "练习题正文"
        assert bodies[1]["query"] == "我要做练习"
        assert bodies[1]["conversation_id"] == "conversation-one"
        assert bodies[0]["user"] == bodies[1]["user"]
        assert "conversation_id" not in bodies[0]
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["json", "stream"])
@pytest.mark.parametrize("method", ["run", "answer"])
async def test_usage_and_upstream_ids_survive_both_client_methods(carrier, method):
    usage = {
        "prompt_tokens": 1033,
        "completion_tokens": 128,
        "total_tokens": 1161,
        "total_price": "0.0012890000000000001",
        "currency": "USD",
    }
    identifiers = {
        "message_id": "message-one",
        "task_id": "task-one",
        "workflow_run_id": "workflow-one",
        "conversation_id": "conversation-one",
    }

    def handler(request):
        if carrier == "json":
            return httpx.Response(
                200,
                json={"answer": "回答", "metadata": {"usage": usage}, **identifiers},
            )
        return sse(
            [
                {"event": "workflow_started", "workflow_run_id": "workflow-one"},
                {"event": "agent_message", "answer": "回答", **identifiers},
                {
                    "event": "message_end",
                    "metadata": {"usage": usage},
                    "message_id": None,
                    "task_id": "",
                    "workflow_run_id": " ",
                },
            ]
        )

    agent = client(handler)
    try:
        if method == "run":
            result = await agent.run("问题")
        else:
            result = await agent.answer(course=None, question="问题", history=[])
        assert result["answer"] == "回答"
        assert result["usage"] == {
            **usage,
            "total_price": Decimal("0.0012890000000000001"),
        }
        for name, value in identifiers.items():
            assert result[name] == value
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["json", "stream"])
@pytest.mark.parametrize(
    "metadata",
    [None, {}, [], "invalid", {"usage": None}, {"usage": []}, {"usage": "invalid"}],
)
async def test_missing_or_malformed_usage_remains_unknown(carrier, metadata):
    def handler(request):
        if carrier == "json":
            return httpx.Response(200, json={"answer": "回答", "metadata": metadata})
        return sse(
            [
                {"event": "message", "answer": "回答"},
                {"event": "message_end", "metadata": metadata},
            ]
        )

    agent = client(handler)
    try:
        result = await agent.answer(course=None, question="问题", history=[])
        assert result["answer"] == "回答"
        assert result["usage"] == {
            "prompt_tokens": None,
            "completion_tokens": None,
            "total_tokens": None,
            "total_price": None,
            "currency": None,
        }
        assert result["message_id"] is None
        assert result["task_id"] is None
        assert result["workflow_run_id"] is None
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["json", "stream"])
@pytest.mark.parametrize(
    ("usage", "expected"),
    [
        (
            {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "total_price": "0",
                "currency": "USD",
            },
            {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "total_price": Decimal(0),
                "currency": "USD",
            },
        ),
        (
            {"prompt_tokens": 12},
            {
                "prompt_tokens": 12,
                "completion_tokens": None,
                "total_tokens": None,
                "total_price": None,
                "currency": None,
            },
        ),
        (
            {
                "prompt_tokens": -1,
                "completion_tokens": True,
                "total_tokens": 1.5,
                "total_price": "not-a-price",
                "currency": [],
            },
            {
                "prompt_tokens": None,
                "completion_tokens": None,
                "total_tokens": None,
                "total_price": None,
                "currency": None,
            },
        ),
    ],
)
async def test_zero_partial_and_invalid_usage_are_distinct(carrier, usage, expected):
    def handler(request):
        if carrier == "json":
            return httpx.Response(
                200, json={"answer": "回答", "metadata": {"usage": usage}}
            )
        return sse(
            [
                {"event": "message", "answer": "回答"},
                {"event": "message_end", "metadata": {"usage": usage}},
            ]
        )

    agent = client(handler)
    try:
        result = await agent.run("问题")
        assert result["usage"] == expected
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "price", ["NaN", "sNaN", "Infinity", "-Infinity", "-0.01", True, [], {}]
)
async def test_invalid_prices_are_unknown_without_discarding_valid_tokens(price):
    agent = client(
        lambda request: httpx.Response(
            200,
            json={
                "answer": "回答",
                "metadata": {"usage": {"total_price": price, "prompt_tokens": 7}},
            },
        )
    )
    try:
        usage = (await agent.run("问题"))["usage"]
        assert usage["total_price"] is None
        assert usage["prompt_tokens"] == 7
    finally:
        await agent.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["json", "stream"])
async def test_json_numeric_prices_preserve_decimal_precision(carrier):
    metadata = '"metadata":{"usage":{"total_price":0.12345678901234567890123456789}}'
    if carrier == "json":
        response = httpx.Response(
            200,
            headers={"Content-Type": "application/json"},
            text='{"answer":"回答",' + metadata + "}",
        )
    else:
        response = httpx.Response(
            200,
            headers={"Content-Type": "text/event-stream"},
            text='data: {"event":"message","answer":"回答"}\n\n'
            + 'data: {"event":"message_end",'
            + metadata
            + "}\n\n",
        )
    agent = client(lambda request: response)
    try:
        result = await agent.run("问题")
        assert result["usage"]["total_price"] == Decimal(
            "0.12345678901234567890123456789"
        )
    finally:
        await agent.close()
