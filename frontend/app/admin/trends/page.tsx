"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAdmin } from "@/components/AdminProvider";
import { message } from "@/components/AdminCourseForms";
import DifyCallCost from "@/components/DifyCallCost";
import CallLogFilters from "@/components/DifyCallLogFilters";
import DifyTrendChart, {
  DifyTrendComparison,
} from "@/components/DifyTrendChart";
import { getAdminDifyUsageTrends } from "@/lib/api";
import {
  beijingTimeInput,
  callLogFilterQuery,
  callLogPage,
  callLogQuery,
  formatCallTime,
  formatCallTokens,
  readCallLogFilters,
} from "@/lib/dify-call-logs";
import {
  TREND_METRICS,
  trendFilters,
  type TrendMetric,
} from "@/lib/dify-usage-trends";
import type {
  DifyCallLogFilters,
  DifyTrendUsage,
  DifyUsageTrends,
} from "@/lib/types";

export default function AdminTrendsPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="page-container text-sm text-steel">
          正在加载用量趋势…
        </p>
      }
    >
      <TrendsContent />
    </Suspense>
  );
}

function TrendsContent() {
  const { withAdmin, status } = useAdmin();
  const router = useRouter();
  const params = useSearchParams();
  const filters = trendFilters(readCallLogFilters(params));
  const query = callLogFilterQuery(filters);
  const groupBy = params.get("group_by") === "course" ? "course" : "credential";
  const page = callLogPage(params.get("group_page"));
  const signature = `${query}&group_by=${groupBy}&group_page=${page}`;
  const [data, setData] = useState<DifyUsageTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [version, setVersion] = useState(0);
  const [metric, setMetric] = useState<TrendMetric>("total_calls");
  const [currency, setCurrency] = useState("");

  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await withAdmin((token) =>
          getAdminDifyUsageTrends(
            token,
            readCallLogFilters(new URLSearchParams(query)),
            groupBy,
            page,
            controller.signal,
          ),
        );
        if (!controller.signal.aborted) {
          setData(result);
          setLoaded(signature);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(message(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, groupBy, page, signature, status, version, withAdmin]);

  const busy = loading || (!error && data !== null && loaded !== signature);
  const pages = data
    ? Math.max(1, Math.ceil(data.group_total / data.group_page_size))
    : 1;
  const currencies =
    data?.totals.currencies.flatMap((item) =>
      item.currency ? [item.currency] : [],
    ) ?? [];
  const selectedCurrency = currencies.includes(currency)
    ? currency
    : (currencies[0] ?? "");
  const metricLabel =
    TREND_METRICS[metric] +
    (metric === "cost" && selectedCurrency ? `（${selectedCurrency}）` : "");

  function refresh() {
    setLoading(true);
    setError("");
    setVersion((value) => value + 1);
  }
  function navigate(
    next: DifyCallLogFilters,
    group: "credential" | "course",
    nextPage: number,
  ) {
    const params = new URLSearchParams(callLogFilterQuery(next));
    params.set("group_by", group);
    params.set("group_page", String(nextPage));
    refresh();
    router.push(`/admin/trends?${params}`, { scroll: false });
  }
  function apply(next: DifyCallLogFilters) {
    const normalized = trendFilters(next);
    const first = beijingTimeInput(normalized.started_from).slice(0, 10);
    const last = beijingTimeInput(
      new Date(
        new Date(normalized.started_before!).getTime() - 1,
      ).toISOString(),
    ).slice(0, 10);
    if ((Date.parse(last) - Date.parse(first)) / 86400000 >= 366) {
      setFilterError("最多选择 366 个北京时间日期，请缩短时间范围。");
      return;
    }
    setFilterError("");
    navigate(normalized, groupBy, 1);
  }

  return (
    <section className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-8">
        <div>
          <p className="eyebrow">Dify trends</p>
          <h1 className="mt-2 text-heading-3 text-ink sm:text-heading-2">
            用量和费用趋势
          </h1>
          <p className="mt-3 text-sm leading-6 text-steel">
            按北京时间日期查看已报告用量，默认最近 30 天，最多选择 366 天。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/call-logs?${callLogQuery(filters)}`}
            className="btn-secondary"
          >
            查看对应调用日志
          </Link>
          <Link href={`/admin/usage?${query}`} className="btn-secondary">
            查看对应概览
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={refresh}
            className="btn-secondary"
          >
            刷新
          </button>
        </div>
      </div>
      <CallLogFilters
        key={query}
        initial={filters}
        onApply={apply}
        label="筛选用量趋势"
      />
      {filterError && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {filterError}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-steel">
        开始时间包含、截止时间不包含，边界日期只统计所选时段。清除筛选会恢复最近
        30 天。
      </p>
      <div aria-busy={busy} className="mt-6">
        {busy ? (
          <p role="status" className="py-12 text-center text-sm text-steel">
            正在加载用量趋势…
          </p>
        ) : error ? (
          <div role="alert" className="card bg-rose-50 text-sm text-rose-700">
            <p>{error}</p>
            <button type="button" onClick={refresh} className="mt-3 underline">
              重试
            </button>
          </div>
        ) : (
          data && (
            <div className="space-y-6">
              <p className="text-xs leading-5 text-steel">
                统计时间：{formatCallTime(data.generated_at)}
                （北京时间）。按调用开始日期归属，失败、超时和取消的已报告消耗仍计入。
              </p>
              {data.totals.total_calls === 0 && (
                <p
                  role="status"
                  className="rounded-xl bg-surface p-5 text-sm text-steel"
                >
                  筛选范围内暂无调用记录，可调整时间或清除筛选。
                </p>
              )}
              <dl
                aria-label="趋势范围汇总"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                {[
                  ["调用次数", String(data.totals.total_calls)],
                  [
                    "已报告总 Token",
                    formatCallTokens(data.totals.total_tokens),
                  ],
                  ["Token 信息不完整", `${data.totals.unknown_usage_calls} 次`],
                  ["费用信息不完整", `${data.totals.unknown_cost_calls} 次`],
                ].map(([label, value]) => (
                  <div key={label} className="card min-w-0">
                    <dt className="text-sm text-steel">{label}</dt>
                    <dd className="mt-3 break-all text-heading-3 tabular-nums text-ink">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <section aria-labelledby="daily-title" className="card min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 id="daily-title" className="text-heading-4 text-ink">
                      每日趋势
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-steel">
                      无调用的日期显示
                      0；全部未知的用量留空。费用按原币种绘图，精确值可在下方明细查看。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="text-sm text-steel">
                      图表指标
                      <select
                        aria-label="图表指标"
                        value={metric}
                        onChange={(event) =>
                          setMetric(event.target.value as TrendMetric)
                        }
                        className="form-field mt-1.5 w-full"
                      >
                        {Object.entries(TREND_METRICS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {metric === "cost" && (
                      <label className="text-sm text-steel">
                        费用币种
                        <select
                          aria-label="费用币种"
                          value={selectedCurrency}
                          onChange={(event) => setCurrency(event.target.value)}
                          className="form-field mt-1.5 w-full"
                        >
                          {currencies.length ? (
                            currencies.map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))
                          ) : (
                            <option value="">暂无已知币种</option>
                          )}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
                <DifyTrendChart
                  key={`${signature}:${metric}:${selectedCurrency}`}
                  daily={data.daily}
                  metric={metric}
                  currency={selectedCurrency}
                />
              </section>
              <details className="rounded-xl border border-hairline p-5">
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  查看每日明细（{data.daily.length} 天）
                </summary>
                <div className="mt-4">
                  <UsageTable
                    label="每日用量明细"
                    rows={data.daily.map((day) => ({
                      ...day,
                      key: day.day,
                      label: day.day,
                    }))}
                  />
                </div>
              </details>
              <section aria-labelledby="groups-title" className="card min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 id="groups-title" className="text-heading-4 text-ink">
                      {groupBy === "credential" ? "按 Key 对比" : "按课程对比"}
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-steel">
                      按调用次数排序，图表展示当前页的{metricLabel}
                      。未关联及已删除的历史归属独立保留。
                    </p>
                  </div>
                  <label className="text-sm text-steel">
                    对比维度
                    <select
                      aria-label="对比维度"
                      value={groupBy}
                      onChange={(event) =>
                        navigate(
                          filters,
                          event.target.value as "credential" | "course",
                          1,
                        )
                      }
                      className="form-field mt-1.5 w-full"
                    >
                      <option value="credential">Key</option>
                      <option value="course">课程</option>
                    </select>
                  </label>
                </div>
                {data.groups.length ? (
                  <DifyTrendComparison
                    groups={data.groups}
                    metric={metric}
                    currency={selectedCurrency}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-steel">
                    {data.group_total
                      ? "当前页暂无分组，可返回上一页。"
                      : "暂无分组数据"}
                  </p>
                )}
                <div className="mt-6">
                  <UsageTable
                    label="分组用量明细"
                    rows={data.groups.map((group) => ({
                      ...group,
                      key: group.group_id ?? "unassigned",
                      id: group.group_id,
                    }))}
                  />
                </div>
                <nav
                  aria-label="趋势对比分页"
                  className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
                >
                  <p className="text-steel">
                    共 {data.group_total} 组 · 第 {page} / {pages} 页
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => navigate(filters, groupBy, page - 1)}
                      className="btn-secondary"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      disabled={page >= pages}
                      onClick={() => navigate(filters, groupBy, page + 1)}
                      className="btn-secondary"
                    >
                      下一页
                    </button>
                  </div>
                </nav>
              </section>
              <p className="rounded-xl bg-surface p-4 text-sm leading-6 text-steel">
                图表与明细均汇总全部匹配调用，分组分页不改变每日趋势或范围汇总。已报告值为已知部分，未知不代表零消耗。不同币种不直接相加，币种未知的费用单列明细、未计入币种图表；人民币金额仅作参考估算。
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function UsageTable({
  label,
  rows,
}: {
  label: string;
  rows: (DifyTrendUsage & { key: string; label: string; id?: string | null })[];
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-hairline"
    >
      <table className="w-full min-w-[780px] text-left text-sm">
        <caption className="sr-only">{label}，费用保持原始精度</caption>
        <thead className="bg-surface text-steel">
          <tr>
            {[
              "日期／归属",
              "调用次数",
              "输入 Token",
              "输出 Token",
              "总 Token",
              "已报告费用及人民币参考",
            ].map((title) => (
              <th
                key={title}
                scope="col"
                className="whitespace-nowrap px-4 py-3 font-medium"
              >
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((row) => (
            <tr key={row.key} className="align-top">
              <th
                scope="row"
                className="max-w-64 break-all px-4 py-4 font-medium text-ink"
              >
                {row.label}
                {row.id && !row.label.includes(row.id) && (
                  <span className="mt-1 block font-mono text-xs font-normal text-steel">
                    {row.id}
                  </span>
                )}
              </th>
              <td className="px-4 py-4 tabular-nums">{row.total_calls}</td>
              {(
                [
                  [row.prompt_tokens, row.unknown_prompt_calls],
                  [row.completion_tokens, row.unknown_completion_calls],
                  [row.total_tokens, row.unknown_total_token_calls],
                ] as const
              ).map(([value, unknown], index) => (
                <td key={index} className="px-4 py-4 tabular-nums">
                  {formatCallTokens(value)}
                  {unknown > 0 && (
                    <span className="mt-1 block whitespace-nowrap text-xs text-steel">
                      {unknown} 次未知
                    </span>
                  )}
                </td>
              ))}
              <td className="min-w-52 max-w-80 space-y-3 break-all px-4 py-4">
                {row.currencies.length
                  ? row.currencies.map((item) => (
                      <div key={item.currency ?? "unknown"}>
                        <DifyCallCost log={item} compact />
                        <p className="mt-1 text-xs text-steel">
                          {item.currency ?? "币种未知"} ·{" "}
                          {item.known_price_calls}/{item.call_count}{" "}
                          次费用已报告
                        </p>
                      </div>
                    ))
                  : "暂无费用记录"}
                {row.unknown_cost_calls > 0 && (
                  <p className="text-xs text-steel">
                    {row.unknown_cost_calls} 次费用或币种未知
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
