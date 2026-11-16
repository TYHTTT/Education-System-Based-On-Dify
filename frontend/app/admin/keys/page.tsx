"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAdmin } from "@/components/AdminProvider";
import { message } from "@/components/AdminCourseForms";
import DifyCallCost from "@/components/DifyCallCost";
import {
  getAdminDifyCredentials,
  setAdminDifyCredentialEnabled,
} from "@/lib/api";
import {
  callLogPage,
  formatCallTime,
  formatCallTokens,
} from "@/lib/dify-call-logs";
import type { DifyCredentialList } from "@/lib/types";

export default function AdminKeysPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="page-container text-sm text-steel">
          正在加载密钥用量…
        </p>
      }
    >
      <KeysContent />
    </Suspense>
  );
}

function KeysContent() {
  const { status, withAdmin } = useAdmin();
  const router = useRouter();
  const page = callLogPage(useSearchParams().get("page"));
  const [data, setData] = useState<DifyCredentialList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      setActionError("");
      setNotice("");
      try {
        const result = await withAdmin((token) =>
          getAdminDifyCredentials(token, page, controller.signal),
        );
        if (!controller.signal.aborted) setData(result);
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
  }, [page, status, version, withAdmin]);

  const busy = loading || (!error && data !== null && data.page !== page);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  function refresh() {
    setLoading(true);
    setError("");
    setVersion((value) => value + 1);
  }

  async function toggle(id: string, enabled: boolean) {
    setPending(id);
    setActionError("");
    setNotice("");
    try {
      const result = await withAdmin((token) =>
        setAdminDifyCredentialEnabled(token, id, enabled),
      );
      setData(
        (current) =>
          current && {
            ...current,
            items: current.items.map((item) =>
              item.id === result.id
                ? { ...item, enabled: result.enabled }
                : item,
            ),
          },
      );
      setNotice(
        `凭据 ${result.id} 已${result.enabled ? "启用，可发起新调用。" : "停用，新调用将被拦截；已受理调用继续完成。"}`,
      );
    } catch (cause) {
      setActionError(message(cause) + "；可刷新确认当前状态后重试。");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-8">
        <div>
          <p className="eyebrow">Dify keys</p>
          <h1 className="mt-2 text-heading-3 text-ink sm:text-heading-2">
            密钥管理
          </h1>
          <p className="mt-3 text-sm leading-6 text-steel">
            查看每个 Key 自启用日志以来的累计用量，管理新调用的启停。
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy || pending !== null}
          className="btn-secondary"
        >
          刷新
        </button>
      </div>
      <p className="mt-6 rounded-xl bg-surface p-4 text-sm leading-6 text-steel">
        同一 Dify 服务下，共用 Key
        的课程和自由问答一起生效。停用会拦截新调用，已受理调用继续完成，历史记录保留。
        这里仅显示内部凭据 ID；在“课程管理”或“Dify 配置”中配置 Key。
      </p>
      {notice && (
        <p
          role="status"
          className="mt-4 break-words rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
        >
          {actionError}
        </p>
      )}
      <div aria-busy={busy} className="mt-6">
        {busy ? (
          <p role="status" className="py-12 text-center text-sm text-steel">
            正在加载密钥用量…
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
            <>
              <p className="mb-4 text-sm text-steel">
                共 {data.total}{" "}
                个凭据，包含尚未调用和已不再关联配置的历史凭据。未知用量不代表零消耗；不同币种分别统计。
              </p>
              {data.items.length ? (
                <div className="grid gap-5 xl:grid-cols-2">
                  {data.items.map((item) => (
                    <article
                      key={item.id}
                      aria-label={`凭据 ${item.id}`}
                      className="card min-w-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words text-heading-4 text-ink">
                            {[
                              ...item.course_titles,
                              ...(item.free_qa ? ["自由问答"] : []),
                            ].join(" · ") || "历史凭据（当前无配置关联）"}
                          </h2>
                          <p className="mt-2 break-all font-mono text-xs text-steel">
                            {item.id}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                        >
                          {item.enabled ? "已启用" : "已停用"}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-steel">
                        创建于 {formatCallTime(item.created_at)}（北京时间）
                      </p>
                      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {[
                          [
                            "调用次数",
                            item.total_calls.toLocaleString("zh-CN"),
                            `${item.in_progress_calls} 次进行中`,
                          ],
                          [
                            "输入 Token",
                            formatCallTokens(item.prompt_tokens),
                            `${item.unknown_prompt_calls} 次未知`,
                          ],
                          [
                            "输出 Token",
                            formatCallTokens(item.completion_tokens),
                            `${item.unknown_completion_calls} 次未知`,
                          ],
                          [
                            "总 Token",
                            formatCallTokens(item.total_tokens),
                            `${item.unknown_total_token_calls} 次未知`,
                          ],
                        ].map(([label, value, note]) => (
                          <div key={label} className="min-w-0">
                            <dt className="text-xs text-steel">{label}</dt>
                            <dd className="mt-2 break-all text-lg tabular-nums text-ink">
                              {value}
                            </dd>
                            <dd className="mt-1 text-xs text-steel">{note}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-5 border-t border-hairline pt-4 text-sm">
                        <h3 className="font-medium text-ink">已报告费用</h3>
                        {item.currencies.length ? (
                          <ul className="mt-3 space-y-3">
                            {item.currencies.map((currency) => (
                              <li
                                key={currency.currency ?? "unknown"}
                                className="flex flex-wrap items-start justify-between gap-2"
                              >
                                <span className="text-steel">
                                  {currency.currency ?? "币种未知"} ·{" "}
                                  {currency.known_price_calls}/
                                  {currency.call_count} 次费用已报告
                                </span>
                                <div className="max-w-full text-ink">
                                  <DifyCallCost log={currency} compact />
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-3 text-steel">暂无费用记录</p>
                        )}
                        <p className="mt-3 text-xs leading-5 text-steel">
                          {item.unknown_usage_calls} 次 Token 信息不完整 ·{" "}
                          {item.unknown_cost_calls}{" "}
                          次费用或币种未知。人民币金额为参考估算。
                        </p>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
                        <div className="flex flex-wrap gap-4 text-sm">
                          <Link
                            className="text-brand-purple-700 underline"
                            href={`/admin/call-logs?page=1&credential_id=${encodeURIComponent(item.id)}`}
                          >
                            查看调用日志
                          </Link>
                          <Link
                            className="text-brand-purple-700 underline"
                            href={`/admin/usage?credential_id=${encodeURIComponent(item.id)}`}
                          >
                            筛选用量
                          </Link>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={pending !== null}
                          aria-label={`${item.enabled ? "停用" : "启用"}凭据 ${item.id}`}
                          onClick={() => void toggle(item.id, !item.enabled)}
                        >
                          {pending === item.id
                            ? "正在保存…"
                            : item.enabled
                              ? "停用"
                              : "启用"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p
                  role="status"
                  className="card py-12 text-center text-sm text-steel"
                >
                  {data.total
                    ? "当前页暂无凭据，可返回上一页。"
                    : "暂无凭据，请先在课程管理或 Dify 配置中保存 Key。"}
                </p>
              )}
              <nav
                aria-label="密钥列表分页"
                className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm"
              >
                <p className="text-steel">
                  第 {page} / {pages} 页
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={page <= 1 || pending !== null}
                    className="btn-secondary"
                    onClick={() =>
                      router.push(`/admin/keys?page=${page - 1}`, {
                        scroll: false,
                      })
                    }
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={page >= pages || pending !== null}
                    className="btn-secondary"
                    onClick={() =>
                      router.push(`/admin/keys?page=${page + 1}`, {
                        scroll: false,
                      })
                    }
                  >
                    下一页
                  </button>
                </div>
              </nav>
            </>
          )
        )}
      </div>
    </section>
  );
}
