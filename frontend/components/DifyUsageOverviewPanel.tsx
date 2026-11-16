import DifyCallCost from "@/components/DifyCallCost";
import {
  STATUSES,
  formatCallTime,
  formatCallTokens,
} from "@/lib/dify-call-logs";
import type { DifyUsageOverview } from "@/lib/types";

export default function DifyUsageOverviewPanel({
  data,
}: {
  data: DifyUsageOverview;
}) {
  const metrics = [
    [
      "调用次数",
      data.total_calls.toLocaleString("zh-CN"),
      `已结束 ${data.completed_calls} 次`,
    ],
    [
      "成功率",
      data.success_rate === null
        ? "—"
        : `${(data.success_rate * 100).toFixed(2)}%`,
      "成功次数 ÷ 已结束调用次数",
    ],
    [
      "已报告输入 Token",
      formatCallTokens(data.prompt_tokens),
      `${data.unknown_prompt_calls} 次输入用量未知`,
    ],
    [
      "已报告输出 Token",
      formatCallTokens(data.completion_tokens),
      `${data.unknown_completion_calls} 次输出用量未知`,
    ],
    [
      "已报告总 Token",
      formatCallTokens(data.total_tokens),
      `${data.unknown_total_token_calls} 次总用量未知`,
    ],
    [
      "费用信息不完整",
      String(data.unknown_cost_calls),
      `费用未知 ${data.unknown_price_calls} 次 · 币种未知 ${data.unknown_currency_calls} 次（可重叠）`,
    ],
  ];
  return (
    <div className="space-y-5">
      <p className="text-xs text-steel">
        汇总时间：{formatCallTime(data.generated_at)}
        （北京时间）。进行中不计入成功率。
      </p>
      {data.total_calls === 0 && (
        <p
          role="status"
          className="rounded-xl bg-surface p-5 text-sm text-steel"
        >
          筛选范围内暂无调用记录，可调整时间或清除筛选。
        </p>
      )}
      <div
        aria-label="用量指标"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {metrics.map(([label, value, note]) => (
          <dl key={label} className="card min-w-0">
            <dt className="text-sm text-steel">{label}</dt>
            <dd className="mt-3 break-all text-heading-3 tabular-nums text-ink">
              {value}
            </dd>
            <dd className="mt-3 text-xs leading-5 text-steel">{note}</dd>
          </dl>
        ))}
      </div>
      <dl
        aria-label="调用状态汇总"
        className="flex flex-wrap gap-x-5 gap-y-3 rounded-xl border border-hairline p-4"
      >
        {Object.entries(STATUSES).map(([key, state]) => (
          <div key={key} className="flex items-center gap-3">
            <dt className={`rounded-md px-2 py-1 text-xs ${state.style}`}>
              {state.label}
            </dt>
            <dd className="text-sm tabular-nums text-ink">
              {data.status_counts[key as keyof typeof data.status_counts]}
            </dd>
          </div>
        ))}
      </dl>
      <div
        aria-label="费用汇总"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {data.currencies.map((item) => (
          <div key={item.currency ?? "unknown"} className="card min-w-0">
            <h3 className="text-sm font-medium text-ink">
              {item.currency ?? "币种未知"} · 已报告费用
            </h3>
            <div className="mt-3 text-sm text-ink">
              <DifyCallCost log={item} />
            </div>
            <p className="mt-3 text-xs text-steel">
              {item.known_price_calls}/{item.call_count} 次费用已报告 ·{" "}
              {item.unknown_price_calls} 次费用未知
            </p>
          </div>
        ))}
      </div>
      {!data.currencies.length && (
        <p className="text-sm text-steel">暂无费用记录</p>
      )}
      <p className="text-xs leading-6 text-steel">
        {data.unknown_usage_calls} 次调用的 Token
        信息不完整。已报告用量和费用是已知部分，未知不代表零消耗；失败、超时和取消的已报告消耗仍计入，不同币种分别统计。
      </p>
    </div>
  );
}
