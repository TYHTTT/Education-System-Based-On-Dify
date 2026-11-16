"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/AdminProvider";
import DifyConnectionFields from "@/components/DifyConnectionFields";
import { message } from "@/components/AdminCourseForms";
import { getAdminDifySettings, saveAdminDifySettings } from "@/lib/api";
import type { FreeQaDifySettings } from "@/lib/types";

export default function FreeQaDifySettingsPanel() {
  const { withAdmin, status } = useAdmin();
  const [data, setData] = useState<FreeQaDifySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const [formVersion, setFormVersion] = useState(0);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#free-qa-settings") setExpanded(true);
    };
    const timer = window.setTimeout(openFromHash, 0);
    window.addEventListener("hashchange", openFromHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await withAdmin((token) =>
          getAdminDifySettings(token, controller.signal),
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
  }, [status, withAdmin, version]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = String(form.get("dify_api_key") ?? "").trim();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await withAdmin((token) =>
        saveAdminDifySettings(token, {
          api_base_url: String(form.get("dify_api_base_url") ?? "").trim(),
          ...(key ? { api_key: key } : {}),
        }),
      );
      setData(result);
      setFormVersion((value) => value + 1);
      setNotice("自由问答配置已保存，新请求立即生效。");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  const badge = loading
    ? "正在读取"
    : data
      ? data.api_key_configured
        ? "已配置"
        : "未配置密钥"
      : "加载失败";
  return (
    <details
      id="free-qa-settings"
      className="mt-6 scroll-mt-24 rounded-xl border border-hairline bg-canvas p-5 sm:p-6"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-heading-4 text-ink">
        自由问答 Dify 配置
        <span
          className={`ml-3 inline-block rounded-md px-2 py-1 align-middle text-xs font-normal ${data?.api_key_configured ? "bg-emerald-50 text-emerald-700" : "bg-surface text-steel"}`}
        >
          {badge}
        </span>
      </summary>
      <p className="mt-3 text-sm leading-6 text-steel">
        用于学生首页的自由问答。各课程的 Dify
        服务与完成门限在对应课程详情中设置。
      </p>
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
        >
          <p>{error}</p>
          {!data && (
            <button
              type="button"
              onClick={() => setVersion((value) => value + 1)}
              className="mt-3 underline"
            >
              重新加载自由问答配置
            </button>
          )}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-8 text-center text-sm text-steel">
          正在加载自由问答配置…
        </p>
      ) : (
        data && (
          <form
            key={`${data.updated_at}:${formVersion}`}
            aria-label="自由问答 Dify 配置"
            onSubmit={save}
            className="mt-5"
          >
            <fieldset
              disabled={saving}
              className="grid max-w-3xl gap-5 sm:grid-cols-2"
            >
              <DifyConnectionFields
                apiBaseUrl={data.api_base_url}
                apiKeyConfigured={data.api_key_configured}
              />
            </fieldset>
            <div className="mt-5 flex justify-end border-t border-hairline pt-5">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary disabled:cursor-wait"
              >
                {saving ? "正在保存…" : "保存自由问答配置"}
              </button>
            </div>
          </form>
        )
      )}
    </details>
  );
}
