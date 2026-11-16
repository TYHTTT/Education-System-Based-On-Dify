"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/AdminProvider";

export default function ChangeAdminPassword() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary"
      >
        修改密码
      </button>
      {open && <ChangePasswordDialog onCancel={() => setOpen(false)} />}
    </>
  );
}

function ChangePasswordDialog({ onCancel }: { onCancel: () => void }) {
  const { changePassword } = useAdmin();
  const ref = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("current_password") ?? "");
    const newPassword = String(data.get("new_password") ?? "");
    setError("");
    if ([...newPassword].length < 8 || [...newPassword].length > 128) {
      setError("新密码须为 8–128 个字符。");
      return;
    }
    if (newPassword !== data.get("confirm_password")) {
      setError("两次输入的新密码不一致。");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "修改失败，请稍后重试。",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="change-admin-password-heading"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-hairline bg-canvas p-6 shadow-modal backdrop:bg-slate-950/40"
    >
      <h2
        id="change-admin-password-heading"
        className="text-heading-4 text-ink"
      >
        修改管理员密码
      </h2>
      <p className="mt-3 text-sm leading-6 text-steel">
        修改成功后将退出管理后台，请使用新密码重新登录。
      </p>
      <form
        aria-label="修改管理员密码"
        onSubmit={submit}
        className="mt-5 space-y-5"
      >
        <fieldset disabled={saving} className="space-y-5">
          <label className="block text-sm font-medium text-ink">
            当前密码
            <input
              required
              name="current_password"
              type="password"
              maxLength={128}
              autoComplete="current-password"
              className="text-input mt-1.5"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            新密码
            <input
              required
              name="new_password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              aria-describedby="admin-new-password-hint"
              className="text-input mt-1.5"
            />
            <span
              id="admin-new-password-hint"
              className="mt-1.5 block text-xs font-normal text-steel"
            >
              8–128 个字符。
            </span>
          </label>
          <label className="block text-sm font-medium text-ink">
            确认新密码
            <input
              required
              name="confirm_password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              className="text-input mt-1.5"
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="btn-secondary"
          >
            取消
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "正在修改…" : "确认修改"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
