import type { DifyCallLogFilters } from "@/lib/types";
import { callLogFilterQuery } from "@/lib/dify-call-logs";

export interface DashboardPages {
  page: number;
  group_by: "credential" | "course";
  group_page: number;
}

export function dashboardQuery(
  filters: DifyCallLogFilters,
  pages: Partial<DashboardPages> = {},
): string {
  const params = new URLSearchParams(callLogFilterQuery(filters));
  params.set("page", String(pages.page ?? 1));
  params.set("group_by", pages.group_by ?? "credential");
  params.set("group_page", String(pages.group_page ?? 1));
  return params.toString();
}

export function dashboardRangeError(filters: DifyCallLogFilters): string {
  const start = Date.parse(filters.started_from ?? "");
  const end = Date.parse(filters.started_before ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end))
    return "请填写有效的开始和截止时间。";
  if (start > end) return "截止时间不得早于开始时间。";
  const first = Math.floor((start + 8 * 3600000) / 86400000);
  const last = Math.floor((end + 8 * 3600000) / 86400000);
  return last - first >= 366
    ? "最多选择 366 个北京时间日期，请缩短时间范围。"
    : "";
}

export function legacyDashboardHref(
  params: Record<string, string | string[] | undefined>,
  section: string,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      query.append(key, item);
  }
  return `/admin/dashboard${query.size ? "?" + query : ""}#${section}`;
}
