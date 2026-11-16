"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAdmin } from "@/components/AdminProvider";
import { message } from "@/components/AdminCourseForms";
import DifyCallCost from "@/components/DifyCallCost";
import CallLogFilters from "@/components/DifyCallLogFilters";
import { getAdminDifyUsageOverview } from "@/lib/api";
import {
  STATUSES,
  callLogFilterQuery,
  callLogQuery,
  formatCallTime,
  formatCallTokens,
  readCallLogFilters,
} from "@/lib/dify-call-logs";
import type { DifyCallLogFilters, DifyUsageOverview } from "@/lib/types";

export default function AdminUsagePage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="page-container text-sm text-steel">
          正在加载用量概览…
        </p>
      }
    >
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const { withAdmin, status } = useAdmin();
  const router = useRouter();
  const filters = readCallLogFilters(useSearchParams());
  const query = callLogFilterQuery(filters);
  const [data, setData] = useState<DifyUsageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await withAdmin((token) =>
          getAdminDifyUsageOverview(
            token,
            readCallLogFilters(new URLSearchParams(query)),
            controller.signal,
          ),
        );
        if (!controller.signal.aborted) {
          setData(result);
          setLoadedQuery(query);
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
  }, [query, status, version, withAdmin]);

  function refresh() {
    setLoading(true);
    setError("");
    setVersion((value) => value + 1);
  }
  function applyFilters(next: DifyCallLogFilters) {
    refresh();
    const params = callLogFilterQuery(next);
    router.push(`/admin/usage${params ? "?" + params : ""}`, { scroll: false });
  }
  const busy = loading || (!error && data !== null && loadedQuery !== query);
  const metrics = data
    ? [
        {
          label: "调用次数",
          value: data.total_calls.toLocaleString("zh-CN"),
          note: `已结束 ${data.completed_calls.toLocaleString("zh-CN")} 次`,
        },
        {
          label: "成功率",
          value:
            data.success_rate === null
              ? "—"
              : `${(data.success_rate * 100).toFixed(2)}%`,
          note: "成功次数 ÷ 已结束调用次数",
        },
        {
          label: "已报告输入 Token",
          value: formatCallTokens(data.prompt_tokens),
          note: `${data.unknown_prompt_calls.toLocaleString("zh-CN")} 次输入用量未知`,
        },
        {
          label: "已报告输出 Token",
          value: formatCallTokens(data.completion_tokens),
          note: `${data.unknown_completion_calls.toLocaleString("zh-CN")} 次输出用量未知`,
        },
        {
          label: "已报告总 Token",
          value: formatCallTokens(data.total_tokens),
          note: `${data.unknown_total_token_calls.toLocaleString("zh-CN")} 次总用量未知`,
        },
        {
          label: "费用信息不完整",
          value: data.unknown_cost_calls.toLocaleString("zh-CN"),
          note: `费用未知 ${data.unknown_price_calls} 次 · 币种未知 ${data.unknown_currency_calls} 次（可重叠）`,
        },
      ]
    : [];

  return (
    <section className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-8">
        <div>
          <p className="eyebrow">Dify usage</p>
          <h1 className="mt-2 text-heading-3 text-ink sm:text-heading-2">
            用量概览
          </h1>
          <p className="mt-3 text-sm leading-6 text-steel">
            汇总筛选范围内的全部调用，费用按原币种分别统计。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/call-logs?${callLogQuery(filters)}`}
            className="btn-secondary"
          >
            查看对应调用日志
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
        onApply={applyFilters}
        label="筛选用量概览"
      />
      <div aria-busy={busy} className="mt-6">
        {busy ? (
          <p role="status" className="py-12 text-center text-sm text-steel">
            正在加载用量概览…
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
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-steel">
                <p>汇总时间：{formatCallTime(data.generated_at)}（北京时间）</p>
                <p>
                  进行中的调用不计入成功率；失败、超时和取消的已报告用量仍计入汇总。
                </p>
              </div>
              {data.total_calls === 0 && (
                <p
                  role="status"
                  className="rounded-xl bg-surface p-5 text-sm text-steel"
                >
                  {query
                    ? "筛选范围内暂无调用记录，可调整或清除条件。"
                    : "暂无调用记录，学生发起问答或课程学习后可在这里查看用量。"}
                </p>
              )}
              <div
                aria-label="用量指标"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {metrics.map((metric) => (
                  <dl key={metric.label} className="card min-w-0">
                    <dt className="text-sm text-steel">{metric.label}</dt>
                    <dd className="mt-3 break-all text-heading-3 tabular-nums text-ink">
                      {metric.value}
                    </dd>
                    <dd className="mt-3 text-xs leading-5 text-steel">
                      {metric.note}
                    </dd>
                  </dl>
                ))}
              </div>
              <section aria-labelledby="statuses-title" className="card">
                <h2 id="statuses-title" className="text-heading-4 text-ink">
                  调用状态
                </h2>
                <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {Object.entries(STATUSES).map(([key, state]) => (
                    <div key={key}>
                      <dt>
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${state.style}`}
                        >
                          {state.label}
                        </span>
                      </dt>
                      <dd className="mt-3 text-lg tabular-nums text-ink">
                        {data.status_counts[
                          key as keyof typeof data.status_counts
                        ].toLocaleString("zh-CN")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <p className="rounded-xl bg-surface p-4 text-sm leading-6 text-steel">
                {data.unknown_usage_calls.toLocaleString("zh-CN")}{" "}
                次调用存在未报告的 Token
                用量。已报告用量与费用是已知部分的小计，未知值不代表零消耗。
              </p>
              <section
                aria-labelledby="costs-title"
                className="overflow-hidden rounded-xl border border-hairline"
              >
                <div className="border-b border-hairline p-5">
                  <h2 id="costs-title" className="text-heading-4 text-ink">
                    已报告费用汇总
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-steel">
                    不同币种分别列出。人民币按当前参考汇率估算，原始费用保持不变。
                  </p>
                </div>
                {data.currencies.length ? (
                  <div
                    role="region"
                    aria-label="费用汇总表格"
                    tabIndex={0}
                    className="overflow-x-auto"
                  >
                    <table className="w-full min-w-[650px] text-left text-sm">
                      <caption className="sr-only">
                        按原币种汇总的已报告费用及缺失记录数
                      </caption>
                      <thead className="bg-surface text-steel">
                        <tr>
                          {[
                            "币种",
                            "原币种费用小计",
                            "人民币参考换算",
                            "费用已报告",
                            "费用未知",
                          ].map((text) => (
                            <th
                              key={text}
                              scope="col"
                              className="whitespace-nowrap px-4 py-4 font-medium"
                            >
                              {text}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {data.currencies.map((item) => (
                          <tr
                            key={item.currency ?? "unknown"}
                            className="align-top"
                          >
                            <td className="px-4 py-5 font-medium">
                              {item.currency ?? "币种未知"}
                            </td>
                            <td className="max-w-48 break-all px-4 py-5 tabular-nums">
                              {item.total_price ?? "未知"}
                            </td>
                            <td className="max-w-72 break-all px-4 py-5">
                              <DifyCallCost log={item} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-5 tabular-nums">
                              {item.known_price_calls} / {item.call_count} 次
                            </td>
                            <td className="whitespace-nowrap px-4 py-5 tabular-nums">
                              {item.unknown_price_calls} 次
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="p-8 text-center text-sm text-steel">
                    暂无费用记录
                  </p>
                )}
              </section>
            </div>
          )
        )}
      </div>
    </section>
  );
}
