from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.types import TOPIC_ID_PATTERN, UUID_ID_PATTERN

TopicId = Annotated[str, Field(pattern=TOPIC_ID_PATTERN, max_length=160)]
ChapterId = Annotated[str, Field(pattern=rf"^{UUID_ID_PATTERN}$")]


class BatchTitles(BaseModel):
    model_config = ConfigDict(extra="forbid")
    titles: list[str] = Field(min_length=1, max_length=200)

    @field_validator("titles")
    @classmethod
    def clean_titles(cls, values):
        titles = [value.strip() for value in values if value.strip()]
        if not titles:
            raise ValueError("请至少输入一个名称")
        if any(len(title) > 100 or "\n" in title or "\r" in title for title in titles):
            raise ValueError("每项名称需为 1 到 100 个字符，且不能包含换行")
        if len(titles) != len(set(titles)):
            raise ValueError("名称有重复，请删除重复行")
        return titles


class TopicBatchCreate(BatchTitles):
    chapter_id: ChapterId


class TopicWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chapter_id: ChapterId
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    learning_objectives: list[str] = Field(default_factory=list, max_length=30)
    related_topic_ids: list[TopicId] | None = Field(default=None, max_length=1000)

    @field_validator("related_topic_ids")
    @classmethod
    def unique_related_topics(cls, values):
        if values is not None and len(values) != len(set(values)):
            raise ValueError("相关知识点不能重复")
        return values

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        if not value.strip():
            raise ValueError("知识点名称不能为空")
        return value.strip()

    @field_validator("learning_objectives")
    @classmethod
    def clean_lines(cls, values):
        if any(not value.strip() or len(value) > 500 for value in values):
            raise ValueError("每项内容需为 1 到 500 个字符")
        return list(dict.fromkeys(value.strip() for value in values))


class TopicOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    group_id: ChapterId
    topic_ids: list[TopicId] = Field(min_length=1, max_length=1000)

    @field_validator("topic_ids")
    @classmethod
    def unique_topics(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("排序中的知识点不能重复")
        return value


class ChapterWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=100)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        if not value.strip():
            raise ValueError("章节名称不能为空")
        return value.strip()


class ChapterOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    group_ids: list[ChapterId] = Field(min_length=1, max_length=10000)

    @field_validator("group_ids")
    @classmethod
    def unique_groups(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("章节不能重复")
        return value


class ChapterDelete(ChapterWrite):
    # Match the reviewed chapter before performing an irreversible bulk delete.
    topic_ids: list[TopicId] = Field(max_length=1000)

    @field_validator("topic_ids")
    @classmethod
    def unique_topics(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("待删除的知识点不能重复")
        return value
