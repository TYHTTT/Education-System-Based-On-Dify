from typing import Annotated
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    field_validator,
)


def clean_api_url(value: str) -> str:
    value = value.strip().rstrip("/")
    try:
        parsed = urlsplit(value)
        valid = (
            not any(character.isspace() for character in value)
            and parsed.scheme in {"http", "https"}
            and parsed.hostname
            and not (
                parsed.username or parsed.password or parsed.query or parsed.fragment
            )
        )
        parsed.port
    except ValueError:
        valid = False
    if not valid:
        raise ValueError(
            "请输入有效的 Dify HTTP/HTTPS API 地址，不包含用户名、密码、查询参数或片段"
        )
    return value


def clean_api_key(value: SecretStr | None) -> SecretStr | None:
    if value is None or not value.get_secret_value().strip():
        return None
    secret = value.get_secret_value().strip()
    if not secret.isascii() or any(character.isspace() for character in secret):
        raise ValueError("API 密钥不能包含空白或非 ASCII 字符")
    return SecretStr(secret)


DifyApiUrl = Annotated[
    str, Field(min_length=1, max_length=2048), AfterValidator(clean_api_url)
]


class DifySettingsWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_base_url: DifyApiUrl
    api_key: SecretStr | None = Field(default=None, max_length=8192)

    @field_validator("api_key")
    @classmethod
    def normalize_key(cls, value):
        return clean_api_key(value)


class DifySettingsResponse(BaseModel):
    api_base_url: str
    api_key_configured: bool
    updated_at: str
