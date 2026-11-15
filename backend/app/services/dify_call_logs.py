"""Call accounting without prompts, answers, headers or upstream error bodies."""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from app.db.database import PostgresDatabase


@dataclass(frozen=True)
class DifyCallContext:
    request_id: str = field(default_factory=lambda: str(uuid4()))
    student_id: str | None = None
    course_id: str | None = None
    topic_id: str | None = None
    business_type: str = "free_qa"


@dataclass
class DifyCallOutcome:
    status: str = "failed"
    error_code: str | None = "unexpected_error"
    http_status: int | None = None
    identifiers: dict = field(default_factory=dict)
    usage: dict = field(default_factory=dict)


class DifyCallLogRepository:
    def __init__(self, database_url: str) -> None:
        self.database = PostgresDatabase(database_url)

    def start(self, context: DifyCallContext, credential_id: str | None) -> str:
        call_id = str(uuid4())
        with self.database.connect() as connection:
            connection.execute(
                """INSERT INTO dify_call_logs(id,request_id,credential_id,student_id,
                course_id,topic_id,business_type,is_anonymous,started_at,status)
                VALUES (?,?,?,?,?,?,?,?,?,'in_progress')""",
                (
                    call_id,
                    context.request_id,
                    credential_id,
                    context.student_id,
                    context.course_id,
                    context.topic_id,
                    context.business_type,
                    context.student_id is None,
                    datetime.now(UTC),
                ),
            )
        return call_id

    def finish(
        self, call_id: str, outcome: DifyCallOutcome, duration_ms: int, *, secret: str
    ) -> None:
        # Only bounded, key-free identifiers and ISO currency codes enter the log.
        identifiers = []
        for name in ("conversation_id", "message_id", "task_id", "workflow_run_id"):
            value = outcome.identifiers.get(name)
            identifiers.append(
                value
                if isinstance(value, str)
                and re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", value)
                and (not secret or secret not in value)
                else None
            )
        usage = outcome.usage
        currency = usage.get("currency")
        if not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency):
            currency = None
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE dify_call_logs SET status=?,finished_at=?,duration_ms=?,
                error_code=?,http_status=?,conversation_id=?,message_id=?,task_id=?,
                workflow_run_id=?,prompt_tokens=?,completion_tokens=?,total_tokens=?,
                total_price=?,currency=? WHERE id=? AND status='in_progress'""",
                (
                    outcome.status,
                    datetime.now(UTC),
                    duration_ms,
                    outcome.error_code,
                    outcome.http_status,
                    *identifiers,
                    usage.get("prompt_tokens"),
                    usage.get("completion_tokens"),
                    usage.get("total_tokens"),
                    usage.get("total_price"),
                    currency,
                    call_id,
                ),
            )
