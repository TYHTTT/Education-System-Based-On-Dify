"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import CallLogFilters from "@/components/DifyCallLogFilters";
import DifyUsageOverviewPanel from "@/components/DifyUsageOverviewPanel";
import DifyUsageTrendsPanel from "@/components/DifyUsageTrendsPanel";
import DifyCallLogsPanel from "@/components/DifyCallLogsPanel";
import { useDifyDashboardSection } from "@/components/useDifyDashboardSection";
import {
  getAdminDifyCallLogs,
  getAdminDifyUsageOverview,
  getAdminDifyUsageTrends,
} from "@/lib/api";
import {
  callLogFilterQuery,
  callLogPage,
  readCallLogFilters,
} from "@/lib/dify-call-logs";
import {
  dashboardQuery,
  dashboardRangeError,
  type DashboardPages,
} from "@/lib/dify-dashboard";
import { trendFilters, type TrendMetric } from "@/lib/dify-usage-trends";
import type { DifyCallLogFilters } from "@/lib/types";

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="page-container text-sm text-steel">
          正在加载用量仪表盘…
        </p>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const params = useSearchParams();
  const filters = trendFilters(readCallLogFilters(params));
  const query = callLogFilterQuery(filters);
  const page = callLogPage(params.get("page"));
  const groupBy = params.get("group_by") === "course" ? "course" : "credential";
  const groupPage = callLogPage(params.get("group_page"));
  const state = {
    page,
    group_by: groupBy,
    group_page: groupPage,
  } satisfies DashboardPages;
  const returnQuery = dashboardQuery(filters, state);
  const rangeError = dashboardRangeError(filters);
  const [formError, setFormError] = useState("");
  const [metric, setMetric] = useState<TrendMetric>("total_calls");
  const [currency, setCurrency] = useState("");
  const [groupExpanded, setGroupExpanded] = useState(false);
  const loadOverview = useCallback(
    (token: string, signal: AbortSignal) =>
      getAdminDifyUsageOverview(
        token,
        readCallLogFilters(new URLSearchParams(query)),
        signal,
      ),
    [query],
  );
  const loadTrends = useCallback(
    (token: string, signal: AbortSignal) =>
      getAdminDifyUsageTrends(
        token,
        readCallLogFilters(new URLSearchParams(query)),
        groupBy,
        groupPage,
        signal,
      ),
    [query, groupBy, groupPage],
  );
  const loadLogs = useCallback(
    (token: string, signal: AbortSignal) =>
      getAdminDifyCallLogs(
        token,
        page,
        signal,
        readCallLogFilters(new URLSearchParams(query)),
      ),
    [query, page],
  );
  const overview = useDifyDashboardSection(query, loadOverview, !rangeError);
  const trends = useDifyDashboardSection(
    `${query}:${groupBy}:${groupPage}`,
    loadTrends,
    !rangeError,
  );
  const logs = useDifyDashboardSection(
    `${query}:${page}`,
    loadLogs,
    !rangeError,
  );
  const busy = overview.loading || trends.loading || logs.loading;

  useEffect(() => {
    const lastLogPage = logs.data
      ? Math.max(1, Math.ceil(logs.data.total / logs.data.page_size))
      : page;
    const lastGroupPage = trends.data
      ? Math.max(
          1,
          Math.ceil(trends.data.group_total / trends.data.group_page_size),
        )
      : groupPage;
    if (page <= lastLogPage && groupPage <= lastGroupPage) return;
    const timer = window.setTimeout(
      () =>
        router.replace(
          `/admin/dashboard?${dashboardQuery(readCallLogFilters(new URLSearchParams(query)), { page: Math.min(page, lastLogPage), group_by: groupBy, group_page: Math.min(groupPage, lastGroupPage) })}`,
          { scroll: false },
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [logs.data, trends.data, page, groupPage, groupBy, query, router]);

  function refresh() {
    overview.refresh();
    trends.refresh();
    logs.refresh();
  }
  function navigate(next: Partial<DashboardPages>, section: string) {
    router.push(
      `/admin/dashboard?${dashboardQuery(filters, { ...state, ...next })}#${section}`,
      { scroll: false },
    );
  }
  function apply(next: DifyCallLogFilters) {
    const normalized = trendFilters(next);
    const error = dashboardRangeError(normalized);
    setFormError(error);
    if (error) return;
    const nextQuery = dashboardQuery(normalized, { group_by: groupBy });
    if (nextQuery === returnQuery) refresh();
    router.push(`/admin/dashboard?${nextQuery}`, { scroll: false });
  }

  return (
    <section className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-8">
        <div>
          <p className="eyebrow">Dify dashboard</p>
          <h1 className="mt-2 text-heading-3 text-ink sm:text-heading-2">
            用量仪表盘
          </h1>
          <p className="mt-3 text-sm leading-6 text-steel">
            在同一范围内查看用量概览、费用趋势和调用日志。
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy || !!rangeError}
          className="btn-secondary"
        >
          刷新仪表盘
        </button>
      </div>
      <CallLogFilters
        key={query}
        initial={filters}
        onApply={apply}
        label="筛选用量仪表盘"
        compact
      />
      {(formError || rangeError) && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {formError || rangeError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-steel">
        <p>
          全部模块共用以上筛选。默认最近 30 天，最多 366
          天，时间均为北京时间；清除筛选恢复默认范围。
        </p>
        <nav aria-label="仪表盘分区" className="flex flex-wrap gap-4">
          <a href="#overview" className="link">
            用量概览
          </a>
          <a href="#trends" className="link">
            用量趋势
          </a>
          <a href="#call-logs" className="link">
            调用日志
          </a>
        </nav>
      </div>
      {!rangeError && (
        <div className="mt-8 space-y-10">
          <DashboardSection
            id="overview"
            title="用量概览"
            loading={overview.loading}
            error={overview.error}
            onRetry={overview.refresh}
          >
            {overview.data && <DifyUsageOverviewPanel data={overview.data} />}
          </DashboardSection>
          <DashboardSection
            id="trends"
            title="用量趋势"
            loading={trends.loading}
            error={trends.error}
            onRetry={trends.refresh}
          >
            {trends.data && (
              <DifyUsageTrendsPanel
                data={trends.data}
                signature={query}
                metric={metric}
                currency={currency}
                onMetricChange={setMetric}
                onCurrencyChange={setCurrency}
                groupExpanded={groupExpanded}
                onGroupExpandedChange={setGroupExpanded}
                onGroupChange={(group_by) =>
                  navigate({ group_by, group_page: 1 }, "trends")
                }
                onPageChange={(group_page) =>
                  navigate({ group_page }, "trends")
                }
              />
            )}
          </DashboardSection>
          <DashboardSection
            id="call-logs"
            title="调用日志"
            loading={logs.loading}
            error={logs.error}
            onRetry={logs.refresh}
          >
            {logs.data && (
              <DifyCallLogsPanel
                data={logs.data}
                query={returnQuery}
                changePage={(page) => navigate({ page }, "call-logs")}
              />
            )}
          </DashboardSection>
        </div>
      )}
    </section>
  );
}

function DashboardSection({
  id,
  title,
  loading,
  error,
  onRetry,
  children,
}: {
  id: string;
  title: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      aria-busy={loading}
      className="min-w-0 scroll-mt-24"
    >
      <h2 id={`${id}-title`} className="mb-5 text-heading-4 text-ink">
        {title}
      </h2>
      {loading ? (
        <p role="status" className="card py-10 text-center text-sm text-steel">
          正在加载{title}…
        </p>
      ) : error ? (
        <div role="alert" className="card bg-rose-50 text-sm text-rose-700">
          <p>
            {title}暂时无法加载：{error}
          </p>
          <button type="button" onClick={onRetry} className="mt-3 underline">
            重试{title}
          </button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
