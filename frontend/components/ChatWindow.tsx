"use client";

import { useEffect, useRef } from "react";
import ChatMessage from "@/components/ChatMessage";
import { SparklesIcon } from "@/components/Icons";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

const EXAMPLE_TINTS = [
  "bg-tint-peach",
  "bg-tint-rose",
  "bg-tint-mint",
  "bg-tint-sky",
];

interface ChatWindowProps {
  messages: ChatMessageType[];
  examples: { title: string; question: string }[];
  isLoading: boolean;
  onExample: (question: string) => void;
}

function ThinkingIndicator() {
  return (
    <div
      className="flex animate-fade-up items-start gap-3"
      role="status"
      aria-label="正在整理回答"
    >
      <div className="mt-0.5 hidden size-8 shrink-0 place-items-center rounded-lg bg-primary text-white sm:grid">
        <SparklesIcon className="size-4" />
      </div>
      <div className="rounded-xl border border-hairline bg-canvas px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="size-1.5 animate-pulse-dot rounded-full bg-indigo-500"
                style={{ animationDelay: `${index * 150}ms` }}
              />
            ))}
          </div>
          <span className="text-sm text-slate-500">正在思考你的问题…</span>
        </div>
      </div>
    </div>
  );
}

export default function ChatWindow({
  messages,
  examples,
  isLoading,
  onExample,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center px-5 py-10 sm:px-8 sm:py-section">
        <div className="w-full max-w-3xl animate-fade-up text-center">
          <h2 className="text-heading-5 text-ink">示例问题</h2>
          <div className="mt-5 grid gap-4 text-left sm:grid-cols-2">
            {examples.map(({ title, question }, index) => (
              <button
                key={question}
                type="button"
                onClick={() => onExample(question)}
                className={`card-tint group flex flex-col p-6 text-left transition-shadow hover:shadow-card ${EXAMPLE_TINTS[index % EXAMPLE_TINTS.length]}`}
              >
                <span className="text-[13px] font-semibold text-charcoal/70">
                  {title}
                </span>
                <span className="mt-2 flex items-start justify-between gap-3 text-base font-medium leading-6 text-ink">
                  {question}
                  <span
                    className="shrink-0 text-charcoal/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-8 px-4 py-7 sm:px-6 sm:py-9"
      aria-live="polite"
    >
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
      {isLoading && <ThinkingIndicator />}
      <div ref={bottomRef} className="h-px" />
    </div>
  );
}
