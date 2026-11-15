from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, field_serializer


class CnyConversion(BaseModel):
    amount: Decimal
    rate: Decimal
    rate_date: date | None
    source: Literal["Frankfurter", "original"]

    @field_serializer("amount", "rate", when_used="json")
    def decimal_string(self, value: Decimal) -> str:
        return format(value, "f")


class DifyCallLogSummary(BaseModel):
    id: str
    credential_id: str | None
    student_id: str | None
    student_name: str | None
    course_id: str | None
    course_title: str | None
    topic_id: str | None
    topic_title: str | None
    business_type: Literal[
        "free_qa",
        "topic_teaching",
        "topic_clarification",
        "topic_practice",
        "topic_answer",
        "diagnosis",
    ]
    is_anonymous: bool
    started_at: datetime
    duration_ms: int | None
    status: Literal["in_progress", "succeeded", "failed", "timeout", "cancelled"]
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    # Serialize Decimal as a string to preserve small prices in the browser.
    total_price: Decimal | None
    currency: str | None
    cny_conversion: CnyConversion | None = None


class DifyCallLogList(BaseModel):
    items: list[DifyCallLogSummary]
    total: int
    page: int
    page_size: int


class DifyCallLogDetail(DifyCallLogSummary):
    request_id: str
    finished_at: datetime | None
    http_status: int | None
    error_code: (
        Literal[
            "unexpected_error",
            "upstream_error",
            "http_error",
            "transport_error",
            "invalid_response",
            "incomplete_response",
            "timeout",
            "cancelled",
        ]
        | None
    )
    error_summary: str | None
    conversation_id: str | None
    message_id: str | None
    task_id: str | None
    workflow_run_id: str | None
