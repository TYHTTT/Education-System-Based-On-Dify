"use client";
import DifyCallCost from "@/components/DifyCallCost";
import DifyTrendChart, {
  DifyTrendComparison,
} from "@/components/DifyTrendChart";
import { formatCallTokens } from "@/lib/dify-call-logs";
import { TREND_METRICS, type TrendMetric } from "@/lib/dify-usage-trends";
import type { DifyTrendUsage, DifyUsageTrends } from "@/lib/types";

export default function DifyUsageTrendsPanel({
  data,
  signature,
  onGroupChange,
  onPageChange,
  metric,
  currency,
  onMetricChange,
  onCurrencyChange,
  groupExpanded,
  onGroupExpandedChange,
}: {
  data: DifyUsageTrends;
  signature: string;
  onGroupChange: (group: "credential" | "course") => void;
  onPageChange: (page: number) => void;
  metric: TrendMetric;
  currency: string;
  onMetricChange: (metric: TrendMetric) => void;
  onCurrencyChange: (currency: string) => void;
  groupExpanded: boolean;
  onGroupExpandedChange: (open: boolean) => void;
}) {
  const groupBy = data.group_by;
  const page = data.group_page;
  const pages = Math.max(1, Math.ceil(data.group_total / data.group_page_size));
  const currencies = data.totals.currencies.flatMap((item) =>
    item.currency ? [item.currency] : [],
  );
  const selectedCurrency = currencies.includes(currency)
    ? currency
    : (currencies[0] ?? "");
  const metricLabel =
    TREND_METRICS[metric] +
    (metric === "cost" && selectedCurrency ? `（${selectedCurrency}）` : "");
  return (
    <div className="space-y-5">
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
                  onMetricChange(event.target.value as TrendMetric)
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
                  onChange={(event) => onCurrencyChange(event.target.value)}
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
      <details
        className="card min-w-0"
        open={groupExpanded}
        onToggle={(event) => onGroupExpandedChange(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Key／课程对比与用量明细
        </summary>
        <section aria-labelledby="groups-title" className="mt-5">
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
                  onGroupChange(event.target.value as "credential" | "course")
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
                onClick={() => onPageChange(page - 1)}
                className="btn-secondary"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => onPageChange(page + 1)}
                className="btn-secondary"
              >
                下一页
              </button>
            </div>
          </nav>
        </section>
      </details>
      <p className="rounded-xl bg-surface p-4 text-sm leading-6 text-steel">
        图表与明细均汇总全部匹配调用，分组分页不改变每日趋势或范围汇总。已报告值为已知部分，未知不代表零消耗。不同币种不直接相加，币种未知的费用单列明细、未计入币种图表；人民币金额仅作参考估算。
      </p>
    </div>
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
