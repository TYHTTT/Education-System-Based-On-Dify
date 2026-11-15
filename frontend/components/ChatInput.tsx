"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpIcon } from "@/components/Icons";

const MAX_LENGTH = 6000;

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  onStop?: () => void;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  isLoading = false,
  onStop,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const normalized = value.trim();
    if (!normalized || disabled) return;
    onSend(normalized);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-xl border border-hairline-strong bg-canvas p-2 shadow-sm transition focus-within:border-primary focus-within:shadow-[0_0_0_1px_#5645d4]">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
            }}
            onKeyDown={handleKeyDown}
            maxLength={MAX_LENGTH}
            rows={2}
            disabled={disabled}
            placeholder={placeholder ?? "输入你的问题…"}
            aria-label="你的问题"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base leading-6 text-ink outline-none placeholder:text-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={isLoading ? onStop : submit}
            disabled={!isLoading && (disabled || !value.trim())}
            className="mb-1 grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-white transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted"
            aria-label={isLoading ? "停止生成" : "发送问题"}
          >
            {isLoading ? (
              <span className="size-3 rounded-sm bg-current" />
            ) : (
              <ArrowUpIcon className="size-5" />
            )}
          </button>
        </div>
        <div className="flex items-center justify-between px-3 pb-1 pt-1 text-[12px] text-stone">
          <span>Enter 发送 · Shift + Enter 换行</span>
          {value.length > MAX_LENGTH * 0.8 && (
            <span>
              {value.length}/{MAX_LENGTH}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
