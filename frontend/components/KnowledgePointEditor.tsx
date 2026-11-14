"use client";

import { useState, useRef, useEffect, useId, type FormEvent } from "react";
import type {
  ManagedTopic,
  TopicGroup,
  TopicValues,
} from "@/lib/topic-management";
import RelatedTopicsPicker from "@/components/RelatedTopicsPicker";

export const fieldClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";
export const actionClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-indigo-300 disabled:opacity-40";
export const primaryClass =
  "rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40";
const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export default function KnowledgePointEditor({
  topic,
  groups,
  courseId,
  initialGroupId,
  returnFocus,
  onSave,
  onCancel,
}: {
  topic: ManagedTopic | null;
  groups: TopicGroup[];
  courseId: string;
  returnFocus: HTMLElement;
  onSave: (values: TopicValues) => Promise<void>;
  onCancel: () => void;
  initialGroupId?: string;
}) {
  const chapters = groups;
  const initial =
    chapters.find((g) => g.id === (topic?.chapter_id ?? initialGroupId)) ??
    chapters[0];
  const [chapter] = useState(initial?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [relatedIds, setRelatedIds] = useState(topic?.related_topic_ids ?? []);
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = returnFocus;
    const position = { left: window.scrollX, top: window.scrollY };
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>('input[name="title"], select')
      ?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      window.scrollTo({ ...position, behavior: "instant" });
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    };
  }, [returnFocus]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const target = chapters.find((g) => g.id === chapter);
    if (!target) {
      setError("所在章节已不存在，请刷新目录后重试。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: String(data.get("title")).trim(),
        description: String(data.get("description")).trim(),
        chapter_id: target.id,
        learning_objectives: lines(data.get("learning_objectives")),
        related_topic_ids: relatedIds,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
      onKeyDown={(event) => {
        if (
          event.key !== "Tab" ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, input, textarea, select, [tabindex]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            element.getClientRects().length > 0,
        );
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === event.currentTarget)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/40"
    >
      <form
        onSubmit={submit}
        className="flex max-h-[calc(100dvh-2rem)] flex-col"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 id={headingId} className="text-lg font-bold text-slate-900">
            {topic ? "编辑知识点" : "新增知识点"}
          </h2>
          <button
            type="button"
            aria-label="关闭知识点编辑器"
            disabled={saving}
            onClick={onCancel}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-700 sm:col-span-2">
              知识点名称
              <input
                name="title"
                required
                maxLength={100}
                defaultValue={topic?.title}
                className={fieldClass}
              />
            </label>
            <RelatedTopicsPicker
              topicId={topic?.id}
              courseId={courseId}
              selected={relatedIds}
              initialTopics={topic?.related_topics ?? []}
              onChange={setRelatedIds}
            />
            <label className="text-sm text-slate-700 sm:col-span-2">
              学习目标（每行一项）
              <textarea
                name="learning_objectives"
                rows={3}
                defaultValue={topic?.learning_objectives.join("\n")}
                className={fieldClass}
              />
            </label>
          </fieldset>
        </div>
        <footer className="shrink-0 border-t border-slate-100 px-5 py-4 sm:px-6">
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className={actionClass}
            >
              取消
            </button>
            <button type="submit" disabled={saving} className={primaryClass}>
              {saving ? "正在保存…" : "保存编排"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
