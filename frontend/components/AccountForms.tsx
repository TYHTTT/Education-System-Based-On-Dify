"use client";

import { useState, type FormEvent } from "react";

type Profile = { username: string; display_name: string };

export function AccountProfileForm({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (values: Profile) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const values = {
      username: String(data.get("username") ?? "").trim(),
      display_name: String(data.get("display_name") ?? "").trim(),
    };
    setError("");
    setNotice("");
    if (!values.display_name) {
      setError("姓名不能为空。");
      return;
    }
    setSaving(true);
    try {
      await onSave(values);
      setNotice("账号信息已保存，下次登录请使用保存后的用户名。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "保存失败，请稍后重试。",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      aria-label="修改基本信息"
      onSubmit={submit}
      className="mt-5 space-y-5"
    >
      <fieldset disabled={saving} className="space-y-5">
        <label className="block text-sm font-medium text-ink">
          姓名
          <input
            required
            name="display_name"
            defaultValue={profile.display_name}
            maxLength={64}
            autoComplete="name"
            className="text-input mt-1.5"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          用户名
          <input
            required
            name="username"
            defaultValue={profile.username}
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_.\-]+"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="account-username-hint"
            className="text-input mt-1.5"
          />
          <span
            id="account-username-hint"
            className="mt-1.5 block text-xs font-normal text-steel"
          >
            3–32 位英文字母、数字、下划线、点或连字符。用户名用于登录。
          </span>
        </label>
      </fieldset>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "正在保存…" : "保存信息"}
      </button>
    </form>
  );
}

export function AccountPasswordForm({
  onSave,
  role,
}: {
  onSave: (current: string, next: string) => Promise<void>;
  role: "student" | "admin";
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const current = String(data.get("current_password") ?? ""),
      next = String(data.get("new_password") ?? "");
    setError("");
    if ([...next].length < 8 || [...next].length > 128) {
      setError("新密码须为 8–128 个字符。");
      return;
    }
    if (next !== data.get("confirm_password")) {
      setError("两次输入的新密码不一致。");
      return;
    }
    setSaving(true);
    try {
      await onSave(current, next);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "修改失败，请稍后重试。",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      aria-label={role === "admin" ? "修改管理员密码" : "修改学生密码"}
      onSubmit={submit}
      className="mt-5 space-y-5"
    >
      <p className="text-sm leading-6 text-steel">
        修改成功后将退出当前账号，请使用新密码重新登录。
      </p>
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
            aria-describedby="account-password-hint"
            className="text-input mt-1.5"
          />
          <span
            id="account-password-hint"
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
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "正在修改…" : "确认修改密码"}
      </button>
    </form>
  );
}
