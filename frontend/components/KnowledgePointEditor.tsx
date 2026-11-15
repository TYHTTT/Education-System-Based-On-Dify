"use client";

import { useState, useRef, useEffect, useId, type FormEvent } from "react";
import type {
  ManagedTopic,
  TopicGroup,
  TopicValues,
  TopicBatchValues,
} from "@/lib/topic-management";
import RelatedTopicsPicker from "@/components/RelatedTopicsPicker";
import CreationModeSwitch from "@/components/CreationModeSwitch";
import { parseBatchNames, splitNames } from "@/lib/batch-names";

export const fieldClass = "form-field mt-1.5";
export const actionClass = "btn-secondary";
export const primaryClass = "btn-primary";
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
  onBatchSave,
  onCancel,
}: {
  topic: ManagedTopic | null;
  groups: TopicGroup[];
  courseId: string;
  returnFocus: HTMLElement;
  onSave: (values: TopicValues) => Promise<void>;
  onBatchSave: (values: TopicBatchValues) => Promise<void>;
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
  const [bulk, setBulk] = useState(false);
  const [title, setTitle] = useState(topic?.title ?? "");
  const [batchText, setBatchText] = useState("");
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
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[name="title"], [name="batch_titles"]')
      ?.focus({ preventScroll: true });
  }, [bulk]);
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
      if (bulk && !topic) {
        await onBatchSave({
          chapter_id: target.id,
          titles: parseBatchNames(batchText, "知识点"),
        });
      } else {
        await onSave({
          title: String(data.get("title")).trim(),
          description: String(
            data.get("description") ?? topic?.description ?? "",
          ).trim(),
          chapter_id: target.id,
          learning_objectives: lines(data.get("learning_objectives")),
          related_topic_ids: relatedIds,
        });
      }
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
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <h2 id={headingId} className="text-heading-4 text-ink">
            {topic ? "编辑知识点" : "新增知识点"}
          </h2>
          <button
            type="button"
            aria-label="关闭知识点编辑器"
            disabled={saving}
            onClick={onCancel}
            className="btn-ghost size-11 shrink-0 p-0 text-xl text-steel"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
          <fieldset disabled={saving} className="grid gap-6 sm:grid-cols-2">
            {!topic && (
              <div className="sm:col-span-2">
                <CreationModeSwitch
                  bulk={bulk}
                  disabled={saving}
                  onChange={(value) => {
                    setBulk(value);
                    setError("");
                  }}
                />
              </div>
            )}
            {bulk && !topic && (
              <label className="text-sm text-slate-700 sm:col-span-2">
                知识点名称（每行一个）
                <textarea
                  name="batch_titles"
                  required
                  rows={8}
                  maxLength={20200}
                  value={batchText}
                  onChange={(event) => setBatchText(event.target.value)}
                  placeholder={"例如：\n线性回归\n逻辑回归\n决策树"}
                  className={`${fieldClass} resize-y`}
                />
                <span className="mt-2 block text-xs text-slate-500">
                  添加到“{initial?.title}”，共 {splitNames(batchText).length}{" "}
                  个知识点，空行自动忽略，每次最多 200 个。
                </span>
              </label>
            )}
            <fieldset
              disabled={saving || (bulk && !topic)}
              className={bulk && !topic ? "hidden" : "contents"}
            >
              <label className="text-sm text-slate-700 sm:col-span-2">
                知识点名称
                <input
                  name="title"
                  required
                  maxLength={100}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
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
          </fieldset>
        </div>
        <footer className="shrink-0 border-t border-hairline bg-surface-soft px-5 py-4 sm:px-6">
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
              {saving
                ? "正在保存…"
                : bulk && !topic
                  ? "批量创建知识点"
                  : "保存编排"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
