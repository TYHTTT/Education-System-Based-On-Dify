"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  loginAdmin,
  loginStudent,
  registerAdmin,
  registerStudent,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { useStudent } from "@/components/StudentProvider";
import BrandMark from "@/components/BrandMark";

type Role = "student" | "admin";
const inputClass = "text-input mt-1.5";
const LOGIN_DOTS: Array<{ className: string; style: CSSProperties }> = [
  { className: "left-[4%] top-[20%] size-8", style: { background: "#f5d75e", "--r": "-8deg" } as CSSProperties },
  { className: "left-[10%] bottom-[14%] size-5", style: { background: "#ff64c8", "--r": "12deg" } as CSSProperties },
  { className: "left-[44%] top-[12%] size-3", style: { background: "#2a9d99" } as CSSProperties },
  { className: "right-[5%] top-[14%] size-6", style: { background: "#dd5b00", "--r": "10deg" } as CSSProperties },
  { className: "right-[3%] bottom-[20%] size-9", style: { background: "#d6b6f6", "--r": "-6deg" } as CSSProperties },
  { className: "left-[48%] bottom-[10%] size-4", style: { background: "#1aae39", "--r": "4deg" } as CSSProperties },
];

export default function LoginForm({
  initialRole = "student",
  error = "",
}: {
  initialRole?: Role;
  error?: string | null;
}) {
  const router = useRouter();
  const student = useStudent();
  const admin = useAdmin();
  const [role, setRole] = useState<Role>(initialRole);
  const [registering, setRegistering] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const isAdmin = role === "admin";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const credentials = {
      username: String(data.get("username") ?? ""),
      password: String(data.get("password") ?? ""),
    };
    if (registering && credentials.password !== data.get("confirm_password")) {
      setFormError("两次输入的密码不一致。");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const profile = {
        ...credentials,
        display_name: String(data.get("display_name") ?? ""),
      };
      if (isAdmin) {
        const account = registering
          ? await registerAdmin({
              ...profile,
              authcode: String(data.get("authcode") ?? ""),
            })
          : await loginAdmin(credentials);
        form.reset();
        admin.completeLogin(account);
        router.replace("/admin");
      } else {
        const account = registering
          ? await registerStudent(profile)
          : await loginStudent(credentials);
        form.reset();
        student.completeLogin(account);
        if (initialRole === "admin") router.replace("/learn");
      }
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "暂时无法完成登录，请稍后重试。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function selectRole(next: Role) {
    setRole(next);
    setRegistering(false);
    setFormError("");
  }

  return (
    <main className="hero-band flex min-h-svh flex-col">
      {LOGIN_DOTS.map((dot, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`hero-dot hidden md:block ${dot.className}`}
          style={dot.style}
        />
      ))}
      <div className="mx-auto flex h-16 w-full max-w-container items-center px-4 sm:px-8">
        <BrandMark onDark />
      </div>
      <div className="mx-auto grid w-full max-w-container flex-1 items-center gap-12 px-4 pb-section pt-6 sm:px-8 lg:grid-cols-[1.1fr_minmax(0,440px)] lg:gap-16">
        <div className="text-center lg:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[1px] text-white/60">
            Course Coach · 课程问答助手
          </p>
          <p className="mt-4 text-[36px] font-semibold leading-[1.2] tracking-[-0.5px] text-white max-[359px]:text-[32px] sm:text-display-lg lg:text-[48px] xl:text-[64px] lg:leading-[1.15] lg:tracking-[-1.5px]">
            <span className="block">你的 AI 课程导师，</span>
            <span className="block">随时在线。</span>
          </p>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/70 sm:text-subtitle lg:mx-0">
            讲解、练习、评价与掌握度追踪，围绕每一个知识点形成完整的学习闭环。
          </p>
          <ul className="mt-8 hidden flex-wrap gap-2 lg:flex">
            {["知识点讲解", "分层练习", "掌握度追踪", "知识图谱"].map((item) => (
              <li
                key={item}
                className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[13px] font-medium text-white/80"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      <section
        aria-label="账户登录"
        className="mx-auto w-full max-w-md rounded-xl border border-hairline bg-canvas p-6 text-ink shadow-mockup sm:p-8"
      >
        <div
          role="group"
          aria-label="登录身份"
          className="flex gap-2"
        >
          {(["student", "admin"] as const).map((item) => (
            <button
              key={item}
              type="button"
              disabled={submitting}
              aria-pressed={role === item}
              onClick={() => selectRole(item)}
              className={`pill-tab ${role === item ? "pill-tab-active" : ""}`}
            >
              {item === "student" ? "学生" : "管理员"}
            </button>
          ))}
        </div>
        <h1 className="mt-7 text-heading-3 text-ink">
          {isAdmin
            ? registering
              ? "创建管理员"
              : "管理员登录"
            : registering
              ? "创建学习账户"
              : "登录学习空间"}
        </h1>
        <form
          key={`${role}:${registering}`}
          aria-label={
            isAdmin
              ? registering
                ? "创建管理员"
                : "管理员登录"
              : registering
                ? "创建学习账户"
                : "学生登录"
          }
          className="mt-6 space-y-4"
          onSubmit={submit}
        >
          <fieldset disabled={submitting} className="space-y-4">
            {registering && (
              <label className="block text-sm font-medium text-slate-700">
                姓名
                <input
                  required
                  name="display_name"
                  autoComplete="name"
                  maxLength={64}
                  className={inputClass}
                />
              </label>
            )}
            <label className="block text-sm font-medium text-slate-700">
              用户名
              <input
                required
                name="username"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_.-]+"
                autoComplete="username"
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              密码
              <input
                required
                name="password"
                type="password"
                minLength={registering ? 8 : 1}
                maxLength={128}
                autoComplete={registering ? "new-password" : "current-password"}
                className={inputClass}
              />
            </label>
            {registering && (
              <label className="block text-sm font-medium text-slate-700">
                确认密码
                <input
                  required
                  name="confirm_password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </label>
            )}
            {isAdmin && registering && (
              <label className="block text-sm font-medium text-slate-700">
                Authcode
                <input
                  required
                  name="authcode"
                  type="password"
                  maxLength={512}
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                />
                <span className="mt-1.5 block text-xs font-normal text-slate-500">
                  请输入管理员创建授权码。
                </span>
              </label>
            )}
          </fieldset>
          {(formError || error) && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              {formError || error}
            </p>
          )}
          <button
            disabled={submitting}
            type="submit"
            className="btn-primary h-11 w-full disabled:cursor-wait"
          >
            {submitting
              ? "正在处理…"
              : registering
                ? isAdmin
                  ? "创建并登录管理后台"
                  : "创建并登录"
                : isAdmin
                  ? "登录管理后台"
                  : "登录"}
          </button>
        </form>
        <button
          disabled={submitting}
          type="button"
          onClick={() => {
            setRegistering((value) => !value);
            setFormError("");
          }}
          className="link mt-5 text-sm disabled:opacity-60"
        >
          {registering
            ? "已有账户？登录"
            : isAdmin
              ? "创建管理员"
              : "没有账户？创建账户"}
        </button>
      </section>
      </div>
    </main>
  );
}
