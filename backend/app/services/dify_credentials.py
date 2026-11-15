"""Stable Dify credential identities shared by course and free-QA settings."""

from hashlib import sha256

import httpx

from app.core.settings_cipher import SettingsCipher
from app.db.database import PostgresConnection
from app.schemas.dify_settings import clean_api_url


def canonical_api_url(value: str) -> str:
    """Match HTTP URL normalization while preserving instance paths and schemes."""
    url = httpx.URL(clean_api_url(value))
    if url.port == {"https": 443, "http": 80}.get(url.scheme):
        url = url.copy_with(port=None)
    return str(url).rstrip("/")


class DifyCredentialRepository:
    """All writes use the settings caller's transaction; old IDs are never removed."""

    def __init__(self, cipher: SettingsCipher) -> None:
        self.cipher = cipher

    def resolve(
        self,
        connection: PostgresConnection,
        api_base_url: str,
        api_key_encrypted: str | None,
    ) -> str | None:
        if not api_key_encrypted:
            return None
        secret = self.cipher.decrypt(api_key_encrypted).strip()
        if not secret:
            return None
        fingerprint = sha256(secret.encode("utf-8")).hexdigest()
        row = connection.execute(
            """INSERT INTO dify_credentials(api_base_url,key_fingerprint,api_key_encrypted)
            VALUES (?,?,?) ON CONFLICT (api_base_url,key_fingerprint)
            DO UPDATE SET api_key_encrypted=excluded.api_key_encrypted RETURNING id""",
            (canonical_api_url(api_base_url), fingerprint, api_key_encrypted),
        ).fetchone()
        return row["id"]

    def backfill(self, connection: PostgresConnection) -> dict[str, int]:
        """Bind existing settings without changing their URL, ciphertext or timestamp."""
        counts = {"courses": 0, "free_qa": 0}
        courses = connection.execute(
            """SELECT id,dify_api_base_url,dify_api_key_encrypted FROM courses
            WHERE dify_credential_id IS NULL AND dify_api_key_encrypted IS NOT NULL
            ORDER BY id FOR UPDATE"""
        ).fetchall()
        # Lock settings before credential writes, matching individual saves.
        free_qa = connection.execute(
            """SELECT api_base_url,api_key_encrypted FROM dify_free_qa_settings
            WHERE id=1 AND dify_credential_id IS NULL AND api_key_encrypted IS NOT NULL
            FOR UPDATE"""
        ).fetchone()
        for row in courses:
            credential_id = self.resolve(
                connection, row["dify_api_base_url"], row["dify_api_key_encrypted"]
            )
            connection.execute(
                "UPDATE courses SET dify_credential_id=? WHERE id=?",
                (credential_id, row["id"]),
            )
            counts["courses"] += 1
        if free_qa:
            credential_id = self.resolve(
                connection, free_qa["api_base_url"], free_qa["api_key_encrypted"]
            )
            connection.execute(
                "UPDATE dify_free_qa_settings SET dify_credential_id=? WHERE id=1",
                (credential_id,),
            )
            counts["free_qa"] = 1
        return counts
