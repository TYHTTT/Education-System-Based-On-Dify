"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CourseInput, CourseRecord } from "@/lib/types";

export const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500";
export const buttonClass =
  "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-50";
export const primaryClass =
  "rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-50";
export function message(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

export function CourseEditor({
  course,
  onSave,
  onCancel,
}: {
  course: CourseRecord | null;
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
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: String(data.get("title")).trim(),
        description: String(data.get("description")).trim(),
        active: data.get("active") === "on",
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
      className="mt-6 rounded-3xl border border-indigo-200 bg-white p-5 sm:p-6"
    >
      <h2 className="text-lg font-bold text-slate-900">
        {course ? "编辑课程" : "新增课程"}
      </h2>
      <form aria-label="课程信息" onSubmit={submit} className="mt-5">
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
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
        <div className="mt-5 flex justify-end gap-3">
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
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/40"
    >
      <h2
        id="delete-course-heading"
        className="text-lg font-bold text-slate-900"
      >
        删除课程
      </h2>
      <p className="mt-4 break-words text-sm leading-6 text-slate-600">
        确定永久删除“{course.title}”？该课程的全部章节、知识点、图谱连线、学生学习状态及学习会话将一并删除。
      </p>
      <p className="mt-3 text-sm font-semibold text-rose-700">此操作无法恢复。</p>
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
          className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {deleting ? "正在删除…" : "确认删除"}
        </button>
      </div>
    </dialog>
  );
}
