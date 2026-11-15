"""Server-side Dify Agent transport shared by chat and learning tasks."""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from uuid import uuid4

import httpx

from app.core.config import Settings
from app.core.exceptions import ConfigurationError, LLMServiceError
from app.core.types import Course


class DifyClient:
    def __init__(self, settings: Settings, *, transport=None, http_client=None) -> None:
        self.settings = settings
        self._owns_http = http_client is None
        self.http = (
            http_client
            if http_client is not None
            else httpx.AsyncClient(
                timeout=settings.dify_timeout_seconds, transport=transport
            )
        )

    async def close(self) -> None:
        if self._owns_http:
            await self.http.aclose()

    async def run(
        self,
        query: str,
        *,
        course: Course | None = None,
        topic_id: str | None = None,
        user: str | None = None,
        conversation_id: str | None = None,
    ) -> dict:
        key = self.settings.dify_api_key.get_secret_value().strip()
        if not key or not self.settings.dify_api_base_url.strip():
            raise ConfigurationError(
                "请在管理员后台配置当前课程或自由问答的 Dify 地址和密钥"
            )
        payload = {
            "inputs": {
                **{
                    key: value
                    for key, value in self.settings.dify_inputs.items()
                    if key not in {"course", "topic_id"}
                },
                **({"course": course.value} if course else {}),
                **({"topic_id": topic_id} if topic_id else {}),
            },
            "query": query,
            "response_mode": "streaming",
            "user": user or f"course-coach-{uuid4().hex}",
            "auto_generate_name": False,
        }
        if conversation_id:
            payload["conversation_id"] = conversation_id
        answer = ""
        agent_answer = ""
        remote_conversation_id = conversation_id
        remote_ids = dict.fromkeys(("message_id", "task_id", "workflow_run_id"))
        metadata = {}
        ended = False
        try:
            async with self.http.stream(
                "POST",
                self.settings.dify_api_base_url.rstrip("/") + "/chat-messages",
                headers={"Authorization": f"Bearer {key}"},
                json=payload,
            ) as response:
                response.raise_for_status()
                if "application/json" in response.headers.get("content-type", ""):
                    body = json.loads(await response.aread(), parse_float=Decimal)
                    _capture_response_ids(body, remote_ids)
                    answer = body.get("answer", "")
                    metadata = body.get("metadata") or {}
                    remote_conversation_id = (
                        body.get("conversation_id") or remote_conversation_id
                    )
                    ended = True
                else:
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data or data == "[DONE]":
                            continue
                        event = json.loads(data, parse_float=Decimal)
                        _capture_response_ids(event, remote_ids)
                        kind = event.get("event")
                        remote_conversation_id = (
                            event.get("conversation_id") or remote_conversation_id
                        )
                        if kind == "error":
                            raise LLMServiceError(
                                "Dify Agent 处理失败，请检查应用配置后重试"
                            )
                        # Agents can stream their draft and then emit the same
                        # full answer as a message. Keep the channels separate:
                        # message is authoritative; agent_message is a fallback.
                        if kind == "message":
                            answer += event.get("answer", "")
                        elif kind == "agent_message":
                            agent_answer += event.get("answer", "")
                        elif kind == "message_replace":
                            answer = event.get("answer", "")
                            agent_answer = ""
                        elif kind == "message_end":
                            metadata = event.get("metadata") or {}
                            ended = True
        except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
            # Do not return upstream response bodies, headers, or credentials.
            raise LLMServiceError(
                "Dify 服务请求失败，请检查服务地址、密钥或稍后重试",
                internal_message=f"Dify transport: {type(exc).__name__}",
            ) from None
        if answer == "":
            answer = agent_answer
        if not ended or not isinstance(answer, str) or not answer.strip():
            raise LLMServiceError("Dify 返回了空回答或未完整结束的响应，请重试")
        resources = (
            metadata.get("retriever_resources", [])
            if isinstance(metadata, dict)
            else []
        )
        return {
            "answer": answer,
            "resources": resources if isinstance(resources, list) else [],
            "conversation_id": remote_conversation_id,
            **remote_ids,
            "usage": _usage_snapshot(metadata),
        }

    async def answer(
        self,
        *,
        course: Course | None,
        question: str,
        history: list[dict[str, str]],
        topic_id: str | None = None,
        user: str | None = None,
        conversation_id: str | None = None,
    ) -> dict:
        query = question
        if history and not conversation_id:
            transcript = "\n\n".join(
                f"{'学生' if item['role'] == 'user' else '课程助手'}：\n{item['content']}"
                for item in history
            )
            query = f"此前对话：\n{transcript}\n\n学生本次提问：\n{question}"
        result = await self.run(
            query,
            course=course,
            topic_id=topic_id,
            user=user,
            conversation_id=conversation_id,
        )
        sources = resource_snapshots(result["resources"], course=course)
        return {
            "answer": result["answer"],
            "course": course,
            "sources": [{**item, "snippet": item["content"][:600]} for item in sources],
            "retrieval_count": len(sources),
            "conversation_id": result.get("conversation_id"),
            "message_id": result.get("message_id"),
            "task_id": result.get("task_id"),
            "workflow_run_id": result.get("workflow_run_id"),
            "usage": result["usage"],
        }


