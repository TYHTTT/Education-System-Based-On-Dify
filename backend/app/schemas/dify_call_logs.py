from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

DifyBusinessType = Literal[
    "free_qa",
    "topic_teaching",
    "topic_clarification",
    "topic_practice",
    "topic_answer",
    "diagnosis",
]
DifyCallStatus = Literal["in_progress", "succeeded", "failed", "timeout", "cancelled"]


class DifyCallLogFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    credential_id: UUID | Literal["unassigned"] | None = None
    student: str | None = Field(default=None, max_length=100)
    course: str | None = Field(default=None, max_length=100)
    topic: str | None = Field(default=None, max_length=100)
    student_type: Literal["registered", "anonymous"] | None = None
    business_type: DifyBusinessType | None = None
    status: DifyCallStatus | None = None
    started_from: AwareDatetime | None = None
    started_before: AwareDatetime | None = None

    @field_validator("student", "course", "topic")
    @classmethod
    def clean_search(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @model_validator(mode="after")
    def check_range(self):
        if (
            self.started_from
            and self.started_before
            and self.started_from >= self.started_before
        ):
            raise ValueError("截止时间必须晚于开始时间")
        return self


class DifyCallLogQuery(DifyCallLogFilters):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=50)


class DifyCallCredentialOption(BaseModel):
    id: str
    course_titles: list[str]
    free_qa: bool


class DifyCallLogFilterOptions(BaseModel):
    credentials: list[DifyCallCredentialOption]


class CnyConversion(BaseModel):
    amount: Decimal
    rate: Decimal
    rate_date: date | None
    source: Literal["Frankfurter", "original"]

    @field_serializer("amount", "rate", when_used="json")
    def decimal_string(self, value: Decimal) -> str:
        return format(value, "f")


class DifyCurrencyUsage(BaseModel):
    currency: str | None
    call_count: int
    known_price_calls: int
    unknown_price_calls: int
    total_price: Decimal | None
    cny_conversion: CnyConversion | None = None


class DifyUsageStatusCounts(BaseModel):
    succeeded: int
    failed: int
    timeout: int
    cancelled: int
    in_progress: int


class DifyUsageOverview(BaseModel):
    generated_at: datetime
    total_calls: int
    completed_calls: int
    success_rate: float | None
    status_counts: DifyUsageStatusCounts
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    unknown_prompt_calls: int
    unknown_completion_calls: int
    unknown_total_token_calls: int
    unknown_usage_calls: int
    unknown_price_calls: int
    unknown_currency_calls: int
    unknown_cost_calls: int
    currencies: list[DifyCurrencyUsage]


class DifyCallLogSummary(BaseModel):
    id: str
    credential_id: str | None
    student_id: str | None
    student_name: str | None
    course_id: str | None
    course_title: str | None
    topic_id: str | None
    topic_title: str | None
    business_type: DifyBusinessType
    is_anonymous: bool
    started_at: datetime
    duration_ms: int | None
    status: DifyCallStatus
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
