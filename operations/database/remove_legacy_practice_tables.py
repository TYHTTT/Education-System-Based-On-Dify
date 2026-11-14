"""Remove retired local question and grading tables without backups or tests."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg
from app.core.config import Settings


def remove_legacy_practice_tables(database_url):
    with psycopg.connect(database_url, connect_timeout=10) as connection:
        connection.execute("SET LOCAL lock_timeout='10s'")
        connection.execute("SELECT pg_advisory_xact_lock(725498104)")
        connection.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"), prepare=False)


if __name__ == "__main__":
    try:
        remove_legacy_practice_tables(Settings().database_url)
    except Exception as error:
        print(f"旧练习表清理失败（{type(error).__name__}），事务已回滚。", file=sys.stderr)
        raise SystemExit(1)
    print("已删除旧练习、题目、提交、作答、错题与维度评估 6 张表及其数据，并清理知识点评估维度字段。")
