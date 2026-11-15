from datetime import UTC, datetime

from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import CourseNotFoundError
from app.core.settings_cipher import SettingsCipher
from app.db.database import PostgresDatabase
from app.services.dify_credentials import DifyCredentialRepository


class DifySettingsRepository:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.database = PostgresDatabase(settings.database_url)
        self.cipher = SettingsCipher(settings)
        self.credentials = DifyCredentialRepository(self.cipher)

    def public_free_qa(self):
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM dify_free_qa_settings WHERE id=1"
            ).fetchone()
        return {
            "api_base_url": row["api_base_url"] if row else "https://api.dify.ai/v1",
            "api_key_configured": bool(row and row["api_key_encrypted"]),
            "updated_at": row["updated_at"] if row else "",
        }

    def save_free_qa(self, values):
        key = values.get("api_key")
        encrypted = self.cipher.encrypt(key.get_secret_value()) if key else None
        with self.database.connect() as connection:
            connection.execute(
                "INSERT INTO dify_free_qa_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING"
            )
            previous = connection.execute(
                "SELECT * FROM dify_free_qa_settings WHERE id=1 FOR UPDATE"
            ).fetchone()
            if previous["api_key_encrypted"] and previous["dify_credential_id"] is None:
                self.credentials.resolve(
                    connection, previous["api_base_url"], previous["api_key_encrypted"]
                )
            encrypted = encrypted or previous["api_key_encrypted"]
            credential_id = self.credentials.resolve(
                connection, values["api_base_url"], encrypted
            )
            connection.execute(
                """UPDATE dify_free_qa_settings SET api_base_url=?,
                api_key_encrypted=?,dify_credential_id=?,updated_at=? WHERE id=1""",
                (
                    values["api_base_url"],
                    encrypted,
                    credential_id,
                    datetime.now(UTC).isoformat(),
                ),
            )
        return self.public_free_qa()

    def any_configured(self):
        with self.database.connect() as connection:
            return connection.execute("""SELECT
                EXISTS(SELECT 1 FROM dify_free_qa_settings WHERE api_key_encrypted IS NOT NULL AND api_base_url<>'')
                OR EXISTS(SELECT 1 FROM courses WHERE active=1 AND dify_api_key_encrypted IS NOT NULL AND dify_api_base_url<>'')
                AS configured""").fetchone()["configured"]

    def runtime_settings(self, course=None) -> Settings:
        with self.database.connect() as connection:
            if course is None:
                row = connection.execute("""SELECT api_base_url,api_key_encrypted,dify_credential_id
                    FROM dify_free_qa_settings WHERE id=1 FOR UPDATE""").fetchone()
            else:
                row = connection.execute(
                    """SELECT dify_api_base_url AS api_base_url,
                    dify_api_key_encrypted AS api_key_encrypted,dify_credential_id,completion_threshold
                    FROM courses WHERE id=? AND active=1 FOR UPDATE""",
                    (str(course),),
                ).fetchone()
                if row is None:
                    raise CourseNotFoundError()
            if row and row["api_key_encrypted"] and row["dify_credential_id"] is None:
                row["dify_credential_id"] = self.credentials.resolve(
                    connection, row["api_base_url"], row["api_key_encrypted"]
                )
                if course is None:
                    connection.execute(
                        "UPDATE dify_free_qa_settings SET dify_credential_id=? WHERE id=1",
                        (row["dify_credential_id"],),
                    )
                else:
                    connection.execute(
                        "UPDATE courses SET dify_credential_id=? WHERE id=?",
                        (row["dify_credential_id"], str(course)),
                    )
        secret = (
            self.cipher.decrypt(row["api_key_encrypted"])
            if row and row["api_key_encrypted"]
            else ""
        )
        updates = {
            "dify_api_base_url": row["api_base_url"]
            if row
            else "https://api.dify.ai/v1",
            "dify_api_key": SecretStr(secret),
            "dify_credential_id": row["dify_credential_id"] if row else None,
        }
        if course is not None:
            updates["learning_completion_threshold"] = row["completion_threshold"]
        return self.settings.model_copy(update=updates)
