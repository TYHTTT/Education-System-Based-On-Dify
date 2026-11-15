"""Add Dify call accounting tables and indexes without rewriting existing data."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from psycopg import Error as PostgresError

BACKEND_ROOT = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings
from app.db.database import PostgresDatabase

SCHEMA_FILE = Path(__file__).with_suffix(".sql")


def migrate_database(settings: Settings) -> None:
    with PostgresDatabase(settings.database_url).connect() as connection:
        connection.execute_script(SCHEMA_FILE.read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="增量创建 Dify 调用明细表")
    parser.add_argument("--database-url", help="覆盖配置中的 PostgreSQL DATABASE_URL")
    args = parser.parse_args(argv)
    try:
        settings = Settings()
        if args.database_url:
            settings = settings.model_copy(update={"database_url": args.database_url})
        migrate_database(settings)
    except (PostgresError, OSError, ValueError) as exc:
        print(
            f"升级失败（{type(exc).__name__}），请检查数据库及凭据身份升级是否完成。",
            file=sys.stderr,
        )
        return 1
    print("Dify 调用明细表升级完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
