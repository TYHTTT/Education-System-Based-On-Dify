from datetime import datetime
from uuid import uuid4

import pytest
from app.services.dify_call_logs import DifyCallContext, DifyCallOutcome

from tests.test_dify_call_logs_api import PATH
from tests.test_dify_call_logs_api import api as _shared_api

api = _shared_api


@pytest.fixture
def filtered_api(api):
    client, logs, headers, student = api
    keys = [str(uuid4()) for _ in range(3)]
    with logs.database.connect() as connection:
        for i, key in enumerate(keys):
            connection.execute(
                """INSERT INTO dify_credentials(id,api_base_url,key_fingerprint,api_key_encrypted)
                VALUES (?,?,?,?)""",
                (
                    key,
                    "https://dify.example/v1",
                    str(i) * 64,
                    "private-encrypted-test-key",
                ),
            )
        connection.execute(
            "UPDATE courses SET dify_credential_id=? WHERE id='machine_learning'",
            (keys[0],),
        )
        connection.execute(
            "UPDATE dify_free_qa_settings SET dify_credential_id=? WHERE id=1",
            (keys[0],),
        )
        connection.execute(
            "UPDATE students SET display_name=? WHERE id=?",
            ("测试%_!学生", student["id"]),
        )
        connection.execute("""INSERT INTO course_chapters(id,course_id,sort_order,title)
            VALUES ('filter-chapter','machine_learning',1,'测试章节')""")
        connection.execute("""INSERT INTO curriculum_topics(id,course,chapter_id,title,order_index,
            description,learning_objectives_json,created_at,updated_at) VALUES
            ('ml.filter_topic','machine_learning','filter-chapter','监督学习 SUPERVISED',1,'','[]','2026-01-01','2026-01-01')""")
    samples = [
        (
            student["id"],
            "machine_learning",
            "ml.filter_topic",
            "topic_teaching",
            "succeeded",
            keys[0],
            "2026-11-15T16:00:00+00:00",
        ),
        (
            student["id"],
            "machine_learning",
            "ml.filter_topic",
            "topic_practice",
            "failed",
            keys[1],
            "2026-11-15T16:30:00+00:00",
        ),
        (None, None, None, "free_qa", "timeout", keys[0], "2026-11-15T17:00:00+00:00"),
        (
            "removed-student",
            "removed-course",
            "removed-topic",
            "topic_clarification",
            "cancelled",
            None,
            "2026-11-15T18:00:00+00:00",
        ),
        (
            student["id"],
            "advanced_mathematics",
            None,
            "topic_answer",
            "in_progress",
            keys[0],
            "2026-11-15T19:00:00+00:00",
        ),
    ]
    ids = []
    for person, course, topic, business, status, key, started in samples:
        call_id = logs.start(
            DifyCallContext(
                student_id=person,
                course_id=course,
                topic_id=topic,
                business_type=business,
            ),
            key,
        )
        if status != "in_progress":
            logs.finish(
                call_id,
                DifyCallOutcome(
                    status=status,
                    error_code=None if status == "succeeded" else "upstream_error",
                ),
                1,
                secret="app-secret",
            )
        with logs.database.connect() as connection:
            connection.execute(
                "UPDATE dify_call_logs SET started_at=? WHERE id=?",
                (datetime.fromisoformat(started), call_id),
            )
        ids.append(call_id)
    return client, headers, student, keys, ids


