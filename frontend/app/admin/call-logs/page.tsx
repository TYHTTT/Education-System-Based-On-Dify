"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAdmin } from "@/components/AdminProvider";
import DifyCallCost from "@/components/DifyCallCost";
import CallLogFilters from "@/components/DifyCallLogFilters";
import { message } from "@/components/AdminCourseForms";
import { getAdminDifyCallLogs } from "@/lib/api";
import {
  BUSINESS_LABELS,
  STATUSES,
  callLogPage,
  formatCallTime,
  formatCallTokens,
  formatCallDuration,
  callLogQuery,
  readCallLogFilters,
} from "@/lib/dify-call-logs";
import type { DifyCallLogList, DifyCallLogFilters } from "@/lib/types";

export default function AdminCallLogsPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="page-container text-sm text-steel">
          正在加载调用日志…
        </p>
      }
    >
      <CallLogsContent />
    </Suspense>
  );
}

function CallLogsContent() {
  const { withAdmin, status } = useAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = callLogPage(searchParams.get("page"));
  const filters = readCallLogFilters(searchParams);
  const filterQuery = callLogQuery(filters);
  const query = callLogQuery(filters, page);
  const [data, setData] = useState<DifyCallLogList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState("");

  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await withAdmin((token) =>
          getAdminDifyCallLogs(
            token,
            page,
            controller.signal,
            readCallLogFilters(new URLSearchParams(filterQuery)),
          ),
        );
        if (controller.signal.aborted) return;
        const lastPage = Math.max(
          1,
          Math.ceil(result.total / result.page_size),
        );
        if (page > lastPage) {
          router.replace(
            `/admin/call-logs?${callLogQuery(readCallLogFilters(new URLSearchParams(filterQuery)), lastPage)}`,
            {
              scroll: false,
            },
          );
          return;
        }
        setData(result);
        setLoadedQuery(query);
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
  }, [withAdmin, status, page, version, router, filterQuery, query]);

  function refresh() {
    setLoading(true);
    setError("");
    setVersion((value) => value + 1);
  }

  function changePage(next: number) {
    setLoading(true);
    setError("");
    router.push(`/admin/call-logs?${callLogQuery(filters, next)}`, {
      scroll: false,
    });
  }

  function applyFilters(next: DifyCallLogFilters) {
    setLoading(true);
    setError("");
    setVersion((value) => value + 1);
    router.push(`/admin/call-logs?${callLogQuery(next)}`, { scroll: false });
  }

  const busy = loading || (!error && data !== null && loadedQuery !== query);

  return (
    <section className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-8">
        <div>
          <p className="eyebrow">Dify activity</p>
          <h1 className="mt-2 text-heading-3 text-ink sm:text-heading-2">
            调用日志
          </h1>
          <p className="mt-3 text-sm leading-6 text-steel">
            按时间倒序查看 Dify 调用，人民币按当前参考汇率估算，原始费用保留。
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
      <CallLogFilters
        key={filterQuery}
        initial={filters}
        onApply={applyFilters}
      />
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
          <div className="p-10 text-center text-sm text-steel">
            <p className="font-medium text-ink">
              {Object.keys(filters).length
                ? "没有匹配的调用记录"
                : "暂无调用记录"}
            </p>
            <p className="mt-2">
              {Object.keys(filters).length
                ? "请调整筛选条件，或清除筛选查看全部记录。"
                : "学生发起问答或课程学习后，记录会显示在这里。"}
            </p>
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
