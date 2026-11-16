"""Call accounting without prompts, answers, headers or upstream error bodies."""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.core.exceptions import (
    CallLogNotFoundError,
    DifyCredentialDisabledError,
    DifyCredentialNotFoundError,
)
from app.db.database import PostgresDatabase
from app.schemas.dify_call_logs import BEIJING

TREND_TOTALS_SQL = """count(*) AS total_calls,
    CASE WHEN count(*)=0 THEN 0 ELSE sum(l.prompt_tokens) END AS prompt_tokens,
    CASE WHEN count(*)=0 THEN 0 ELSE sum(l.completion_tokens) END AS completion_tokens,
    CASE WHEN count(*)=0 THEN 0 ELSE sum(l.total_tokens) END AS total_tokens,
    count(*) FILTER (WHERE l.prompt_tokens IS NULL) AS unknown_prompt_calls,
    count(*) FILTER (WHERE l.completion_tokens IS NULL) AS unknown_completion_calls,
    count(*) FILTER (WHERE l.total_tokens IS NULL) AS unknown_total_token_calls,
    count(*) FILTER (WHERE l.prompt_tokens IS NULL OR l.completion_tokens IS NULL OR l.total_tokens IS NULL) AS unknown_usage_calls,
    count(*) FILTER (WHERE l.total_price IS NULL OR l.currency IS NULL) AS unknown_cost_calls"""

TREND_CURRENCY_SQL = """l.currency,count(*) AS call_count,
    count(l.total_price) AS known_price_calls,
    count(*) FILTER (WHERE l.total_price IS NULL) AS unknown_price_calls,
    sum(l.total_price) AS total_price"""

ERROR_SUMMARIES = {
    "unexpected_error": "调用发生未预期错误，请结合调用状态和上游标识核对。",
    "upstream_error": "Dify 返回处理失败事件。",
    "http_error": "Dify 返回 HTTP 错误，请结合 HTTP 状态码检查服务配置或稍后重试。",
    "transport_error": "连接 Dify 失败或传输过程中断。",
    "invalid_response": "Dify 响应格式无效，无法完整解析。",
    "incomplete_response": "Dify 返回空回答或响应未完整结束。",
    "timeout": "等待 Dify 响应超时，上游可能仍在执行。",
    "cancelled": "本次调用已取消，已发生的用量仍需核对。",
}

CALL_LOG_JOINS = """FROM dify_call_logs l
    LEFT JOIN students s ON s.id=l.student_id
    LEFT JOIN courses c ON c.id=l.course_id
    LEFT JOIN curriculum_topics t ON t.id=l.topic_id"""


def _filter_sql(filters: dict) -> tuple[str, list]:
    clauses, values = [], []
    for name, columns in {
        "student": ("l.student_id", "s.display_name", "s.username"),
        "course": ("l.course_id", "c.title"),
        "topic": ("l.topic_id", "t.title"),
    }.items():
        if value := filters.get(name):
            # Search literal substrings; '%' and '_' are not user wildcards.
            pattern = (
                "%"
                + value.replace("!", "!!").replace("%", "!%").replace("_", "!_")
                + "%"
            )
            clauses.append(
                "("
                + " OR ".join(f"{column} ILIKE ? ESCAPE '!'" for column in columns)
                + ")"
            )
            values.extend([pattern] * len(columns))
    if credential := filters.get("credential_id"):
        if credential == "unassigned":
            clauses.append("l.credential_id IS NULL")
        else:
            clauses.append("l.credential_id=?")
            values.append(str(credential))
    for name in ("status", "business_type"):
        if filters.get(name):
            clauses.append(f"l.{name}=?")
            values.append(filters[name])
    if filters.get("student_type"):
        clauses.append("l.is_anonymous=?")
        values.append(filters["student_type"] == "anonymous")
    for name, comparison in (("started_from", ">="), ("started_before", "<=")):
        if filters.get(name):
            clauses.append(f"l.started_at{comparison}?")
            values.append(filters[name])
    return (" WHERE " + " AND ".join(clauses) if clauses else ""), values


