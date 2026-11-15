"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/AdminProvider";
import DifyConnectionFields from "@/components/DifyConnectionFields";
import { message } from "@/components/AdminCourseForms";
import { getAdminDifySettings, saveAdminDifySettings } from "@/lib/api";
import type { FreeQaDifySettings } from "@/lib/types";

export default function AdminDifySettingsPage() {
  const { withAdmin, status } = useAdmin();
  const [data, setData] = useState<FreeQaDifySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await withAdmin((token) => getAdminDifySettings(token, controller.signal));
        if (!controller.signal.aborted) setData(result);
      } catch (cause) {
        if (!controller.signal.aborted) setError(message(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [status, withAdmin, version]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = String(form.get("dify_api_key") ?? "").trim();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await withAdmin((token) => saveAdminDifySettings(token, {
        api_base_url: String(form.get("dify_api_base_url") ?? "").trim(),
        ...(key ? { api_key: key } : {}),
      }));
      setData(result);
      setNotice("自由问答配置已保存，新请求立即生效。");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-3 text-ink">自由问答 Dify 配置</h1>
          <p className="mt-2 text-sm leading-6 text-steel">课程学习的 Dify 服务与完成门限，请在对应课程的编辑页设置。</p>
        </div>
        <Link href="/admin/courses" className="btn-secondary">管理课程配置</Link>
      </div>
      {error && <div role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
        {error}
        {!data && <button type="button" onClick={() => setVersion((current) => current + 1)} className="ml-3 underline">重新加载</button>}
      </div>}
      {notice && <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
      {loading ? <p role="status" className="py-12 text-center text-sm text-steel">正在加载配置…</p> : data && (
        <form key={data.updated_at} onSubmit={save} className="card mt-6 p-5 sm:p-8">
          <fieldset disabled={saving} className="grid gap-6 sm:grid-cols-2">
            <DifyConnectionFields apiBaseUrl={data.api_base_url} apiKeyConfigured={data.api_key_configured} />
          </fieldset>
          <div className="mt-6 flex justify-end border-t border-hairline-soft pt-6">
            <button type="submit" disabled={saving} className="btn-primary disabled:cursor-wait">{saving ? "正在保存…" : "保存配置"}</button>
          </div>
        </form>
      )}
    </section>
  );
}
