from datetime import UTC, datetime

from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import CourseNotFoundError
from app.core.settings_cipher import SettingsCipher
from app.db.database import PostgresDatabase


class DifySettingsRepository:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.database = PostgresDatabase(settings.database_url)
        self.cipher = SettingsCipher(settings)

    def public_free_qa(self):
        with self.database.connect() as connection:
            row = connection.execute("SELECT * FROM dify_free_qa_settings WHERE id=1").fetchone()
        return {
            "api_base_url": row["api_base_url"] if row else "https://api.dify.ai/v1",
            "api_key_configured": bool(row and row["api_key_encrypted"]),
            "updated_at": row["updated_at"] if row else "",
        }

    def save_free_qa(self, values):
        key = values.get("api_key")
        encrypted = self.cipher.encrypt(key.get_secret_value()) if key else None
        with self.database.connect() as connection:
            connection.execute("""INSERT INTO dify_free_qa_settings(id,api_base_url,api_key_encrypted,updated_at)
                VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET
                api_base_url=excluded.api_base_url,
                api_key_encrypted=coalesce(excluded.api_key_encrypted,dify_free_qa_settings.api_key_encrypted),
                updated_at=excluded.updated_at""", (values["api_base_url"], encrypted, datetime.now(UTC).isoformat()))
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
                row = connection.execute("""SELECT api_base_url,api_key_encrypted
                    FROM dify_free_qa_settings WHERE id=1""").fetchone()
            else:
                row = connection.execute("""SELECT dify_api_base_url AS api_base_url,
                    dify_api_key_encrypted AS api_key_encrypted,completion_threshold
                    FROM courses WHERE id=? AND active=1""", (str(course),)).fetchone()
                if row is None:
                    raise CourseNotFoundError()
        secret = self.cipher.decrypt(row["api_key_encrypted"]) if row and row["api_key_encrypted"] else ""
        updates = {"dify_api_base_url": row["api_base_url"] if row else "https://api.dify.ai/v1",
                   "dify_api_key": SecretStr(secret)}
        if course is not None:
            updates["learning_completion_threshold"] = row["completion_threshold"]
        return self.settings.model_copy(update=updates)
