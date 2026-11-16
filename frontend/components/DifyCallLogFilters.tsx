"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/AdminProvider";
import { getAdminDifyCallLogFilterOptions } from "@/lib/api";
import {
  BUSINESS_LABELS,
  STATUSES,
  CALL_LOG_FILTER_KEYS,
  beijingTimeInput,
  beijingTimeQuery,
} from "@/lib/dify-call-logs";
import type { DifyCallLogFilters, DifyCallLogFilterOptions } from "@/lib/types";

export default function CallLogFilters({
  initial,
  onApply,
  label = "筛选调用日志",
  compact = false,
}: {
  initial: DifyCallLogFilters;
  onApply: (filters: DifyCallLogFilters) => void;
  label?: string;
  compact?: boolean;
}) {
  const { withAdmin, status } = useAdmin();
  const [options, setOptions] = useState<DifyCallLogFilterOptions | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [version, setVersion] = useState(0);
  const [expanded, setExpanded] = useState(
    !compact ||
      CALL_LOG_FILTER_KEYS.some(
        (key) => !key.startsWith("started_") && initial[key],
      ),
  );
  const [credential, setCredential] = useState(initial.credential_id ?? "");
  useEffect(() => {
    if (status !== "ready") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setOptionsError(false);
      try {
        const result = await withAdmin((token) =>
          getAdminDifyCallLogFilterOptions(token, controller.signal),
        );
        if (!controller.signal.aborted) setOptions(result);
      } catch {
        if (!controller.signal.aborted) setOptionsError(true);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [status, withAdmin, version]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const start = String(values.get("started_from") ?? "");
    const before = String(values.get("started_before") ?? "");
    const endField = form.elements.namedItem(
      "started_before",
    ) as HTMLInputElement;
    endField.setCustomValidity(
      start &&
        before &&
        new Date(beijingTimeQuery(start)).getTime() >
          new Date(beijingTimeQuery(before)).getTime()
        ? "截止时间不得早于开始时间"
        : "",
    );
    if (!form.reportValidity()) return;
    const filters = Object.fromEntries(
      CALL_LOG_FILTER_KEYS.map((key) => [
        key,
        String(values.get(key) ?? "").trim(),
      ]),
    );
    filters.started_from = beijingTimeQuery(start);
    filters.started_before = beijingTimeQuery(before);
    onApply(filters);
  }

  return (
    <form
      aria-label={label}
      onSubmit={apply}
      onInput={(event) =>
        (
          event.currentTarget.elements.namedItem(
            "started_before",
          ) as HTMLInputElement
        ).setCustomValidity("")
      }
      onReset={(event) => {
        (
          event.currentTarget.elements.namedItem(
            "started_before",
          ) as HTMLInputElement
        ).setCustomValidity("");
        setCredential("");
        onApply({});
      }}
      className="mt-6 rounded-xl border border-hairline bg-surface/50 p-4 sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm text-charcoal">
          开始时间(UTC+8)
          <input
            type="datetime-local"
            step="1"
            name="started_from"
            defaultValue={beijingTimeInput(initial.started_from)}
            className="form-field mt-1.5 w-full min-w-0"
          />
        </label>
        <label className="min-w-0 text-sm text-charcoal">
          截止时间(UTC+8)
          <input
            type="datetime-local"
            step="1"
            name="started_before"
            defaultValue={beijingTimeInput(initial.started_before)}
            onInput={(event) => event.currentTarget.setCustomValidity("")}
            className="form-field mt-1.5 w-full min-w-0"
          />
        </label>
        <details
          className="sm:col-span-2"
          open={expanded}
          onToggle={(event) => setExpanded(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium text-ink">
            更多筛选：Key、学生、课程、知识点和调用状态
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="min-w-0 text-sm text-charcoal">
              Dify Key（凭据）
              <select
                name="credential_id"
                value={credential}
                onChange={(event) => setCredential(event.currentTarget.value)}
                className="form-field mt-1.5 w-full"
              >
                <option value="">全部凭据</option>
                <option value="unassigned">未关联凭据</option>
                {credential &&
                  credential !== "unassigned" &&
                  !options?.credentials.some(
                    (item) => item.id === credential,
                  ) && <option value={credential}>凭据 {credential}</option>}
                {options?.credentials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.course_titles
                      .concat(item.free_qa ? ["自由问答"] : [])
                      .join("、") || "历史凭据"}{" "}
                    · {item.id}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["student", "学生", "姓名、用户名或学生 ID"],
                ["course", "课程", "课程名称或课程 ID"],
                ["topic", "知识点", "知识点名称或 ID"],
              ] as const
            ).map(([name, label, placeholder]) => (
              <label key={name} className="min-w-0 text-sm text-charcoal">
                {label}
                <input
                  name={name}
                  defaultValue={initial[name] ?? ""}
                  placeholder={placeholder}
                  maxLength={100}
                  className="form-field mt-1.5 w-full"
                />
              </label>
            ))}
            <label className="min-w-0 text-sm text-charcoal">
              学生类型
              <select
                name="student_type"
                defaultValue={initial.student_type ?? ""}
                className="form-field mt-1.5 w-full"
              >
                <option value="">全部学生类型</option>
                <option value="registered">已登录学生</option>
                <option value="anonymous">匿名访客</option>
              </select>
            </label>
            <label className="min-w-0 text-sm text-charcoal">
              业务类型
              <select
                name="business_type"
                defaultValue={initial.business_type ?? ""}
                className="form-field mt-1.5 w-full"
              >
                <option value="">全部业务类型</option>
                {Object.entries(BUSINESS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm text-charcoal">
              状态
              <select
                name="status"
                defaultValue={initial.status ?? ""}
                className="form-field mt-1.5 w-full"
              >
                <option value="">全部状态</option>
                {Object.entries(STATUSES).map(([value, state]) => (
                  <option key={value} value={value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </div>
      {optionsError && (
        <p role="alert" className="mt-3 text-sm text-amber-800">
          凭据选项暂时无法加载，其他条件仍可筛选。
          <button
            type="button"
            onClick={() => setVersion((value) => value + 1)}
            className="ml-2 underline"
          >
            重新加载凭据
          </button>
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary">
          筛选
        </button>
        <button type="reset" className="btn-secondary">
          清除筛选
        </button>
        <p className="text-xs leading-5 text-steel">
          条件组合生效；开始时间和截止时间均包含。
        </p>
      </div>
    </form>
  );
}
