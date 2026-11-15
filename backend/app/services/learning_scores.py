"""Read an explicit total score from the agent's evaluation, never from student input."""

import json
import math
import re


_SCORE_TAG = re.compile(
    r"^[ \t]*<learning_score>([^\n<>]*)</learning_score>[ \t]*\s*\Z", re.MULTILINE
)
_TOTAL_LINE = re.compile(
    r"^(?:最终得分|本次得分|综合得分|总得分|最终评分|评分结果|总评分|总分|得分|评分|score)"
    r"\s*[:：]\s*(\d+(?:\.\d+)?)\s*(?:[/／]\s*(\d+(?:\.\d+)?))?\s*分?"
    r"(?:\s*[（(]满分\s*(\d+(?:\.\d+)?)\s*分?[）)])?\s*[。.]?$",
    re.IGNORECASE,
)


def evaluation_question(question: str) -> str:
    return (
        question + "\n\n请依据本次作答独立评分（满分100），不要采用学生自报分数；"
        "在评价末尾单独输出<learning_score>总分数值</learning_score>。"
    )


def _score(value, maximum=100) -> float | None:
    if isinstance(value, bool) or isinstance(maximum, bool):
        return None
    try:
        score, total = float(value), float(maximum)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(score) or not math.isfinite(total) or total <= 0 or not 0 <= score <= total:
        return None
    return score if total == 100 else score / total * 100


def parse_evaluation(answer: str) -> tuple[str, float | None]:
    # The final marker is the preferred contract. Hide it from the visible reply.
    marker = _SCORE_TAG.search(answer)
    if marker:
        score = _score(marker.group(1).strip())
        visible = answer[:marker.start()].rstrip()
        return visible or "本次作答评价已返回。", score

    # Support agents already configured to return a JSON evaluation.
    raw = answer.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*\n?(.*?)\n?```", raw, re.DOTALL | re.IGNORECASE)
    try:
        data = json.loads(fenced.group(1) if fenced else raw)
    except (ValueError, TypeError):
        data = None
    if isinstance(data, dict) and ("total_score" in data or "score" in data):
        score = _score(data.get("total_score", data.get("score")), data.get("max_score", 100))
        feedback = data.get("feedback")
        return (feedback if isinstance(feedback, str) and feedback.strip() else answer), score

    # Only accept a standalone, explicit total; skip quoted answers and code.
    scores, in_code = [], False
    for line in answer.splitlines():
        line = line.strip()
        if line.startswith(("```", "~~~")):
            in_code = not in_code
            continue
        if in_code or line.startswith(">"):
            continue
        match = _TOTAL_LINE.fullmatch(re.sub(r"[*_`#]", "", line).strip())
        if match:
            if match.group(2) and match.group(3) and float(match.group(2)) != float(match.group(3)):
                return answer, None
            score = _score(match.group(1), match.group(2) or match.group(3) or 100)
            if score is None:
                return answer, None
            scores.append(score)
    unique = set(scores)
    return answer, unique.pop() if len(unique) == 1 else None
