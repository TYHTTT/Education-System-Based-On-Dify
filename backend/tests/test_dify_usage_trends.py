from datetime import datetime
from decimal import Decimal

import pytest
from app.schemas.dify_call_logs import BEIJING
from app.services.dify_call_logs import DifyCallContext, DifyCallOutcome

from tests.test_dify_call_log_filters import filtered_api as _filtered_api
from tests.test_dify_call_logs_api import PATH
from tests.test_dify_call_logs_api import api as _api
from tests.test_dify_credential_management import seed

api = _api
filtered_api = _filtered_api
TRENDS = PATH + "/trends"
WINDOW = {
    "started_from": "2026-11-16T00:00:00+08:00",
    "started_before": "2026-11-19T00:00:00+08:00",
}


def trends(client, headers, **query):
    response = client.get(TRENDS, headers=headers, params={**WINDOW, **query})
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "no-store"
    return response.json()


def record(
    logs,
    *,
    at=WINDOW["started_from"],
    credential=None,
    course=None,
    status="succeeded",
    usage=None,
):
    call = logs.start(DifyCallContext(course_id=course), credential)
    if status != "in_progress":
        logs.finish(
            call,
            DifyCallOutcome(status=status, error_code=None, usage=usage or {}),
            1,
            secret="secret",
        )
    with logs.database.connect() as connection:
        connection.execute(
            "UPDATE dify_call_logs SET started_at=? WHERE id=?",
            (datetime.fromisoformat(at), call),
        )
    return call


def test_default_window_is_thirty_beijing_days_and_empty_dates_are_filled(api):
    client, _, headers, _ = api
    response = client.get(TRENDS, headers=headers)
    assert response.status_code == 200
    result = response.json()
    assert result["timezone"] == "Asia/Shanghai"
    assert len(result["daily"]) == 30
    assert result["daily"][-1]["day"] == datetime.now(BEIJING).date().isoformat()
    assert result["totals"]["total_calls"] == result["totals"]["total_tokens"] == 0
    assert result["totals"]["currencies"] == []
    assert result["group_total"] == 0 and result["groups"] == []
    assert all(
        row["total_calls"] == row["prompt_tokens"] == 0 for row in result["daily"]
    )


def test_beijing_midnight_boundaries_and_exclusive_end_match_logs(api):
    client, logs, headers, _ = api
    for at in [
        "2026-11-15T23:59:59+08:00",  # outside
        "2026-11-16T00:00:00+08:00",
        "2026-11-15T16:30:00+00:00",
        "2026-11-16T15:59:59+00:00",
        "2026-11-16T16:00:00+00:00",
        "2026-11-17T15:59:59+00:00",
        "2026-11-18T16:00:00+00:00",  # exact exclusive end
    ]:
        record(logs, at=at)
    result = trends(client, headers)
    assert [(day["day"], day["total_calls"]) for day in result["daily"]] == [
        ("2026-11-16", 3),
        ("2026-11-17", 2),
        ("2026-11-18", 0),
    ]
    listed = client.get(PATH, headers=headers, params=WINDOW).json()
    assert result["totals"]["total_calls"] == listed["total"] == 5
    assert result["daily"][0]["total_tokens"] is None
    assert result["daily"][-1]["total_tokens"] == 0


def test_partial_boundary_days_and_equivalent_foreign_timezones(api):
    client, logs, headers, _ = api
    record(logs, at="2026-11-16T12:00:00+08:00")
    record(logs, at="2026-11-16T11:59:59+08:00")
    record(logs, at="2026-11-17T12:00:00+08:00")
    result = trends(
        client,
        headers,
        started_from="2026-11-15T23:00:00-05:00",
        started_before="2026-11-17T12:00:00+08:00",
    )
    assert [day["total_calls"] for day in result["daily"]] == [1, 0]


def test_daily_totals_and_groups_match_overview_with_exact_currency_subtotals(api):
    client, logs, headers, _ = api
    first, second = seed(logs), seed(logs, key="b")
    tiny = Decimal("0.000123456789012345678901")
    samples = [
        (first, "machine_learning", "succeeded", 10, 2, 12, tiny, "USD"),
        (first, "machine_learning", "failed", 5, None, None, Decimal("0.2"), "USD"),
        (second, "deleted-course", "timeout", None, None, None, None, "USD"),
        (second, "deleted-course", "cancelled", 0, 0, 0, Decimal(0), "CNY"),
        (None, None, "succeeded", 20, 3, 23, Decimal("0.3"), "EUR"),
        (None, None, "succeeded", None, None, None, Decimal("0.4"), None),
        (None, None, "in_progress", None, None, None, None, None),
    ]
    for (
        credential,
        course,
        status,
        prompt,
        completion,
        total,
        price,
        currency,
    ) in samples:
        record(
            logs,
            credential=credential,
            course=course,
            status=status,
            usage={
                "prompt_tokens": prompt,
                "completion_tokens": completion,
                "total_tokens": total,
                "total_price": price,
                "currency": currency,
            },
        )
    result = trends(client, headers)
    overview = client.get(PATH + "/overview", headers=headers, params=WINDOW).json()
    for key, value in result["totals"].items():
        assert value == overview[key]
        assert result["daily"][0][key] == value
    assert result["totals"]["total_calls"] == 7
    assert result["totals"]["unknown_usage_calls"] == 4
    groups = {group["group_id"]: group for group in result["groups"]}
    assert groups[first]["total_calls"] == 2
    assert groups[second]["total_calls"] == 2
    assert groups[None]["total_calls"] == 3 and groups[None]["label"] == "未关联凭据"
    assert Decimal(groups[first]["currencies"][0]["total_price"]) == tiny + Decimal(
        "0.2"
    )
    assert groups[first]["currencies"][0]["cny_conversion"] is not None
    courses = trends(client, headers, group_by="course")
    assert courses["totals"] == result["totals"] and courses["daily"] == result["daily"]
    labels = {group["group_id"]: group["label"] for group in courses["groups"]}
    assert labels == {
        "machine_learning": "机器学习",
        "deleted-course": "deleted-course",
        None: "自由问答／未关联课程",
    }
    assert "encrypted-secret" not in str(result)
    assert "key_fingerprint" not in str(result)


