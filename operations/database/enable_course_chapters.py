"""Migrate chapters to fixed UUID IDs and separate sorting, without backups."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg
from app.core.config import Settings

SQL_FILE = Path(__file__).with_suffix(".sql")


def enable_course_chapters(database_url):
    with psycopg.connect(database_url, connect_timeout=10) as connection:
        connection.execute("SET LOCAL lock_timeout='10s'")
        connection.execute("SELECT pg_advisory_xact_lock(725498104)")
        connection.execute(SQL_FILE.read_text(encoding="utf-8"), prepare=False)


if __name__ == "__main__":
    try:
        enable_course_chapters(Settings().database_url)
    except Exception as error:
        print(f"章节迁移失败（{type(error).__name__}），事务已回滚。", file=sys.stderr)
        raise SystemExit(1)
    print("章节已迁移为固定 UUID ID 和独立排序字段，知识点归属已同步。")
