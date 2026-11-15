"use client";

import LearningShell from "@/components/LearningShell";
import { useTheme } from "@/components/ThemeProvider";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  return (
    <LearningShell>
      <section className="mx-auto max-w-3xl px-4 py-section sm:px-8">
        <div className="border-b border-hairline pb-8">
          <p className="eyebrow">Preferences</p>
          <h1 className="mt-2 text-heading-2 text-ink">设置</h1>
          <p className="mt-3 text-base text-steel">
            调整 Course Coach 的显示偏好。
          </p>
        </div>

        <div className="card mt-8">
          <h2 className="text-heading-5 text-ink">外观</h2>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-charcoal">界面主题</p>
              <p className="mt-1 text-sm text-steel">
                选择浅色或深色显示模式。
              </p>
            </div>
            <div
              className="inline-flex shrink-0 gap-2"
              role="group"
              aria-label="界面主题"
            >
              {(["light", "dark"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  aria-pressed={theme === option}
                  className={`pill-tab ${theme === option ? "pill-tab-active" : ""}`}
                >
                  {option === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 rounded-lg bg-surface px-4 py-3 text-sm text-steel">
          AI 辅导由 Dify Agent 提供，课程资料由 Dify 统一管理。
        </p>
      </section>
    </LearningShell>
  );
}
