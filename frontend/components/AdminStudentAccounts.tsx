"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/AdminProvider";
import { deleteStudentAccount, getStudentAccounts } from "@/lib/api";
import type { StudentAccount, StudentAccountList } from "@/lib/types";

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "操作失败，请稍后重试。";
}

export default function AdminStudentAccounts({
  version,
  disabled,
  onDeletingChange,
}: {
  version: number;
  disabled: boolean;
  onDeletingChange: (pending: boolean) => void;
}) {
  const { status, withAdmin } = useAdmin();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<StudentAccountList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<StudentAccount | null>(null);

  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await withAdmin((token) =>
          getStudentAccounts(token, { q: query, page }, controller.signal),
        );
        if (!controller.signal.aborted) {
          if (page > 1 && !result.items.length) {
            setPage(Math.max(1, Math.ceil(result.total / result.page_size)));
          } else setData(result);
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
  }, [status, withAdmin, query, page, version, refresh]);

  function reload() {
    setLoading(true);
    setRefresh((value) => value + 1);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setQuery(String(values.get("q") ?? "").trim());
    setPage(1);
    setNotice("");
    reload();
  }

  async function remove(student: StudentAccount) {
    await withAdmin((token) => deleteStudentAccount(token, student.student_id));
    setSelected(null);
    setNotice(
      `已删除学生账号：${student.username || student.display_name || student.student_id}。`,
    );
    reload();
  }

  const busy = loading || disabled;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section aria-label="学生账号列表" className="card mt-8 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-heading-4 text-ink">学生账号列表</h2>
        <button
          type="button"
          disabled={busy}
          onClick={reload}
          className="btn-secondary"
        >
          刷新列表
        </button>
      </div>
      <form
        aria-label="搜索学生账号"
        onSubmit={search}
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        <label className="min-w-0 flex-1 text-sm font-medium text-ink">
          姓名或用户名
          <input
            name="q"
            type="search"
            maxLength={100}
            placeholder="搜索姓名或用户名"
            className="text-input mt-1.5"
            disabled={disabled}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-secondary">
          搜索
        </button>
      </form>
      {notice && (
        <p
          role="status"
          className="mt-5 break-words rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <div aria-busy={loading} className="mt-5">
        {loading ? (
          <p role="status" className="py-10 text-center text-sm text-steel">
            正在加载学生账号…
          </p>
        ) : error ? (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={reload}
              disabled={disabled}
              className="mt-3 underline"
            >
              重试
            </button>
          </div>
        ) : (
          data && (
            <>
              <p className="mb-4 text-sm text-steel">
                共 {data.total} 个学生账号
              </p>
              {data.items.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-hairline text-steel">
                      <tr>
                        <th scope="col" className="px-3 py-3 font-medium">
                          学生姓名
                        </th>
                        <th scope="col" className="px-3 py-3 font-medium">
                          用户名
                        </th>
                        <th
                          scope="col"
                          className="hidden px-3 py-3 font-medium sm:table-cell"
                        >
                          状态
                        </th>
                        <th
                          scope="col"
                          className="hidden px-3 py-3 font-medium sm:table-cell"
                        >
                          创建时间（北京时间）
                        </th>
                        <th scope="col" className="px-3 py-3 font-medium">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {data.items.map((student) => (
                        <tr key={student.student_id}>
                          <td className="max-w-48 break-words px-3 py-4 text-ink">
                            {student.display_name || "未设置"}
                          </td>
                          <td className="max-w-48 break-all px-3 py-4">
                            {student.username || "未设置"}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-4 sm:table-cell">
                            {student.active ? "正常" : "已停用"}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-4 text-steel sm:table-cell">
                            {new Date(student.created_at).toLocaleString(
                              "zh-CN",
                              { timeZone: "Asia/Shanghai" },
                            )}
                          </td>
                          <td className="px-3 py-4">
                            <button
                              type="button"
                              disabled={disabled}
                              aria-label={`删除学生账号 ${student.username || student.display_name || student.student_id}`}
                              onClick={() => setSelected(student)}
                              className="rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p
                  role="status"
                  className="py-10 text-center text-sm text-steel"
                >
                  {query
                    ? "没有找到匹配的学生账号。"
                    : "暂无学生账号，请先创建。"}
                </p>
              )}
              <nav
                aria-label="学生账号分页"
                className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <p className="text-steel">
                  第 {page} / {pages} 页
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={disabled || page <= 1}
                    onClick={() => {
                      setLoading(true);
                      setPage((value) => value - 1);
                    }}
                    className="btn-secondary"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={disabled || page >= pages}
                    onClick={() => {
                      setLoading(true);
                      setPage((value) => value + 1);
                    }}
                    className="btn-secondary"
                  >
                    下一页
                  </button>
                </div>
              </nav>
            </>
          )
        )}
      </div>
      {selected && (
        <DeleteStudentDialog
          student={selected}
          onCancel={() => setSelected(null)}
          onDelete={() => remove(selected)}
          onDeletingChange={onDeletingChange}
        />
      )}
    </section>
  );
}

function DeleteStudentDialog({
  student,
  onCancel,
  onDelete,
  onDeletingChange,
}: {
  student: StudentAccount;
  onCancel: () => void;
  onDelete: () => Promise<void>;
  onDeletingChange: (pending: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    onDeletingChange(true);
    setError("");
    try {
      await onDelete();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setDeleting(false);
      onDeletingChange(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-student-heading"
      onCancel={(event) => {
        if (deleting) event.preventDefault();
        else onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-hairline bg-canvas p-6 shadow-modal backdrop:bg-slate-950/40"
    >
      <h2 id="delete-student-heading" className="text-heading-4 text-ink">
        删除学生账号
      </h2>
      <p className="mt-4 break-words text-sm leading-6 text-steel">
        确定永久删除学生“{student.display_name || "未设置姓名"}”（用户名：
        {student.username || "未设置"}
        ）？该账号将无法登录，已有登录会话和学习进度会一并删除，历史调用日志与用量记录保留。
      </p>
      <p className="mt-3 text-sm font-semibold text-rose-700">
        此操作无法恢复。
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={deleting}
          className="btn-secondary"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={deleting}
          className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {deleting ? "正在删除…" : "确认删除"}
        </button>
      </div>
    </dialog>
  );
}
