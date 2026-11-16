"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/AdminProvider";

export default function DeleteAdminAccount() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-rose-700 hover:bg-rose-50"
      >
        删除管理员账号
      </button>
      {open && <DeleteAccountDialog onCancel={() => setOpen(false)} />}
    </>
  );
}

function DeleteAccountDialog({ onCancel }: { onCancel: () => void }) {
  const { admin, deleteAccount } = useAdmin();
  const ref = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleting) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    setDeleting(true);
    setError("");
    try {
      await deleteAccount(password);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "删除失败，请稍后重试。",
      );
      form.reset();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-admin-heading"
      onCancel={(event) => {
        if (deleting) event.preventDefault();
        else onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-hairline bg-canvas p-6 shadow-modal backdrop:bg-slate-950/40"
    >
      <h2 id="delete-admin-heading" className="text-heading-4 text-ink">
        删除管理员账号
      </h2>
      <p className="mt-4 break-words text-sm leading-6 text-steel">
        确定永久删除当前管理员“{admin?.display_name}”（用户名：{admin?.username}
        ）？删除后将退出管理后台，该账号无法再登录。课程、学生账号和历史调用记录保留。
      </p>
      <p className="mt-3 text-sm font-semibold text-rose-700">
        此操作无法恢复，请输入当前管理员密码确认。
      </p>
      <form
        aria-label="删除当前管理员账号"
        onSubmit={submit}
        className="mt-5 space-y-5"
      >
        <label className="block text-sm font-medium text-ink">
          当前管理员密码
          <input
            required
            type="password"
            name="password"
            maxLength={128}
            autoComplete="current-password"
            disabled={deleting}
            className="text-input mt-1.5"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="btn-secondary"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={deleting}
            className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? "正在删除…" : "确认删除并退出"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
