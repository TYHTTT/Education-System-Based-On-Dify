"""Persist randomly assigned course graph colors without backups or tests."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg
from app.core.config import Settings


def enable_course_graph_colors(database_url):
    with psycopg.connect(database_url, connect_timeout=10) as connection:
        connection.execute("SET LOCAL lock_timeout='10s'")
        connection.execute("SELECT pg_advisory_xact_lock(725498104)")
        connection.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"), prepare=False)


if __name__ == "__main__":
    try:
        enable_course_graph_colors(Settings().database_url)
    except Exception as error:
        print(f"图谱课程颜色迁移失败（{type(error).__name__}），事务已回滚。", file=sys.stderr)
        raise SystemExit(1)
    print("课程图谱颜色已配置为创建时随机分配并持久保存，已有课程已补齐颜色。")
