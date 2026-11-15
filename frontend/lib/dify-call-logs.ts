import type { DifyCallLogSummary } from "@/lib/types";

export const BUSINESS_LABELS: Record<
  DifyCallLogSummary["business_type"],
  string
> = {
  free_qa: "自由问答",
  topic_teaching: "知识点教学",
  topic_clarification: "知识点追问",
  topic_practice: "练习出题",
  topic_answer: "作答评价",
  diagnosis: "学习诊断",
};

export const STATUSES: Record<
  DifyCallLogSummary["status"],
  { label: string; style: string }
> = {
  in_progress: { label: "进行中", style: "bg-sky-50 text-sky-700" },
  succeeded: { label: "成功", style: "bg-emerald-50 text-emerald-700" },
  failed: { label: "失败", style: "bg-rose-50 text-rose-700" },
  timeout: { label: "超时", style: "bg-amber-50 text-amber-800" },
  cancelled: { label: "已取消", style: "bg-surface text-steel" },
};

const TIME_FORMAT = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatCallTime(value: string | null): string {
  return value === null ? "—" : TIME_FORMAT.format(new Date(value));
}

export function formatCallTokens(value: number | null): string {
  return value === null ? "未知" : value.toLocaleString("zh-CN");
}

export function formatCallDuration(value: number | null): string {
  return value === null
    ? "—"
    : value < 1000
      ? `${value} 毫秒`
      : `${(value / 1000).toFixed(2)} 秒`;
}

export function callLogPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
