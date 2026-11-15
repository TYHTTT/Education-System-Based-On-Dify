"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminCourseRecord, CourseInput, CourseRecord } from "@/lib/types";
import DifyConnectionFields from "@/components/DifyConnectionFields";

export const inputClass = "form-field mt-1.5";
export const buttonClass = "btn-secondary";
export const primaryClass = "btn-primary disabled:cursor-wait";
export function message(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

export function CourseEditor({
  course,
  onSave,
  onCancel,
}: {
  course: AdminCourseRecord | null;
  onSave: (values: CourseInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const firstInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstInput.current?.focus();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const apiKey = String(data.get("dify_api_key") ?? "").trim();
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: String(data.get("title")).trim(),
        description: String(data.get("description")).trim(),
        active: data.get("active") === "on",
        completion_threshold: Number(data.get("completion_threshold")),
        dify_api_base_url: String(data.get("dify_api_base_url") ?? "").trim(),
        ...(apiKey ? { dify_api_key: apiKey } : {}),
      });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      aria-label={course ? "编辑课程" : "新增课程"}
      className="card mt-6 p-5 sm:p-8"
    >
      <h2 className="text-heading-4 text-ink">
        {course ? "编辑课程" : "新增课程"}
      </h2>
      <form aria-label="课程信息" onSubmit={submit} className="mt-5">
        <fieldset disabled={saving} className="grid gap-6 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            课程名称
            <input
              ref={firstInput}
              required
              name="title"
              maxLength={100}
              defaultValue={course?.title}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            课程简介
            <textarea
              name="description"
              maxLength={1000}
              rows={3}
              defaultValue={course?.description}
              className={`${inputClass} resize-y`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            学习完成门限
            <input
              name="completion_threshold"
              type="number"
              required
              min={0}
              max={100}
              step="0.01"
              defaultValue={course?.completion_threshold ?? 80}
              className={inputClass}
            />
            <span className="mt-1.5 block text-xs font-normal text-slate-500">
              满分 100 分，最新作答分数严格高于此门限才标记为已完成。修改后，已有评分也会按新门限重新判定。
            </span>
          </label>
          <DifyConnectionFields
            apiBaseUrl={course?.dify_api_base_url ?? "https://api.dify.ai/v1"}
            apiKeyConfigured={Boolean(course?.dify_api_key_configured)}
          />
          <label className="flex items-center gap-2 self-center text-sm font-medium text-slate-700">
            <input
              name="active"
              type="checkbox"
              defaultChecked={course?.active ?? true}
              className="size-4 accent-indigo-600"
            />
            在学生端展示
          </label>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-hairline-soft pt-6">
          <button
            disabled={saving}
            type="button"
            onClick={onCancel}
            className={buttonClass}
          >
            取消
          </button>
          <button disabled={saving} type="submit" className={primaryClass}>
            {saving ? "正在保存…" : "保存课程"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function DeleteDialog({
  course,
  onDelete,
  onCancel,
}: {
  course: CourseRecord;
  onDelete: () => Promise<void>;
  onCancel: () => void;
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
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setDeleting(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-course-heading"
      onCancel={(event) => {
        if (deleting) event.preventDefault();
        else onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-hairline bg-canvas p-6 shadow-modal backdrop:bg-slate-950/40"
    >
      <h2
        id="delete-course-heading"
        className="text-lg font-bold text-slate-900"
      >
        删除课程
      </h2>
      <p className="mt-4 break-words text-sm leading-6 text-slate-600">
        确定永久删除“{course.title}
        ”？该课程的全部章节、知识点、图谱连线、学生学习状态及学习会话将一并删除。
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
          disabled={deleting}
          type="button"
          onClick={onCancel}
          className={buttonClass}
        >
          取消
        </button>
        <button
          disabled={deleting}
          type="button"
          onClick={() => void remove()}
          className="btn bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {deleting ? "正在删除…" : "确认删除"}
        </button>
      </div>
    </dialog>
  );
}