@pytest.mark.parametrize(
    "query,expected",
    [
        ({"student": " log_student "}, [4, 1, 0]),
        ({"student": "测试"}, [4, 1, 0]),
        ({"student": "%_!"}, [4, 1, 0]),
        ({"student": "removed-student"}, [3]),
        ({"student": "' OR 1=1 --"}, []),
        ({"course": "机器学习"}, [1, 0]),
        ({"course": "MACHINE_LEARNING"}, [1, 0]),
        ({"course": "removed-course"}, [3]),
        ({"topic": "监督学习"}, [1, 0]),
        ({"topic": "ml.filter_topic"}, [1, 0]),
        ({"topic": "removed-topic"}, [3]),
        ({"student_type": "anonymous"}, [2]),
        ({"student_type": "registered"}, [4, 3, 1, 0]),
        ({"status": "timeout"}, [2]),
        ({"business_type": "topic_practice"}, [1]),
        ({"credential_id": "unassigned"}, [3]),
        (
            {
                "started_from": "2026-11-16T00:00:00+08:00",
                "started_before": "2026-11-16T01:00:00+08:00",
            },
            [2, 1, 0],
        ),
        (
            {
                "started_from": "2026-11-15T16:00:00Z",
                "started_before": "2026-11-15T17:00:00Z",
            },
            [2, 1, 0],
        ),
        ({"started_from": "2026-11-15T17:00:00Z"}, [4, 3, 2]),
        ({"started_before": "2026-11-15T16:00:00Z"}, [0]),
        (
            {
                "started_from": "2026-11-16T00:00:00+08:00",
                "started_before": "2026-11-15T16:00:00Z",
            },
            [0],
        ),
    ],
)
def test_filters_match_names_ids_literal_search_and_beijing_boundaries(
    filtered_api, query, expected
):
    client, headers, _, _, ids = filtered_api
    response = client.get(PATH, params=query, headers=headers)
    assert response.status_code == 200
    result = response.json()
    assert result["total"] == len(expected)
    assert [item["id"] for item in result["items"]] == [ids[i] for i in expected]


def test_combination_and_filtered_pagination(filtered_api):
    client, headers, student, keys, ids = filtered_api
    conditions = {
        "credential_id": keys[0],
        "student": student["id"],
        "course": "机器学习",
        "topic": "监督学习",
        "business_type": "topic_teaching",
        "status": "succeeded",
        "student_type": "registered",
        "started_from": "2026-11-16T00:00:00+08:00",
        "started_before": "2026-11-16T01:00:00+08:00",
    }
    result = client.get(PATH, params=conditions, headers=headers).json()
    assert result["total"] == 1
    assert result["items"][0]["id"] == ids[0]
    result = client.get(
        PATH, params={**conditions, "status": "failed"}, headers=headers
    ).json()
    assert result["total"] == 0
    assert result["items"] == []
    collected = []
    for page in [1, 2]:
        result = client.get(
            PATH,
            params={"credential_id": keys[0], "page_size": 2, "page": page},
            headers=headers,
        ).json()
        assert result["total"] == 3
        collected.extend(item["id"] for item in result["items"])
    assert collected == [ids[4], ids[2], ids[0]]
    assert (
        client.get(
            PATH, params={"credential_id": str(uuid4())}, headers=headers
        ).json()["total"]
        == 0
    )


@pytest.mark.parametrize(
    "query",
    [
        {"credential_id": "app-plaintext-key"},
        {"status": "invalid"},
        {"business_type": "invalid"},
        {"student_type": "invalid"},
        {"started_from": "2026-11-16T00:00:00"},
        {"started_before": "invalid"},
        {
            "started_from": "2026-11-16T01:00:00Z",
            "started_before": "2026-11-16T00:00:00Z",
        },
        {"student": "a" * 101},
        {"course": "a" * 101},
        {"topic": "a" * 101},
    ],
)
def test_invalid_filter_values_are_rejected(api, query):
    client, _, headers, _ = api
    assert client.get(PATH, params=query, headers=headers).status_code == 422


def test_credential_options_include_historical_keys_without_secrets(filtered_api):
    client, headers, _, keys, _ = filtered_api
    response = client.get(PATH + "/filter-options", headers=headers)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    by_id = {item["id"]: item for item in response.json()["credentials"]}
    assert set(by_id) == set(keys[:2])
    assert by_id[keys[0]]["course_titles"] == ["机器学习"]
    assert by_id[keys[0]]["free_qa"] is True
    assert by_id[keys[1]]["course_titles"] == []
    assert by_id[keys[1]]["free_qa"] is False
    for item in by_id.values():
        assert set(item) == {"id", "course_titles", "free_qa"}
    assert "private-encrypted-test-key" not in response.text