@dataclass(frozen=True)
class DifyCallContext:
    request_id: str = field(default_factory=lambda: str(uuid4()))
    student_id: str | None = None
    course_id: str | None = None
    topic_id: str | None = None
    business_type: str = "free_qa"


@dataclass
class DifyCallOutcome:
    status: str = "failed"
    error_code: str | None = "unexpected_error"
    http_status: int | None = None
    identifiers: dict = field(default_factory=dict)
    usage: dict = field(default_factory=dict)


class DifyCallLogRepository:
    def __init__(self, database_url: str) -> None:
        self.database = PostgresDatabase(database_url)

    def list(
        self, *, page: int = 1, page_size: int = 20, filters: dict | None = None
    ) -> dict:
        where, parameters = _filter_sql(filters or {})
        with self.database.connect() as connection:
            # Count and page use one snapshot even while new calls arrive.
            connection.execute(
                "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
            )
            total = connection.execute(
                "SELECT count(*) AS count " + CALL_LOG_JOINS + where,
                parameters,
            ).fetchone()["count"]
            items = connection.execute(
                """SELECT l.id,l.credential_id,l.student_id,
                coalesce(s.display_name,s.username) AS student_name,
                l.course_id,c.title AS course_title,l.topic_id,t.title AS topic_title,
                l.business_type,l.is_anonymous,l.started_at,l.duration_ms,l.status,
                l.prompt_tokens,l.completion_tokens,l.total_tokens,l.total_price,l.currency
                """
                + CALL_LOG_JOINS
                + where
                + " ORDER BY l.started_at DESC,l.id DESC LIMIT ? OFFSET ?",
                (*parameters, page_size, (page - 1) * page_size),
            ).fetchall()
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    def filter_options(self) -> dict:
        with self.database.connect() as connection:
            credentials = connection.execute("""SELECT d.id,
                ARRAY(SELECT c.title FROM courses c WHERE c.dify_credential_id=d.id ORDER BY c.title,c.id) AS course_titles,
                EXISTS(SELECT 1 FROM dify_free_qa_settings f WHERE f.dify_credential_id=d.id) AS free_qa
                FROM dify_credentials d
                WHERE EXISTS(SELECT 1 FROM dify_call_logs l WHERE l.credential_id=d.id)
                ORDER BY d.created_at DESC,d.id DESC""").fetchall()
        return {"credentials": credentials}

    def overview(self, *, filters: dict | None = None) -> dict:
        where, parameters = _filter_sql(filters or {})
        with self.database.connect() as connection:
            connection.execute(
                "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
            )
            totals = connection.execute(
                """SELECT CURRENT_TIMESTAMP AS generated_at,count(*) AS total_calls,
                count(*) FILTER (WHERE l.status='succeeded') AS succeeded,
                count(*) FILTER (WHERE l.status='failed') AS failed,
                count(*) FILTER (WHERE l.status='timeout') AS timeout,
                count(*) FILTER (WHERE l.status='cancelled') AS cancelled,
                count(*) FILTER (WHERE l.status='in_progress') AS in_progress,
                CASE WHEN count(*)=0 THEN 0 ELSE sum(l.prompt_tokens) END AS prompt_tokens,
                CASE WHEN count(*)=0 THEN 0 ELSE sum(l.completion_tokens) END AS completion_tokens,
                CASE WHEN count(*)=0 THEN 0 ELSE sum(l.total_tokens) END AS total_tokens,
                count(*) FILTER (WHERE l.prompt_tokens IS NULL) AS unknown_prompt_calls,
                count(*) FILTER (WHERE l.completion_tokens IS NULL) AS unknown_completion_calls,
                count(*) FILTER (WHERE l.total_tokens IS NULL) AS unknown_total_token_calls,
                count(*) FILTER (WHERE l.prompt_tokens IS NULL OR l.completion_tokens IS NULL OR l.total_tokens IS NULL) AS unknown_usage_calls,
                count(*) FILTER (WHERE l.total_price IS NULL) AS unknown_price_calls,
                count(*) FILTER (WHERE l.currency IS NULL) AS unknown_currency_calls,
                count(*) FILTER (WHERE l.total_price IS NULL OR l.currency IS NULL) AS unknown_cost_calls
                """
                + CALL_LOG_JOINS
                + where,
                parameters,
            ).fetchone()
            currencies = connection.execute(
                """SELECT l.currency,count(*) AS call_count,
                count(l.total_price) AS known_price_calls,
                count(*) FILTER (WHERE l.total_price IS NULL) AS unknown_price_calls,
                sum(l.total_price) AS total_price """
                + CALL_LOG_JOINS
                + where
                + " GROUP BY l.currency ORDER BY l.currency NULLS LAST",
                parameters,
            ).fetchall()
        statuses = {
            name: totals.pop(name)
            for name in ("succeeded", "failed", "timeout", "cancelled", "in_progress")
        }
        completed = totals["total_calls"] - statuses["in_progress"]
        return {
            **totals,
            "status_counts": statuses,
            "completed_calls": completed,
            "success_rate": statuses["succeeded"] / completed if completed else None,
            "currencies": currencies,
        }

    def get(self, call_id: str) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                """SELECT l.id,l.credential_id,l.student_id,
                coalesce(s.display_name,s.username) AS student_name,
                l.course_id,c.title AS course_title,l.topic_id,t.title AS topic_title,
                l.business_type,l.is_anonymous,l.started_at,l.duration_ms,l.status,
                l.prompt_tokens,l.completion_tokens,l.total_tokens,l.total_price,l.currency,
                l.request_id,l.finished_at,l.http_status,l.error_code,
                l.conversation_id,l.message_id,l.task_id,l.workflow_run_id
                FROM dify_call_logs l
                LEFT JOIN students s ON s.id=l.student_id
                LEFT JOIN courses c ON c.id=l.course_id
                LEFT JOIN curriculum_topics t ON t.id=l.topic_id
                WHERE l.id=?""",
                (call_id,),
            ).fetchone()
        if row is None:
            raise CallLogNotFoundError()
        row["error_summary"] = ERROR_SUMMARIES.get(row["error_code"])
        return row

    def trends(
        self,
        *,
        filters: dict,
        group_by: str = "credential",
        group_page: int = 1,
        group_page_size: int = 10,
    ) -> dict:
        where, parameters = _filter_sql(filters)
        group_column = {"credential": "l.credential_id", "course": "l.course_id"}[
            group_by
        ]
        day_column = "(l.started_at AT TIME ZONE 'Asia/Shanghai')::date"
        with self.database.connect() as connection:
            connection.execute(
                "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
            )
            generated_at = connection.execute(
                "SELECT CURRENT_TIMESTAMP AS now"
            ).fetchone()["now"]
            daily_rows = connection.execute(
                f"SELECT {day_column} AS day,{TREND_TOTALS_SQL} "
                + CALL_LOG_JOINS
                + where
                + f" GROUP BY GROUPING SETS ((),({day_column})) ORDER BY day",
                parameters,
            ).fetchall()
            currency_rows = connection.execute(
                f"SELECT {day_column} AS day,{TREND_CURRENCY_SQL} "
                + CALL_LOG_JOINS
                + where
                + f" GROUP BY GROUPING SETS ((l.currency),({day_column},l.currency)) ORDER BY day,l.currency NULLS LAST",
                parameters,
            ).fetchall()
            group_total = connection.execute(
                "SELECT count(*) AS count FROM (SELECT "
                + group_column
                + " "
                + CALL_LOG_JOINS
                + where
                + " GROUP BY "
                + group_column
                + ") grouped",
                parameters,
            ).fetchone()["count"]
            groups = connection.execute(
                f"SELECT {group_column} AS group_id,max(c.title) AS course_title,{TREND_TOTALS_SQL} "
                + CALL_LOG_JOINS
                + where
                + f" GROUP BY {group_column}"
                + " ORDER BY total_calls DESC,group_id NULLS LAST LIMIT ? OFFSET ?",
                (*parameters, group_page_size, (group_page - 1) * group_page_size),
            ).fetchall()
            ids = [item["group_id"] for item in groups if item["group_id"] is not None]
            group_currencies = connection.execute(
                f"SELECT {group_column} AS group_id,{TREND_CURRENCY_SQL} "
                + CALL_LOG_JOINS
                + where
                + f" AND ({group_column}=ANY(?) OR ({group_column} IS NULL AND ?))"
                + f" GROUP BY {group_column},l.currency ORDER BY l.currency NULLS LAST",
                (*parameters, ids, any(item["group_id"] is None for item in groups)),
            ).fetchall()
        daily = {}
        totals = None
        for row in daily_rows:
            day = row.pop("day")
            row["currencies"] = []
            if day is None:
                totals = row
            else:
                daily[day] = row
        for row in currency_rows:
            day = row.pop("day")
            (totals if day is None else daily[day])["currencies"].append(row)
        by_group = {item["group_id"]: item for item in groups}
        for item in groups:
            title = item.pop("course_title")
            item["label"] = (
                (title or item["group_id"] or "自由问答／未关联课程")
                if group_by == "course"
                else ("凭据 " + item["group_id"] if item["group_id"] else "未关联凭据")
            )
            item["currencies"] = []
        for row in group_currencies:
            by_group[row.pop("group_id")]["currencies"].append(row)
        first = filters["started_from"].astimezone(BEIJING).date()
        last = filters["started_before"].astimezone(BEIJING).date()
        empty = {name: 0 for name in totals if name != "currencies"}
        return {
            "generated_at": generated_at,
            "timezone": "Asia/Shanghai",
            "started_from": filters["started_from"],
            "started_before": filters["started_before"],
            "group_by": group_by,
            "totals": totals,
            "daily": [
                {"day": day, **daily.get(day, {**empty, "currencies": []})}
                for day in (
                    first + timedelta(days=i) for i in range((last - first).days + 1)
                )
            ],
            "groups": groups,
            "group_total": group_total,
            "group_page": group_page,
            "group_page_size": group_page_size,
        }

    def start(self, context: DifyCallContext, credential_id: str | None) -> str:
        call_id = str(uuid4())
        with self.database.connect() as connection:
            if credential_id is not None:
                # Serialize admission with administrative status updates, even
                # when the caller already holds an older runtime settings copy.
                # Release the lock on commit, before any network operation.
                credential = connection.execute(
                    "SELECT enabled FROM dify_credentials WHERE id=? FOR SHARE",
                    (credential_id,),
                ).fetchone()
                if credential is None:
                    raise DifyCredentialNotFoundError()
                if not credential["enabled"]:
                    raise DifyCredentialDisabledError()
            connection.execute(
                """INSERT INTO dify_call_logs(id,request_id,credential_id,student_id,
                course_id,topic_id,business_type,is_anonymous,started_at,status)
                VALUES (?,?,?,?,?,?,?,?,?,'in_progress')""",
                (
                    call_id,
                    context.request_id,
                    credential_id,
                    context.student_id,
                    context.course_id,
                    context.topic_id,
                    context.business_type,
                    context.student_id is None,
                    datetime.now(UTC),
                ),
            )
        return call_id

    def finish(
        self, call_id: str, outcome: DifyCallOutcome, duration_ms: int, *, secret: str
    ) -> None:
        # Only bounded, key-free identifiers and ISO currency codes enter the log.
        identifiers = []
        for name in ("conversation_id", "message_id", "task_id", "workflow_run_id"):
            value = outcome.identifiers.get(name)
            identifiers.append(
                value
                if isinstance(value, str)
                and re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", value)
                and (not secret or secret not in value)
                else None
            )
        usage = outcome.usage
        currency = usage.get("currency")
        if not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency):
            currency = None
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE dify_call_logs SET status=?,finished_at=?,duration_ms=?,
                error_code=?,http_status=?,conversation_id=?,message_id=?,task_id=?,
                workflow_run_id=?,prompt_tokens=?,completion_tokens=?,total_tokens=?,
                total_price=?,currency=? WHERE id=? AND status='in_progress'""",
                (
                    outcome.status,
                    datetime.now(UTC),
                    duration_ms,
                    outcome.error_code,
                    outcome.http_status,
                    *identifiers,
                    usage.get("prompt_tokens"),
                    usage.get("completion_tokens"),
                    usage.get("total_tokens"),
                    usage.get("total_price"),
                    currency,
                    call_id,
                ),
            )
