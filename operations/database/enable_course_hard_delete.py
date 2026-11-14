"""Purge previously deleted courses and retire course soft deletion."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import Settings
from app.db.database import PostgresDatabase
from app.services.curriculum_cleanup import delete_course


def enable_course_hard_delete(database_url):
    with PostgresDatabase(database_url).connect() as connection:
        connection.execute("SET LOCAL lock_timeout='10s'")
        connection.execute("SELECT pg_advisory_xact_lock(725498104)")
        connection.execute("LOCK TABLE courses IN ACCESS EXCLUSIVE MODE")
        legacy_column = connection.execute("""SELECT 1 FROM information_schema.columns
            WHERE table_schema=current_schema() AND table_name='courses' AND column_name='deleted_at'""").fetchone()
        retired = connection.execute("SELECT id FROM courses WHERE deleted_at IS NOT NULL ORDER BY id").fetchall() if legacy_column else []
        for course in retired:
            delete_course(connection, course["id"])
        connection.execute_script(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))
    return len(retired)


if __name__ == "__main__":
    try:
        count = enable_course_hard_delete(Settings().database_url)
    except Exception as error:
        print(f"课程永久删除迁移失败（{type(error).__name__}），事务已回滚。", file=sys.stderr)
        raise SystemExit(1)
    print(f"已启用课程永久删除，清理 {count} 门历史已删除课程及其关联数据，移除软删除字段。")
