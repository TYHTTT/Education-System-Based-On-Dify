import type { DifyCallLogFilters, DifyTrendUsage } from "@/lib/types";

export const TREND_METRICS = {
  total_calls: "调用次数",
  prompt_tokens: "已报告输入 Token",
  completion_tokens: "已报告输出 Token",
  total_tokens: "已报告总 Token",
  cost: "已报告费用",
} as const;
export type TrendMetric = keyof typeof TREND_METRICS;

export function trendFilters(
  filters: DifyCallLogFilters,
  now = new Date(),
): DifyCallLogFilters {
  const today = new Date(now.getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  const midnight = new Date(today + "T00:00:00+08:00");
  return {
    ...filters,
    started_from:
      filters.started_from ||
      new Date(midnight.getTime() - 29 * 86400000).toISOString(),
    started_before:
      filters.started_before ||
      new Date(midnight.getTime() + 86400000).toISOString(),
  };
}

export function trendValue(
  row: DifyTrendUsage,
  metric: TrendMetric,
  currency: string,
) {
  if (metric === "cost") {
    const cost = row.currencies.find((item) => item.currency === currency);
    return {
      raw: currency ? (cost ? cost.total_price : "0") : null,
      unknown: cost?.unknown_price_calls ?? 0,
    };
  }
  const unknown =
    metric === "prompt_tokens"
      ? row.unknown_prompt_calls
      : metric === "completion_tokens"
        ? row.unknown_completion_calls
        : metric === "total_tokens"
          ? row.unknown_total_token_calls
          : 0;
  const value = row[metric];
  return { raw: value === null ? null : String(value), unknown };
}

export function chartNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  // Keep exact strings in the table; avoid Infinity or underflow plotted as zero.
  return Number.isFinite(value) &&
    (value !== 0 || !/[1-9]/.test(raw.split(/[eE]/)[0]))
    ? value
    : null;
}
