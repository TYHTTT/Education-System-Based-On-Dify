"""Add credential identities and backfill existing Dify settings atomically."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from psycopg import Error as PostgresError

BACKEND_ROOT = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings
from app.core.exceptions import ConfigurationError
from app.core.settings_cipher import SettingsCipher
from app.db.database import PostgresDatabase
from app.services.dify_credentials import DifyCredentialRepository

SCHEMA_FILE = Path(__file__).with_suffix(".sql")


def migrate_database(settings: Settings) -> dict[str, int]:
    with PostgresDatabase(settings.database_url).connect() as connection:
        connection.execute_script(SCHEMA_FILE.read_text(encoding="utf-8"))
        return DifyCredentialRepository(SettingsCipher(settings)).backfill(connection)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="为已有 Dify 配置建立凭据内部身份")
    parser.add_argument("--database-url", help="覆盖配置中的 PostgreSQL DATABASE_URL")
    args = parser.parse_args(argv)
    try:
        settings = Settings()
        if args.database_url:
            settings = settings.model_copy(update={"database_url": args.database_url})
        counts = migrate_database(settings)
    except (ConfigurationError, PostgresError, OSError, ValueError) as exc:
        # Do not print SQL parameters, connection strings or decrypted secrets.
        print(
            f"升级失败（{type(exc).__name__}），事务已回滚，请检查数据库和配置加密密钥。",
            file=sys.stderr,
        )
        return 1
    print(
        f"Dify 凭据升级完成：关联 {counts['courses']} 门课程、{counts['free_qa']} 项自由问答配置。"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
