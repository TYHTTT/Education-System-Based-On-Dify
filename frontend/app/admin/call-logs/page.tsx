"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/AdminProvider";
import { message } from "@/components/AdminCourseForms";
import { getAdminDifyCallLogs } from "@/lib/api";
import type { DifyCallLogList, DifyCallLogSummary } from "@/lib/types";

const BUSINESS_LABELS: Record<DifyCallLogSummary["business_type"], string> = {
  free_qa: "自由问答",
  topic_teaching: "知识点教学",
  topic_clarification: "知识点追问",
  topic_practice: "练习出题",
  topic_answer: "作答评价",
  diagnosis: "学习诊断",
};
const STATUSES: Record<
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

function tokens(value: number | null) {
  return value === null ? "未知" : value.toLocaleString("zh-CN");
}

export default function AdminCallLogsPage() {
  const { withAdmin, status } = useAdmin();
  const [data, setData] = useState<DifyCallLogList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await withAdmin((token) =>
          getAdminDifyCallLogs(token, page, controller.signal),
        );
        if (controller.signal.aborted) return;
        const lastPage = Math.max(
          1,
          Math.ceil(result.total / result.page_size),
        );
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(result);
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
  }, [withAdmin, status, page, version]);

  function refresh() {
    setLoading(true);
    setError("");
    setVersion((value) => value + 1);
  }

  function changePage(next: number) {
    setLoading(true);
    setError("");
    setPage(next);
  }

  const busy = loading || (!error && data !== null && data.page !== page);

  return (
    <section className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-8">
        <div>
          <p className="eyebrow">Dify activity</p>
          <h1 className="mt-2 text-heading-3 text-ink sm:text-heading-2">
            调用日志
          </h1>
          <p className="mt-3 text-sm leading-6 text-steel">
            按时间倒序查看 Dify 调用，费用以 Dify 返回的数据为准。
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="btn-secondary"
        >
          刷新
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-6 flex items-start justify-between gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="shrink-0 underline"
          >
            重试
          </button>
        </div>
      )}
      <div
        aria-busy={busy}
        className="mt-6 overflow-hidden rounded-xl border border-hairline bg-canvas"
      >
        {busy ? (
          <p role="status" className="p-10 text-center text-sm text-steel">
            正在加载调用日志…
          </p>
        ) : error ? (
          <p className="p-10 text-center text-sm text-steel">
            调用日志暂时无法加载，请重试。
          </p>
        ) : data && data.items.length > 0 ? (
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
                        <time dateTime={log.started_at}>
                          {TIME_FORMAT.format(new Date(log.started_at))}
                        </time>
                        <p
                          title={log.id}
                          className="mt-1 font-mono text-xs text-steel"
                        >
                          {log.id.slice(0, 8)}
                        </p>
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
                        <p>输入：{tokens(log.prompt_tokens)}</p>
                        <p>输出：{tokens(log.completion_tokens)}</p>
                        <p className="text-steel">
                          总量：{tokens(log.total_tokens)}
                        </p>
                      </td>
                      <td className="max-w-48 break-all px-4 py-5 tabular-nums">
                        {log.total_price === null ? (
                          "未知"
                        ) : (
                          <>
                            {log.total_price}
                            <span className="mt-1 block text-xs text-steel">
                              {log.currency ?? "币种未知"}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-5 tabular-nums">
                        {log.duration_ms === null
                          ? "—"
                          : log.duration_ms < 1000
                            ? `${log.duration_ms} 毫秒`
                            : `${(log.duration_ms / 1000).toFixed(2)} 秒`}
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
          <div className="p-10 text-center text-sm text-steel">
            <p className="font-medium text-ink">暂无调用记录</p>
            <p className="mt-2">学生发起问答或课程学习后，记录会显示在这里。</p>
          </div>
        )}
        {!busy && !error && data && (
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
        )}
      </div>
    </section>
  );
}
