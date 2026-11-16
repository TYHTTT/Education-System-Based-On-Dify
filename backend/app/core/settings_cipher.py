"""Encrypt integration credentials with a server-owned key, separate from the database."""

import os
import tempfile

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings
from app.core.exceptions import ConfigurationError


class SettingsCipher:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _fernet(self, *, create: bool) -> Fernet:
        supplied = self.settings.settings_encryption_key.get_secret_value().strip()
        if supplied:
            try:
                key = supplied.encode("ascii")
            except UnicodeError:
                raise ConfigurationError("服务器配置加密密钥无效。") from None
        else:
            path = self.settings.settings_key_file
            if not path.exists() and create:
                path.parent.mkdir(parents=True, exist_ok=True)
                # Publish a complete key atomically without replacing another worker's key.
                with tempfile.NamedTemporaryFile(
                    dir=path.parent, delete=False
                ) as temporary:
                    temporary.write(Fernet.generate_key())
                    temporary_path = temporary.name
                try:
                    try:
                        os.link(temporary_path, path)
                    except FileExistsError:
                        pass
                finally:
                    os.unlink(temporary_path)
            try:
                key = path.read_bytes().strip()
            except FileNotFoundError:
                raise ConfigurationError(
                    "配置加密文件缺失，请恢复服务器密钥文件或在后台重新填写 Dify 密钥。"
                ) from None
        try:
            return Fernet(key)
        except (ValueError, TypeError):
            raise ConfigurationError("服务器配置加密密钥无效。") from None

    def encrypt(self, value: str) -> str:
        return self._fernet(create=True).encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, value: str) -> str:
        try:
            return (
                self._fernet(create=False)
                .decrypt(value.encode("ascii"))
                .decode("utf-8")
            )
        except (InvalidToken, ValueError, UnicodeError):
            raise ConfigurationError(
                "Dify 密钥无法解密，请恢复服务器密钥文件或在后台重新填写。"
            ) from None
