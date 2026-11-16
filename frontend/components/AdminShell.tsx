"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAdmin } from "@/components/AdminProvider";
import MobileNavigation from "@/components/MobileNavigation";

export default function AdminShell({ children }: { children: ReactNode }) {
  const { logout } = useAdmin();
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  const navigation = [
    { href: "/admin", label: "概览" },
    { href: "/admin/courses", label: "课程管理" },
    { href: "/admin/knowledge-graph", label: "知识图谱" },
    { href: "/admin/dashboard", label: "用量仪表盘" },
    { href: "/admin/keys", label: "密钥管理" },
  ].map((item) => ({
    ...item,
    active:
      pathname === item.href ||
      (item.href !== "/admin" && pathname.startsWith(item.href + "/")) ||
      (item.href === "/admin/dashboard" &&
        pathname.startsWith("/admin/call-logs/")),
  }));
  async function signOut() {
    setLeaving(true);
    try {
      await logout();
    } catch {
      /* The local session has been cleared. */
    } finally {
      setLeaving(false);
    }
  }
  return (
    <main className="min-h-svh bg-canvas">
      <header className="app-header sticky top-0 z-30 h-[65px] border-b border-hairline backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-container items-center gap-4 px-4 sm:gap-8 sm:px-8">
          <span className="tag-purple shrink-0">管理后台</span>
          <nav
            aria-label="后台导航"
            className="hidden h-full items-stretch gap-5 lg:flex"
          >
            {navigation.map((item) => {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`segmented-tab h-full py-0 ${item.active ? "segmented-tab-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto hidden h-16 items-center gap-2 text-sm lg:flex">
            <Link href="/learn" className="btn-ghost text-steel hover:text-ink">
              学生端
            </Link>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void signOut()}
              className="btn-secondary px-3.5 py-2"
            >
              {leaving ? "正在退出…" : "退出管理后台"}
            </button>
          </div>
          <MobileNavigation key={pathname} label="后台导航" items={navigation}>
            <Link href="/learn" className="btn-ghost">
              学生端
            </Link>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void signOut()}
              className="btn-secondary"
            >
              {leaving ? "正在退出…" : "退出管理后台"}
            </button>
          </MobileNavigation>
        </div>
      </header>
      {children}
    </main>
  );
}
