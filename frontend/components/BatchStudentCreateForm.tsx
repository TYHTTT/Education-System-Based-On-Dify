"use client";

import { useState, type FormEvent } from "react";
import { useAdmin } from "@/components/AdminProvider";
import { ApiError, createStudentAccount } from "@/lib/api";
import { parseStudentBatch } from "@/lib/student-batch";

interface RowResult {
  line: number;
  username: string;
  success: boolean;
  message: string;
}

export default function BatchStudentCreateForm({
  disabled,
  onSubmittingChange,
}: {
  disabled: boolean;
  onSubmittingChange: (pending: boolean) => void;
}) {
  const { withAdmin } = useAdmin();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const busy = disabled || submitting;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = parseStudentBatch(input);
    setErrors(parsed.errors);
    setResults([]);
    if (parsed.errors.length) return;

    setSubmitting(true);
    onSubmittingChange(true);
    setProgress({ completed: 0, total: parsed.students.length });
    const completed: RowResult[] = [];
    const remaining = new Set(parsed.students);
    try {
      for (const row of parsed.students) {
        try {
          await withAdmin((token) => createStudentAccount(token, row.payload));
          remaining.delete(row);
          completed.push({
            line: row.line,
            username: row.payload.username,
            success: true,
            message: "创建成功",
          });
        } catch (cause) {
          completed.push({
            line: row.line,
            username: row.payload.username,
            success: false,
            message:
              cause instanceof Error ? cause.message : "创建失败，请稍后重试。",
          });
          if (
            cause instanceof ApiError &&
            (cause.status === 401 || cause.status === 0)
          )
            break;
        }
        setProgress({
          completed: completed.length,
          total: parsed.students.length,
        });
      }
      setResults(completed);
      setInput([...remaining].map((row) => row.source).join("\n"));
    } finally {
      setSubmitting(false);
      onSubmittingChange(false);
    }
  }

  const succeeded = results.filter((row) => row.success).length;
  const failed = results.length - succeeded;
  const unprocessed = progress.total - results.length;

  return (
    <div className="card min-w-0">
      <h2 className="text-heading-4 text-ink">批量创建学生账号</h2>
      <p
        id="batch-student-format"
        className="mt-3 text-sm leading-6 text-steel"
      >
        每行代表一名学生，格式为：
        <span className="font-medium text-ink">学生姓名,用户名,密码</span>。
        请使用<strong className="font-semibold text-ink">英文逗号（,）</strong>
        分隔，不要使用中文逗号（，），无需填写方括号。
      </p>
      <form
        aria-label="批量创建学生账号"
        aria-busy={submitting}
        onSubmit={submit}
        className="mt-6 space-y-5"
      >
        <fieldset disabled={busy} className="space-y-5">
          <label className="block text-sm font-medium text-ink">
            学生信息（每行一名）
            <textarea
              name="students"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={12}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="batch-student-format batch-student-rules"
              placeholder={
                "张三,student_001,InitialPass123\n李四,student_002,InitialPass456"
              }
              className="text-input mt-1.5 min-h-64 resize-y font-mono text-sm leading-6"
            />
          </label>
          <p id="batch-student-rules" className="text-xs leading-6 text-steel">
            姓名 1–64 个字符；用户名 3–32
            位，可使用英文字母、数字、下划线、点或连字符；密码 8–128
            个字符。字段中不要包含英文逗号。空行会自动忽略。
          </p>
        </fieldset>
        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 p-4 text-sm leading-6 text-rose-700"
          >
            <p>请修正以下问题后再提交，尚未创建任何账号：</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        {submitting && (
          <p role="status" className="text-sm text-steel">
            正在创建：{progress.completed} / {progress.total}
          </p>
        )}
        {results.length > 0 && (
          <div className="rounded-lg bg-surface p-4 text-sm leading-6">
            <p role="status" className="font-medium text-ink">
              本次创建成功 {succeeded} 个，失败 {failed} 个
              {unprocessed > 0 ? `，未处理 ${unprocessed} 个` : ""}。
            </p>
            <ul
              aria-label="批量创建结果"
              className="mt-3 max-h-64 space-y-2 overflow-y-auto"
            >
              {results.map((row) => (
                <li
                  key={row.line}
                  className={`break-words ${row.success ? "text-emerald-800" : "text-rose-700"}`}
                >
                  第 {row.line} 行 · {row.username}：{row.message}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-steel">
              {failed > 0 || unprocessed > 0
                ? "输入框仅保留失败或未处理的行，修正或确认账号状态后可再次提交。"
                : "请将用户名和对应的初始密码告知学生。"}
            </p>
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full sm:w-auto"
        >
          {submitting ? "正在批量创建…" : "批量创建账号"}
        </button>
      </form>
    </div>
  );
}
