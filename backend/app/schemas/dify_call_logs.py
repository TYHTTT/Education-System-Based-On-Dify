from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


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


class DifyCallLogList(BaseModel):
    items: list[DifyCallLogSummary]
    total: int
    page: int
    page_size: int
