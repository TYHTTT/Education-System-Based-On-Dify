import Link from "next/link";
import DifyCallCost from "@/components/DifyCallCost";
import {
  BUSINESS_LABELS,
  STATUSES,
  formatCallTime,
  formatCallTokens,
  formatCallDuration,
} from "@/lib/dify-call-logs";
import type { DifyCallLogList } from "@/lib/types";

export default function DifyCallLogsPanel({
  data,
  query,
  changePage,
}: {
  data: DifyCallLogList;
  query: string;
  changePage: (page: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
      {data.items.length > 0 ? (
        <div
          role="region"
          aria-label="调用日志表格"
          tabIndex={0}
          className="overflow-x-auto"
        >
          <table className="w-full min-w-[1100px] text-left text-sm">
            <caption className="sr-only">
              最近的 Dify 调用，时间均为北京时间
            </caption>
            <thead className="bg-surface text-steel">
              <tr>
                {[
                  "调用时间（北京时间）",
                  "学生",
                  "课程／知识点",
                  "业务类型",
                  "状态",
                  "Token 用量",
                  "费用",
                  "耗时",
                  "凭据",
                ].map((title) => (
                  <th
                    key={title}
                    scope="col"
                    className="whitespace-nowrap px-4 py-4 font-medium"
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {data.items.map((log) => {
                const state = STATUSES[log.status];
                return (
                  <tr key={log.id} className="align-top hover:bg-surface/50">
                    <td className="whitespace-nowrap px-4 py-5 tabular-nums">
                      <Link
                        href={`/admin/call-logs/${encodeURIComponent(log.id)}?${query}`}
                        aria-label={`查看调用 ${log.id} 的详情`}
                        className="group block outline-offset-4"
                      >
                        <time
                          dateTime={log.started_at}
                          className="group-hover:text-link"
                        >
                          {formatCallTime(log.started_at)}
                        </time>
                        <p title={log.id} className="mt-1 text-xs text-link">
                          <span className="font-mono">
                            {log.id.slice(0, 8)}
                          </span>
                          <span className="ml-2 group-hover:underline">
                            查看详情 →
                          </span>
                        </p>
                      </Link>
                    </td>
                    <td className="max-w-40 px-4 py-5">
                      <p className="break-words">
                        {log.is_anonymous
                          ? "匿名访客"
                          : log.student_name || "学生"}
                      </p>
                      {log.student_id && (
                        <p
                          title={log.student_id}
                          className="mt-1 font-mono text-xs text-steel"
                        >
                          {log.student_id.slice(0, 8)}
                        </p>
                      )}
                    </td>
                    <td className="min-w-40 max-w-60 px-4 py-5">
                      <p
                        className="break-words"
                        title={log.course_id ?? undefined}
                      >
                        {log.course_title || log.course_id || "未关联课程"}
                      </p>
                      <p
                        className="mt-1 break-words text-xs text-steel"
                        title={log.topic_id ?? undefined}
                      >
                        {log.topic_title || log.topic_id || "未关联知识点"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5">
                      {BUSINESS_LABELS[log.business_type]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-5">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${state.style}`}
                      >
                        {state.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-xs tabular-nums leading-6">
                      <p>输入：{formatCallTokens(log.prompt_tokens)}</p>
                      <p>输出：{formatCallTokens(log.completion_tokens)}</p>
                      <p className="text-steel">
                        总量：{formatCallTokens(log.total_tokens)}
                      </p>
                    </td>
                    <td className="max-w-48 break-all px-4 py-5 tabular-nums">
                      <DifyCallCost log={log} compact />
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 tabular-nums">
                      {formatCallDuration(log.duration_ms)}
                    </td>
                    <td
                      className="px-4 py-5 font-mono text-xs text-steel"
                      title={log.credential_id ?? undefined}
                    >
                      {log.credential_id?.slice(0, 8) ?? "未关联"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="status" className="p-10 text-center text-sm text-steel">
          当前页没有匹配的调用记录，可调整筛选条件或返回上一页。
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-4 text-sm text-steel">
        <span>共 {data.total.toLocaleString("zh-CN")} 次调用</span>
        <nav aria-label="调用日志分页" className="flex items-center gap-3">
          <button
            type="button"
            disabled={data.page <= 1}
            onClick={() => changePage(data.page - 1)}
            className="btn-secondary"
          >
            上一页
          </button>
          <span aria-live="polite">
            第 {data.page} /{" "}
            {Math.max(1, Math.ceil(data.total / data.page_size))} 页
          </span>
          <button
            type="button"
            disabled={data.page * data.page_size >= data.total}
            onClick={() => changePage(data.page + 1)}
            className="btn-secondary"
          >
            下一页
          </button>
        </nav>
      </div>
    </div>
  );
}
