"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useStudent } from "@/components/StudentProvider";
import MobileNavigation from "@/components/MobileNavigation";
import { useAdmin } from "@/components/AdminProvider";

const NAV_ITEMS = [
  { href: "/?view=chat", label: "自由问答" },
  { href: "/learn", label: "课程学习" },
  { href: "/knowledge-graph", label: "知识图谱" },
  { href: "/settings", label: "设置" },
];

export default function LearningShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { student, logout, isAdminPreview } = useStudent();
  const { endPreview } = useAdmin();
  const navigation = NAV_ITEMS.map((item) => ({
    ...item,
    active: item.href.startsWith("/?")
      ? pathname === "/"
      : item.href === "/learn"
        ? pathname.startsWith("/learn")
        : pathname === item.href,
  }));

  return (
    <main className="min-h-svh bg-canvas">
      <header className="app-header sticky top-0 z-30 h-[65px] border-b border-hairline backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-container items-center gap-4 px-4 sm:gap-8 sm:px-8">
          <nav
            className="hidden h-full min-w-0 items-stretch gap-5 lg:flex"
            aria-label="主导航"
          >
            {navigation.map((item) => {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  aria-label={item.label}
                  className={`segmented-tab h-full py-0 ${item.active ? "segmented-tab-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto hidden min-w-0 items-center justify-end gap-2 lg:flex">
            <Link
              href="/admin"
              onClick={isAdminPreview ? endPreview : undefined}
              className="btn-ghost text-steel hover:text-ink"
            >
              {isAdminPreview ? "返回管理后台" : "管理后台"}
            </Link>
            <Link
              href={isAdminPreview ? "/admin/account" : "/account"}
              aria-label={
                isAdminPreview ? "编辑管理员账号信息" : "编辑学生账号信息"
              }
              className="flex shrink-0 items-center justify-center p-2"
              title={isAdminPreview ? "管理员预览" : student?.username}
            >
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-tint-lavender text-xs font-semibold text-brand-purple-800"
              >
                {student?.display_name?.slice(0, 1) ?? "?"}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="btn-secondary px-3.5 py-2"
            >
              {isAdminPreview ? "退出预览" : "退出"}
            </button>
          </div>
          <Link
            href={isAdminPreview ? "/admin/account" : "/account"}
            aria-label={
              isAdminPreview ? "编辑管理员账号信息" : "编辑学生账号信息"
            }
            className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-tint-lavender text-xs font-semibold text-brand-purple-800 lg:hidden"
          >
            {student?.display_name?.slice(0, 1) ?? "?"}
          </Link>
          <MobileNavigation key={pathname} label="主导航" items={navigation}>
            <Link
              href={isAdminPreview ? "/admin/account" : "/account"}
              aria-label={
                isAdminPreview ? "编辑管理员账号信息" : "编辑学生账号信息"
              }
              className="inline-flex rounded-lg p-2"
            >
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-lavender text-xs font-semibold text-brand-purple-800"
              >
                {student?.display_name?.slice(0, 1) ?? "?"}
              </span>
            </Link>
            <Link
              href="/admin"
              onClick={isAdminPreview ? endPreview : undefined}
              className="btn-ghost"
            >
              {isAdminPreview ? "返回管理后台" : "管理后台"}
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="btn-secondary"
            >
              {isAdminPreview ? "退出预览" : "退出"}
            </button>
          </MobileNavigation>
        </div>
      </header>

      {children}
    </main>
  );
}
