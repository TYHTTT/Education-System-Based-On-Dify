"use client";

import { useState, type FormEvent } from "react";
import { useAdmin } from "@/components/AdminProvider";
import BatchStudentCreateForm from "@/components/BatchStudentCreateForm";
import AdminStudentAccounts from "@/components/AdminStudentAccounts";
import { createStudentAccount } from "@/lib/api";
import type { AuthenticatedStudent } from "@/lib/types";

export default function AdminStudentsPage() {
  const { withAdmin } = useAdmin();
  const [submitting, setSubmitting] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [accountVersion, setAccountVersion] = useState(0);
  const busy = submitting || batchSubmitting || deleting;
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Pick<
    AuthenticatedStudent,
    "username" | "display_name"
  > | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      username: String(data.get("username") ?? "").trim(),
      display_name: String(data.get("display_name") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    };
    setError("");
    setCreated(null);
    if (!payload.display_name) {
      setError("请输入学生姓名。");
      return;
    }
    if (payload.password !== data.get("confirm_password")) {
      setError("两次输入的密码不一致。");
      return;
    }
    setSubmitting(true);
    try {
      const student = await withAdmin((token) =>
        createStudentAccount(token, payload),
      );
      setCreated({
        username: student.username,
        display_name: student.display_name,
      });
      form.reset();
      setAccountVersion((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "创建失败，请稍后重试。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-container">
      <div className="border-b border-hairline pb-8">
        <h1 className="mt-2 text-heading-3 text-ink sm:text-heading-2">
          学生管理
        </h1>
        <p className="mt-3 text-sm leading-6 text-steel">
          学生账号由管理员统一创建，创建后将用户名和初始密码分配给学生。
        </p>
      </div>
      <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-2">
        <div className="card flex min-w-0 flex-col">
          <h2 className="text-heading-4 text-ink">创建学生账号</h2>
          {created && (
            <div
              role="status"
              className="mt-5 break-words rounded-lg bg-emerald-50 p-4 text-sm leading-6 text-emerald-800"
            >
              <p>学生账号已创建。</p>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                <dt>姓名</dt>
                <dd>{created.display_name}</dd>
                <dt>用户名</dt>
                <dd className="break-all font-medium">{created.username}</dd>
              </dl>
              <p className="mt-2">请将用户名和刚设置的初始密码告知学生。</p>
            </div>
          )}
          <form
            aria-label="创建学生账号"
            aria-busy={submitting}
            onSubmit={submit}
            className="mt-6 flex flex-1 flex-col gap-5"
          >
            <fieldset disabled={busy} className="flex flex-1 flex-col gap-5">
              <label className="block text-sm font-medium text-ink">
                学生姓名
                <input
                  required
                  name="display_name"
                  maxLength={64}
                  autoComplete="off"
                  className="text-input mt-1.5"
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                用户名
                <input
                  required
                  name="username"
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9_.\-]+"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby="student-username-hint"
                  className="text-input mt-1.5"
                />
                <span
                  id="student-username-hint"
                  className="mt-1.5 block text-xs font-normal text-steel"
                >
                  3–32 位，可使用英文字母、数字、下划线、点或连字符。
                </span>
              </label>
              <label className="block text-sm font-medium text-ink">
                初始密码
                <input
                  required
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  aria-describedby="student-password-hint"
                  className="text-input mt-1.5"
                />
                <span
                  id="student-password-hint"
                  className="mt-1.5 block text-xs font-normal text-steel"
                >
                  8–128 位，请在创建前记下初始密码，供学生登录使用。
                </span>
              </label>
              <label className="mt-auto block text-sm font-medium text-ink">
                确认初始密码
                <input
                  required
                  name="confirm_password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  className="text-input mt-1.5 block"
                />
              </label>
            </fieldset>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="btn-primary mt-auto w-full self-start sm:w-auto"
            >
              {submitting ? "正在创建…" : "创建学生账号"}
            </button>
          </form>
        </div>
        <BatchStudentCreateForm
          disabled={submitting || deleting}
          onSubmittingChange={setBatchSubmitting}
          onCreated={() => setAccountVersion((value) => value + 1)}
        />
      </div>
      <AdminStudentAccounts
        version={accountVersion}
        disabled={busy}
        onDeletingChange={setDeleting}
      />
    </section>
  );
}
