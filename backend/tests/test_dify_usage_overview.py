from datetime import datetime
from decimal import Decimal

import pytest
from app.services.dify_call_logs import DifyCallContext, DifyCallOutcome

from tests.test_dify_call_log_filters import filtered_api as _filtered_api
from tests.test_dify_call_logs_api import PATH
from tests.test_dify_call_logs_api import api as _api

api = _api
filtered_api = _filtered_api
OVERVIEW = PATH + "/overview"


def overview(client, headers, **query):
    response = client.get(OVERVIEW, headers=headers, params=query)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    return response.json()


def test_empty_overview_has_zero_totals_without_fabricating_success_rate(api):
    client, _, headers, _ = api
    result = overview(client, headers)
    assert result["total_calls"] == result["completed_calls"] == 0
    assert result["success_rate"] is None
    assert result["status_counts"] == dict.fromkeys(
        ["succeeded", "failed", "timeout", "cancelled", "in_progress"], 0
    )
    for field in (
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "unknown_usage_calls",
        "unknown_cost_calls",
        "unknown_price_calls",
        "unknown_currency_calls",
    ):
        assert result[field] == 0
    assert result["currencies"] == []
    assert datetime.fromisoformat(result["generated_at"]).tzinfo is not None


def test_mixed_usage_includes_failure_costs_and_separates_currencies_and_unknowns(api):
    client, logs, headers, _ = api
    context = DifyCallContext()
    samples = [
        ("succeeded", 10, 2, 12, "0.01", "USD"),
        ("failed", 5, None, None, "0.002", "USD"),
        ("timeout", None, None, None, None, "USD"),
        ("in_progress", None, None, None, None, None),
        ("cancelled", 0, 0, 0, "0", "CNY"),
        ("succeeded", 20, 3, 23, "0.3", "EUR"),
        ("succeeded", None, None, None, "0.4", None),
    ]
    for status, prompt, completion, total, price, currency in samples:
        call_id = logs.start(context, None)
        if status != "in_progress":
            outcome = DifyCallOutcome(
                status=status,
                error_code=None if status == "succeeded" else "upstream_error",
                usage={
                    "prompt_tokens": prompt,
                    "completion_tokens": completion,
                    "total_tokens": total,
                    "total_price": Decimal(price) if price is not None else None,
                    "currency": currency,
                },
            )
            logs.finish(call_id, outcome, 1, secret="app-secret")
            logs.finish(
                call_id,
                DifyCallOutcome(
                    status="failed",
                    usage={
                        "total_tokens": 999,
                        "total_price": Decimal(999),
                        "currency": "USD",
                    },
                ),
                2,
                secret="app-secret",
            )
    result = overview(client, headers)
    assert result["total_calls"] == 7
    assert result["completed_calls"] == 6
    assert result["success_rate"] == 0.5
    assert result["status_counts"] == {
        "succeeded": 3,
        "failed": 1,
        "timeout": 1,
        "cancelled": 1,
        "in_progress": 1,
    }
    assert result["prompt_tokens"] == 35
    assert result["completion_tokens"] == 5
    assert result["total_tokens"] == 35
    assert result["unknown_prompt_calls"] == 3
    assert (
        result["unknown_completion_calls"] == result["unknown_total_token_calls"] == 4
    )
    assert result["unknown_usage_calls"] == 4
    assert result["unknown_price_calls"] == 2
    assert result["unknown_currency_calls"] == 2
    assert result["unknown_cost_calls"] == 3
    currencies = {item["currency"]: item for item in result["currencies"]}
    assert set(currencies) == {"USD", "CNY", "EUR", None}
    assert currencies["USD"]["call_count"] == 3
    assert currencies["USD"]["known_price_calls"] == 2
    assert currencies["USD"]["unknown_price_calls"] == 1
    assert currencies["USD"]["total_price"] == "0.012"
    assert Decimal(currencies["USD"]["cny_conversion"]["amount"]) == Decimal(
        "0.012"
    ) * Decimal("6.6646")
    assert currencies["CNY"]["total_price"] == "0"
    assert currencies["CNY"]["cny_conversion"]["source"] == "original"
    assert currencies["EUR"]["total_price"] == "0.3"
    assert currencies[None]["total_price"] == "0.4"
    assert currencies[None]["cny_conversion"] is None
    assert client.get(PATH, headers=headers).json()["total"] == result["total_calls"]
    assert overview(client, headers)["currencies"] == result["currencies"]


def test_nonempty_all_unknown_and_only_pending_is_distinct_from_zero(api):
    client, logs, headers, _ = api
    logs.start(DifyCallContext(), None)
    result = overview(client, headers)
    assert result["success_rate"] is None
    assert result["completed_calls"] == 0
    for name in ("prompt_tokens", "completion_tokens", "total_tokens"):
        assert result[name] is None
    assert result["unknown_usage_calls"] == result["unknown_cost_calls"] == 1
    assert result["currencies"][0]["total_price"] is None
    assert result["currencies"][0]["known_price_calls"] == 0


def test_overview_sums_all_matching_pages_with_exact_decimal_prices(api):
    client, logs, headers, _ = api
    price = Decimal("0.000123456789012345678901")
    for _ in range(23):
        call_id = logs.start(DifyCallContext(), None)
        logs.finish(
            call_id,
            DifyCallOutcome(
                status="succeeded",
                error_code=None,
                usage={
                    "prompt_tokens": 1,
                    "completion_tokens": 0,
                    "total_tokens": 1,
                    "total_price": price,
                    "currency": "USD",
                },
            ),
            1,
            secret="app-secret",
        )
    page = client.get(PATH, headers=headers).json()
    assert len(page["items"]) == 20
    result = overview(client, headers)
    assert result["total_calls"] == page["total"] == 23
    assert result["prompt_tokens"] == result["total_tokens"] == 23
    assert result["completion_tokens"] == 0
    assert result["success_rate"] == 1
    assert result["unknown_usage_calls"] == result["unknown_cost_calls"] == 0
    assert Decimal(result["currencies"][0]["total_price"]) == price * 23


@pytest.mark.parametrize(
    "query,expected",
    [
        ({}, 5),
        ({"status": "failed"}, 1),
        ({"student_type": "anonymous"}, 1),
        ({"course": "机器学习", "topic": "监督学习"}, 2),
        (
            {
                "started_from": "2026-11-16T00:00:00+08:00",
                "started_before": "2026-11-16T01:00:00+08:00",
            },
            3,
        ),
        ({"student": "does-not-exist"}, 0),
    ],
)
def test_overview_uses_exactly_the_same_filter_scope_as_logs(
    filtered_api, query, expected
):
    client, headers, _, _, _ = filtered_api
    summary = overview(client, headers, **query)
    listed = client.get(PATH, params=query, headers=headers).json()
    assert summary["total_calls"] == listed["total"] == expected
    assert sum(summary["status_counts"].values()) == expected
    assert sum(item["call_count"] for item in summary["currencies"]) == expected


@pytest.mark.parametrize(
    "query",
    [
        {"status": "invalid"},
        {"credential_id": "app-secret"},
        {"started_from": "2026-11-16T00:00:00"},
        {
            "started_from": "2026-11-16T01:00:00Z",
            "started_before": "2026-11-16T00:00:00Z",
        },
    ],
)
def test_overview_validates_filters(api, query):
    client, _, headers, _ = api
    assert client.get(OVERVIEW, params=query, headers=headers).status_code == 422
