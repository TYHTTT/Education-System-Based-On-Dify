from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from app.schemas.dify_settings import DifyApiUrl, clean_api_key


class CourseFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    active: bool = True
    completion_threshold: float = Field(default=80, ge=0, le=100, allow_inf_nan=False)
    dify_api_base_url: DifyApiUrl = "https://api.dify.ai/v1"
    dify_api_key: SecretStr | None = Field(default=None, max_length=8192)

    @field_validator("dify_api_key")
    @classmethod
    def normalize_key(cls, value):
        return clean_api_key(value)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        if not value.strip():
            raise ValueError("课程名称不能为空")
        return value.strip()


class CreateCourseRequest(CourseFields):
    pass


class UpdateCourseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    active: bool | None = None
    completion_threshold: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    dify_api_base_url: DifyApiUrl | None = None
    dify_api_key: SecretStr | None = Field(default=None, max_length=8192)

    @field_validator("dify_api_key")
    @classmethod
    def normalize_key(cls, value):
        return clean_api_key(value)

    @model_validator(mode="after")
    def check_update(self):
        if not self.model_fields_set or any(
            getattr(self, name) is None for name in self.model_fields_set if name != "dify_api_key"
        ):
            raise ValueError("请提供需要修改的课程信息，字段不能为 null")
        if self.title is not None:
            if not self.title.strip():
                raise ValueError("课程名称不能为空")
            self.title = self.title.strip()
        return self


class CourseResponse(BaseModel):
    id: str
    title: str
    description: str
    active: bool
    completion_threshold: float
    topic_count: int
    stage_count: int
    created_at: datetime
    updated_at: datetime


class AdminCourseResponse(CourseResponse):
    dify_api_base_url: str
    dify_api_key_configured: bool


class CourseListResponse(BaseModel):
    items: list[AdminCourseResponse]
    total: int
    page: int
    page_size: int


class CourseTopicResponse(BaseModel):
    id: str
    title: str
    stage: int
    stage_title: str
    active: bool


class CourseDetailResponse(AdminCourseResponse):
    topics: list[CourseTopicResponse]
