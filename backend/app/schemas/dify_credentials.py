from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, StrictBool

from app.schemas.dify_call_logs import DifyCurrencyUsage


class DifyCredentialQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=50)


class DifyCredentialStatus(BaseModel):
    id: str
    enabled: bool


class DifyCredentialUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: StrictBool


class DifyCredentialUsage(DifyCredentialStatus):
    created_at: datetime
    course_titles: list[str]
    free_qa: bool
    total_calls: int
    in_progress_calls: int
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    unknown_prompt_calls: int
    unknown_completion_calls: int
    unknown_total_token_calls: int
    unknown_usage_calls: int
    unknown_cost_calls: int
    currencies: list[DifyCurrencyUsage]


class DifyCredentialList(BaseModel):
    items: list[DifyCredentialUsage]
    total: int
    page: int
    page_size: int
