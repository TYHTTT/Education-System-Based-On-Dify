import MarkdownRenderer from "@/components/MarkdownRenderer";
import SourcePanel from "@/components/SourcePanel";
import { SparklesIcon } from "@/components/Icons";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <article
        aria-label="我的消息"
        className="ml-auto flex max-w-[90%] animate-fade-up flex-col items-end sm:max-w-[85%]"
      >
        <div className="rounded-xl bg-surface px-4 py-3 text-base leading-7 text-ink">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <time
          className="mt-1.5 px-1 text-[12px] text-stone"
          dateTime={message.createdAt}
        >
          {formatTime(message.createdAt)}
        </time>
      </article>
    );
  }

  return (
    <article
      aria-label="AI 回答"
      className="flex animate-fade-up items-start gap-3"
    >
      <div className="min-w-0 flex-1">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-charcoal">
              <span className="grid size-5 place-items-center rounded-md bg-primary text-white">
                <SparklesIcon className="size-3" />
              </span>
              Course Coach
            </span>
          </div>
          <MarkdownRenderer content={message.content} />
        </div>
        <div className="mt-1.5 flex items-center gap-2 px-1 text-[12px] text-stone">
          <time dateTime={message.createdAt}>
            {formatTime(message.createdAt)}
          </time>
        </div>

        {Boolean(message.sources?.length) && (
          <details className="group mt-3">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md bg-tint-lavender px-2.5 py-1 text-[13px] font-semibold text-brand-purple-800 transition hover:brightness-[0.97] [&::-webkit-details-marker]:hidden">
              查看 {message.sources?.length} 条资料来源
              <span
                className="ml-auto transition group-open:rotate-180"
                aria-hidden="true"
              >
                ⌄
              </span>
            </summary>
            <div className="mt-2">
              <SourcePanel sources={message.sources ?? []} compact />
            </div>
          </details>
        )}
      </div>
    </article>
  );
}
