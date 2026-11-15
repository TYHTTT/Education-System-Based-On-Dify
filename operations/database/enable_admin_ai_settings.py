"""Move course thresholds and Dify credentials into administrator-managed settings."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import psycopg
from psycopg.rows import dict_row
from app.core.config import Settings
from app.core.settings_cipher import SettingsCipher


def enable_admin_ai_settings(settings):
    with psycopg.connect(settings.database_url, row_factory=dict_row, connect_timeout=10) as connection:
        connection.execute("SET LOCAL lock_timeout='10s'")
        connection.execute("SELECT pg_advisory_xact_lock(725498104)")
        connection.execute("LOCK TABLE courses IN ACCESS EXCLUSIVE MODE")
        columns = {row["column_name"] for row in connection.execute("""SELECT column_name FROM information_schema.columns
            WHERE table_schema=current_schema() AND table_name='courses'""")}
        had_free_qa = connection.execute("SELECT to_regclass('dify_free_qa_settings') AS name").fetchone()["name"] is not None
        connection.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"), prepare=False)
        if "completion_threshold" not in columns:
            connection.execute("UPDATE courses SET completion_threshold=%s", (settings.learning_completion_threshold,))
        secret = settings.dify_api_key.get_secret_value().strip()
        encrypted = SettingsCipher(settings).encrypt(secret) if secret and ("dify_api_key_encrypted" not in columns or not had_free_qa) else None
        address = settings.dify_api_base_url.strip().rstrip("/") or "https://api.dify.ai/v1"
        if "dify_api_key_encrypted" not in columns:
            connection.execute("UPDATE courses SET dify_api_base_url=%s,dify_api_key_encrypted=%s", (address, encrypted))
        if not had_free_qa:
            connection.execute("UPDATE dify_free_qa_settings SET api_base_url=%s,api_key_encrypted=%s WHERE id=1", (address, encrypted))


if __name__ == "__main__":
    try:
        enable_admin_ai_settings(Settings())
    except Exception as error:
        print(f"后台 AI 配置迁移失败（{type(error).__name__}），事务已回滚。", file=sys.stderr)
        raise SystemExit(1)
    print("已迁移每门课程的完成门限和 Dify 配置，自由问答配置已独立保存；密钥已加密。")
