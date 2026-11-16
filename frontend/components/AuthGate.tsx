"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAdmin } from "@/components/AdminProvider";
import LoginForm from "@/components/LoginForm";
import { useStudent } from "@/components/StudentProvider";
import AdminStudentPreview from "@/components/AdminStudentPreview";

export default function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname === "/admin" || pathname.startsWith("/admin/") ? (
    <AdminGate>{children}</AdminGate>
  ) : (
    <StudentGate>{children}</StudentGate>
  );
}

function StudentGate({ children }: { children: ReactNode }) {
  const { status, error } = useStudent();
  const admin = useAdmin();
  if (admin.status === "initializing")
    return (
      <main className="grid min-h-svh place-items-center text-sm text-steel">
        正在恢复登录状态…
      </main>
    );
  if (admin.previewing)
    return (
      <AdminGate>
        <AdminStudentPreview key={admin.admin?.admin_id}>
          {children}
        </AdminStudentPreview>
      </AdminGate>
    );
  if (status === "ready") return <>{children}</>;
  if (status === "initializing")
    return (
      <main className="grid min-h-svh place-items-center bg-canvas text-sm text-slate-500">
        正在恢复登录状态...
      </main>
    );
  return <LoginForm error={error} />;
}

function AdminGate({ children }: { children: ReactNode }) {
  const { status, error, retry } = useAdmin();
  if (status === "ready") return <>{children}</>;
  if (status === "initializing")
    return (
      <main className="grid min-h-svh place-items-center bg-canvas text-sm text-slate-500">
        正在验证管理员身份…
      </main>
    );
  if (status !== "error")
    return <LoginForm initialRole="admin" error={error} />;
  return (
    <main className="grid min-h-svh place-items-center bg-canvas p-6">
      <section className="card-feature w-full max-w-md">
        <h1 className="text-xl font-semibold text-slate-900">
          管理员身份暂时无法验证
        </h1>
        <p role="alert" className="mt-3 text-sm text-slate-600">
          {error}
        </p>
        <button type="button" onClick={retry} className="btn-primary mt-6">
          重试
        </button>
      </section>
    </main>
  );
}
