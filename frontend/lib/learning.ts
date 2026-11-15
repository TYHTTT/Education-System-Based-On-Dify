import type {
  CurriculumTopicSummary,
  NextAction,
  TopicStatus,
} from "@/lib/types";

export const TOPIC_STATUS_META: Record<
  TopicStatus,
  { label: string; symbol: string; badge: string; border: string }
> = {
  not_started: {
    label: "未开始",
    symbol: "○",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    border: "border-sky-200",
  },
  learning: {
    label: "学习中",
    symbol: "▶",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    border: "border-indigo-200",
  },
  mastered: {
    label: "已完成",
    symbol: "✓",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    border: "border-emerald-200",
  },
};

export const NEXT_ACTION_LABELS: Record<string, string> = {
  start_learning: "开始知识点学习",
  continue_learning: "继续当前知识点学习",
  course_completed: "课程学习已完成",
};

export function nextActionLabel(action?: NextAction | null): string {
  if (!action) return "继续学习";
  return NEXT_ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export function statusMeta(status?: TopicStatus | string | null) {
  return (
    TOPIC_STATUS_META[(status ?? "not_started") as TopicStatus] ??
    TOPIC_STATUS_META.not_started
  );
}

export function percent(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "尚未评估";
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

/** Only display progress backed by a saved AI evaluation. */
export function hasValidTopicEvidence(
  topic: Pick<CurriculumTopicSummary, "status" | "mastery" | "evidence_count">,
): boolean {
  if (topic.status === "not_started") return false;
  return (topic.evidence_count ?? 0) > 0 && topic.mastery != null;
}
