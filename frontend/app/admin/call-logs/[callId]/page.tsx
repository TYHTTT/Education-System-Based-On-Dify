"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAdmin } from "@/components/AdminProvider";
import DifyCallCost from "@/components/DifyCallCost";
import { message } from "@/components/AdminCourseForms";
import { ApiError, getAdminDifyCallLog } from "@/lib/api";
import {
  BUSINESS_LABELS,
  STATUSES,
  callLogPage,
  formatCallTime,
  formatCallTokens,
  formatCallDuration,
} from "@/lib/dify-call-logs";
import type { DifyCallLogDetail } from "@/lib/types";

function Field({
  label,
  children,
  code = false,
}: {
  label: string;
  children: ReactNode;
  code?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-steel">{label}</dt>
      <dd
        className={`mt-2 break-all leading-6 text-ink ${code ? "font-mono text-xs" : "text-sm"}`}
      >
        {children ?? "未记录"}
      </dd>
    </div>
  );
}

export default function AdminCallLogDetailPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="page-container text-sm text-steel">
          正在加载调用详情…
        </p>
      }
    >
      <CallLogDetailContent />
    </Suspense>
  );
}

function CallLogDetailContent() {
  const { callId } = useParams<{ callId: string }>();
  const returnPage = callLogPage(useSearchParams().get("page"));
  const { withAdmin, status } = useAdmin();
  const [data, setData] = useState<DifyCallLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const result = await withAdmin((token) =>
          getAdminDifyCallLog(token, callId, controller.signal),
        );
        if (!controller.signal.aborted) setData(result);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(message(cause));
          setNotFound(cause instanceof ApiError && cause.status === 404);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [callId, status, withAdmin, version]);

  function refresh() {
    setLoading(true);
    setError("");
    setVersion((value) => value + 1);
  }

  const busy =
    loading ||
    (!error && data !== null && data.id.toLowerCase() !== callId.toLowerCase());
  const state = data ? STATUSES[data.status] : null;
  const incompleteUsage =
    data &&
    [
      data.prompt_tokens,
      data.completion_tokens,
      data.total_tokens,
      data.total_price,
    ].some((value) => value === null);

  return (
    <section className="page-container">
      <Link
        href={`/admin/call-logs?page=${returnPage}`}
        className="link text-sm"
      >
        ← 返回调用日志
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-8">
        <div>
          <p className="eyebrow">Dify activity</p>
          <h1 className="mt-2 text-heading-3 text-ink sm:text-heading-2">
            调用详情
          </h1>
          <p className="mt-3 text-sm leading-6 text-steel">
            查看本次调用的用量、业务归属与执行结果，时间均为北京时间。
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
      <div aria-busy={busy} className="mt-6">
        {busy ? (
          <p role="status" className="py-12 text-center text-sm text-steel">
            正在加载调用详情…
          </p>
        ) : error ? (
          <div role="alert" className="card bg-rose-50 text-sm text-rose-700">
            <h2 className="font-semibold">
              {notFound ? "未找到调用记录" : "调用详情暂时无法加载"}
            </h2>
            <p className="mt-2">{error}</p>
            <button type="button" onClick={refresh} className="mt-3 underline">
              重试
            </button>
          </div>
        ) : (
          data &&
          state && (
            <div className="space-y-6">
              <section aria-label="执行结果" className="card">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-heading-4 text-ink">执行结果</h2>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-medium ${state.style}`}
                  >
                    {state.label}
                  </span>
                </div>
                {data.status === "in_progress" && (
                  <p
                    role="status"
                    className="mt-4 rounded-lg bg-sky-50 p-3 text-sm leading-6 text-sky-800"
                  >
                    尚无结束记录，调用可能仍在执行，也可能结束记录未成功写入。请稍后刷新核对。
                  </p>
                )}
                <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="业务类型">
                    {BUSINESS_LABELS[data.business_type]}
                  </Field>
                  <Field label="HTTP 状态">
                    {data.http_status ?? "未记录"}
                  </Field>
                  <Field label="错误类型" code>
                    {data.error_code ?? "未记录"}
                  </Field>
                  <Field label="耗时">
                    {formatCallDuration(data.duration_ms)}
                  </Field>
                </dl>
                <div className="mt-5 border-t border-hairline pt-4">
                  <p className="text-xs text-steel">错误摘要</p>
                  <p className="mt-2 text-sm leading-6 text-ink">
                    {data.error_summary ?? "未记录错误摘要。"}
                  </p>
                </div>
              </section>
              <section aria-labelledby="usage-title" className="card">
                <h2 id="usage-title" className="text-heading-4 text-ink">
                  用量与费用
                </h2>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="输入 Token">
                    {formatCallTokens(data.prompt_tokens)}
                  </Field>
                  <Field label="输出 Token">
                    {formatCallTokens(data.completion_tokens)}
                  </Field>
                  <Field label="总 Token">
                    {formatCallTokens(data.total_tokens)}
                  </Field>
                  <Field label="费用（人民币参考换算）">
                    <DifyCallCost log={data} />
                  </Field>
                </dl>
                {incompleteUsage && (
                  <p className="mt-5 rounded-lg bg-surface p-3 text-sm leading-6 text-steel">
                    部分用量或费用尚未取得，未知值不代表零消耗。失败、超时或取消的调用也可能产生用量。
                  </p>
                )}
              </section>
              <div className="grid gap-6 lg:grid-cols-2">
                <section aria-labelledby="scope-title" className="card min-w-0">
                  <h2 id="scope-title" className="text-heading-4 text-ink">
                    业务归属
                  </h2>
                  <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Field label="学生">
                      {data.is_anonymous
                        ? "匿名访客"
                        : data.student_name || "学生"}
                      {data.student_id && (
                        <span className="mt-1 block font-mono text-xs text-steel">
                          {data.student_id}
                        </span>
                      )}
                    </Field>
                    <Field label="课程">
                      {data.course_title ||
                        (data.course_id ? "课程名称未取得" : "未关联课程")}
                      {data.course_id && (
                        <span className="mt-1 block font-mono text-xs text-steel">
                          {data.course_id}
                        </span>
                      )}
                    </Field>
                    <Field label="知识点">
                      {data.topic_title ||
                        (data.topic_id ? "知识点名称未取得" : "未关联知识点")}
                      {data.topic_id && (
                        <span className="mt-1 block font-mono text-xs text-steel">
                          {data.topic_id}
                        </span>
                      )}
                    </Field>
                    <Field label="凭据内部 ID" code>
                      {data.credential_id ?? "未关联"}
                    </Field>
                  </dl>
                </section>
                <section
                  aria-labelledby="request-title"
                  className="card min-w-0"
                >
                  <h2 id="request-title" className="text-heading-4 text-ink">
                    请求与时间
                  </h2>
                  <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Field label="调用编号" code>
                      {data.id}
                    </Field>
                    <Field label="业务请求编号" code>
                      {data.request_id}
                    </Field>
                    <Field label="开始时间">
                      {formatCallTime(data.started_at)}
                    </Field>
                    <Field label="结束时间">
                      {formatCallTime(data.finished_at)}
                    </Field>
                  </dl>
                </section>
              </div>
              <section aria-labelledby="upstream-title" className="card">
                <h2 id="upstream-title" className="text-heading-4 text-ink">
                  上游请求标识
                </h2>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="会话 ID" code>
                    {data.conversation_id}
                  </Field>
                  <Field label="消息 ID" code>
                    {data.message_id}
                  </Field>
                  <Field label="任务 ID" code>
                    {data.task_id}
                  </Field>
                  <Field label="工作流运行 ID" code>
                    {data.workflow_run_id}
                  </Field>
                </dl>
              </section>
            </div>
          )
        )}
      </div>
    </section>
  );
}
