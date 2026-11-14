"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import CreationModeSwitch from "@/components/CreationModeSwitch";
import { parseBatchNames, splitNames } from "@/lib/batch-names";
import {
  actionClass,
  fieldClass,
  primaryClass,
} from "@/components/KnowledgePointEditor";

export default function CreateChapterDialog({
  returnFocus,
  onSave,
  onCancel,
}: {
  returnFocus: HTMLElement;
  onSave: (titles: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [bulk, setBulk] = useState(false);
  const [title, setTitle] = useState("");
  const [batchText, setBatchText] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const position = { left: scrollX, top: scrollY };
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0)
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector("input")?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      window.scrollTo({ ...position, behavior: "instant" });
      requestAnimationFrame(() => {
        if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      });
    };
  }, [returnFocus]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[name="chapter_title"]')?.focus({ preventScroll: true });
  }, [bulk]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(parseBatchNames(bulk ? batchText : title, "章节"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "新增章节失败，请重试。",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/40"
    >
      <h2 id={heading} className="text-lg font-bold text-slate-900">
        新增章节
      </h2>
      <form onSubmit={submit} className="mt-5">
        <CreationModeSwitch bulk={bulk} disabled={saving} onChange={(value) => { setBulk(value); setError(""); }} />
        <label className="mt-4 block text-sm text-slate-700">
          {bulk ? "章节名称（每行一个）" : "章节名称"}
          {bulk ? (
            <textarea
              name="chapter_title"
              required
              rows={8}
              maxLength={20200}
              disabled={saving}
              value={batchText}
              onChange={(event) => setBatchText(event.target.value)}
              placeholder={"第一章 绪论\n第二章 基本概念\n第三章 应用"}
              className={`${fieldClass} resize-y`}
            />
          ) : (
            <input
              name="chapter_title"
              required
              maxLength={100}
              disabled={saving}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={fieldClass}
            />
          )}
        </label>
        {bulk && <p className="mt-2 text-xs text-slate-500">共 {splitNames(batchText).length} 个章节，空行自动忽略，每次最多 200 个。</p>}
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className={actionClass}
          >
            取消
          </button>
          <button type="submit" disabled={saving} className={primaryClass}>
            {saving ? "正在创建…" : bulk ? "批量创建章节" : "创建章节"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
