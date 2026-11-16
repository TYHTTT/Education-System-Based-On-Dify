"""Administrative usage and admission status; never select secret material."""

from app.core.exceptions import DifyCredentialNotFoundError
from app.db.database import PostgresDatabase


class DifyCredentialManagementRepository:
    def __init__(self, database_url: str) -> None:
        self.database = PostgresDatabase(database_url)

    def list(self, *, page: int = 1, page_size: int = 20) -> dict:
        with self.database.connect() as connection:
            connection.execute(
                "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
            )
            total = connection.execute(
                "SELECT count(*) AS count FROM dify_credentials"
            ).fetchone()["count"]
            items = connection.execute(
                """SELECT d.id,d.enabled,d.created_at,
                ARRAY(SELECT c.title FROM courses c WHERE c.dify_credential_id=d.id ORDER BY c.title,c.id) AS course_titles,
                EXISTS(SELECT 1 FROM dify_free_qa_settings f WHERE f.dify_credential_id=d.id) AS free_qa
                FROM dify_credentials d ORDER BY d.created_at DESC,d.id DESC
                LIMIT ? OFFSET ?""",
                (page_size, (page - 1) * page_size),
            ).fetchall()
            ids = [item["id"] for item in items]
            # Aggregate all historical calls for the displayed keys in two
            # queries, independent of the number of keys or log pages.
            usage = connection.execute(
                """SELECT credential_id,count(*) AS total_calls,
                count(*) FILTER (WHERE status='in_progress') AS in_progress_calls,
                sum(prompt_tokens) AS prompt_tokens,
                sum(completion_tokens) AS completion_tokens,sum(total_tokens) AS total_tokens,
                count(*) FILTER (WHERE prompt_tokens IS NULL) AS unknown_prompt_calls,
                count(*) FILTER (WHERE completion_tokens IS NULL) AS unknown_completion_calls,
                count(*) FILTER (WHERE total_tokens IS NULL) AS unknown_total_token_calls,
                count(*) FILTER (WHERE prompt_tokens IS NULL OR completion_tokens IS NULL OR total_tokens IS NULL) AS unknown_usage_calls,
                count(*) FILTER (WHERE total_price IS NULL OR currency IS NULL) AS unknown_cost_calls
                FROM dify_call_logs WHERE credential_id=ANY(?) GROUP BY credential_id""",
                (ids,),
            ).fetchall()
            currencies = connection.execute(
                """SELECT credential_id,currency,count(*) AS call_count,
                count(total_price) AS known_price_calls,
                count(*) FILTER (WHERE total_price IS NULL) AS unknown_price_calls,
                sum(total_price) AS total_price FROM dify_call_logs
                WHERE credential_id=ANY(?) GROUP BY credential_id,currency
                ORDER BY currency NULLS LAST""",
                (ids,),
            ).fetchall()
        by_id = {row.pop("credential_id"): row for row in usage}
        currency_by_id: dict[str, list[dict]] = {}
        for row in currencies:
            currency_by_id.setdefault(row.pop("credential_id"), []).append(row)
        empty = dict.fromkeys(
            (
                "total_calls",
                "in_progress_calls",
                "prompt_tokens",
                "completion_tokens",
                "total_tokens",
                "unknown_prompt_calls",
                "unknown_completion_calls",
                "unknown_total_token_calls",
                "unknown_usage_calls",
                "unknown_cost_calls",
            ),
            0,
        )
        return {
            "items": [
                {
                    **item,
                    **by_id.get(item["id"], empty),
                    "currencies": currency_by_id.get(item["id"], []),
                }
                for item in items
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def set_enabled(self, credential_id: str, enabled: bool) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                "UPDATE dify_credentials SET enabled=? WHERE id=? RETURNING id,enabled",
                (enabled, credential_id),
            ).fetchone()
            if row is None:
                raise DifyCredentialNotFoundError()
        return row