def _capture_response_ids(payload: dict, identifiers: dict) -> None:
    """Keep IDs from any event; later omissions must not erase earlier IDs."""
    for name in identifiers:
        value = payload.get(name)
        if isinstance(value, str) and value.strip():
            identifiers[name] = value


def _usage_snapshot(metadata: object) -> dict:
    """Normalize reported usage without treating missing/invalid values as zero.

    Prices remain Decimal values for backend accounting. Do not infer totals:
    partial upstream usage must remain distinguishable from a complete report.
    """
    usage = metadata.get("usage") if isinstance(metadata, dict) else None
    if not isinstance(usage, dict):
        usage = {}
    snapshot = {}
    for name in ("prompt_tokens", "completion_tokens", "total_tokens"):
        value = usage.get(name)
        snapshot[name] = value if type(value) is int and value >= 0 else None
    price = usage.get("total_price")
    amount = None
    if isinstance(price, (str, int, Decimal)) and not isinstance(price, bool):
        try:
            parsed = Decimal(price)
            if parsed.is_finite() and parsed >= 0:
                amount = parsed
        except InvalidOperation:
            pass
    snapshot["total_price"] = amount
    currency = usage.get("currency")
    snapshot["currency"] = (
        currency.strip() if isinstance(currency, str) and currency.strip() else None
    )
    return snapshot


def resource_snapshots(resources: list, *, course: Course | None) -> list[dict]:
    """Keep actual Dify citations; ignore explicitly foreign course metadata."""
    snapshots = []
    seen = set()
    for resource in resources:
        if (
            not isinstance(resource, dict)
            or not isinstance(resource.get("content"), str)
            or not resource["content"].strip()
        ):
            continue
        metadata = resource.get("doc_metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        source_course = metadata.get("course")
        topic_id = metadata.get("topic_id")
        if course and source_course and source_course != course.value:
            continue
        try:
            resolved_course = course or (
                Course(source_course) if source_course else None
            )
        except ValueError:
            resolved_course = None
        identity = resource.get("segment_id") or (
            resource.get("document_id"),
            resource["content"],
        )
        if identity in seen:
            continue
        seen.add(identity)
        snapshots.append(
            {
                "source_id": f"S{len(snapshots) + 1}",
                "source_course": resolved_course.value if resolved_course else None,
                "topic_id": topic_id,
                "document_id": str(resource.get("document_id") or "dify"),
                "source_file": str(
                    resource.get("document_name")
                    or resource.get("dataset_name")
                    or "Dify 课程资料"
                ),
                "title": str(resource.get("document_name") or "Dify 课程资料"),
                "chapter": None,
                "section": None,
                "page": None,
                "chunk_index": len(snapshots),
                "content": resource["content"],
            }
        )
    return snapshots