def test_same_named_courses_and_shared_credentials_keep_correct_identity(api):
    client, logs, headers, _ = api
    credential = seed(logs)
    with logs.database.connect() as connection:
        connection.execute(
            "INSERT INTO courses(id,title,description) VALUES ('deep_learning','同名课程','')"
        )
        connection.execute("UPDATE courses SET title='同名课程'")
    for course in ("machine_learning", "deep_learning"):
        record(logs, credential=credential, course=course)
    with logs.database.connect() as connection:
        connection.execute("UPDATE dify_credentials SET enabled=FALSE")
    keyed = trends(client, headers)
    assert keyed["group_total"] == 1 and keyed["groups"][0]["total_calls"] == 2
    courses = trends(client, headers, group_by="course")
    assert courses["group_total"] == 2
    assert {group["group_id"] for group in courses["groups"]} == {
        "machine_learning",
        "deep_learning",
    }
    assert all(group["label"] == "同名课程" for group in courses["groups"])


def test_all_group_pages_preserve_global_totals_daily_and_stable_order(api):
    client, logs, headers, _ = api
    # Log ownership deliberately survives course deletion and has no FK.
    for i in range(23):
        record(logs, course=f"deleted-{i:02}", usage={"total_tokens": 1})
    first = trends(client, headers, group_by="course")
    second = trends(client, headers, group_by="course", group_page=2)
    third = trends(client, headers, group_by="course", group_page=3)
    assert first["group_total"] == 23
    assert (
        len(first["groups"]) == len(second["groups"]) == 10
        and len(third["groups"]) == 3
    )
    ids = [
        group["group_id"]
        for result in (first, second, third)
        for group in result["groups"]
    ]
    assert ids == [f"deleted-{i:02}" for i in range(23)]
    assert first["totals"] == second["totals"] == third["totals"]
    assert first["daily"] == second["daily"] == third["daily"]
    assert first["totals"]["total_calls"] == first["totals"]["total_tokens"] == 23
    assert trends(client, headers, group_by="course", group_page=5)["groups"] == []


@pytest.mark.parametrize(
    "query",
    [
        {"status": "failed"},
        {"student_type": "anonymous"},
        {"course": "机器学习", "topic": "监督学习"},
        {"student": "does-not-exist"},
        {"credential_id": "unassigned"},
    ],
)
def test_shared_filter_scopes_match_logs_and_overview(filtered_api, query):
    client, headers, _, _, _ = filtered_api
    filters = {
        "started_from": "2026-11-14T00:00:00+08:00",
        "started_before": "2026-11-19T00:00:00+08:00",
        **query,
    }
    result = trends(client, headers, **filters)
    overview = client.get(PATH + "/overview", headers=headers, params=filters).json()
    assert (
        result["totals"]["total_calls"]
        == client.get(PATH, headers=headers, params=filters).json()["total"]
    )
    for key, value in result["totals"].items():
        assert value == overview[key]
    assert (
        sum(day["total_calls"] for day in result["daily"])
        == result["totals"]["total_calls"]
    )


@pytest.mark.parametrize(
    "query",
    [
        {"group_by": "l.id; DROP TABLE dify_call_logs"},
        {"group_page": 0},
        {"group_page_size": 21},
        {"started_from": "2026-01-01"},
        {"started_from": "2026-11-19T00:00:00+08:00"},
        {
            "started_from": "2024-01-01T00:00:00+08:00",
            "started_before": "2025-01-02T00:00:00+08:00",
        },
        {"status": "bad"},
        {"credential_id": "app-secret"},
        {"page": 1},
    ],
)
def test_invalid_or_excessive_ranges_and_parameters_rejected(api, query):
    client, _, headers, _ = api
    assert (
        client.get(TRENDS, headers=headers, params={**WINDOW, **query}).status_code
        == 422
    )


def test_leap_year_maximum_range_is_accepted(api):
    client, _, headers, _ = api
    result = trends(
        client,
        headers,
        started_from="2024-01-01T00:00:00+08:00",
        started_before="2025-01-01T00:00:00+08:00",
    )
    assert len(result["daily"]) == 366
    assert result["daily"][0]["day"] == "2024-01-01"
    assert result["daily"][-1]["day"] == "2024-12-31"
    assert datetime.fromisoformat(result["generated_at"]).tzinfo is not None
