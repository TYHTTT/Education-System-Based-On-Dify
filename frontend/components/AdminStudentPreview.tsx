"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/components/AdminProvider";
import {
  StudentContext,
  type StudentContextValue,
} from "@/components/StudentProvider";
import { ApiError, getCurrentStudent } from "@/lib/api";

export default function AdminStudentPreview({
  children,
}: {
  children: ReactNode;
}) {
  const { withAdmin, endPreview } = useAdmin();
  const router = useRouter();
  const [student, setStudent] = useState<StudentContextValue["student"]>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const withStudent = useCallback(
    async <T,>(action: (token: string) => Promise<T>) => {
      try {
        return await withAdmin((token) => action(`admin-preview:${token}`));
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401)
          router.replace("/admin");
        throw cause;
      }
    },
    [withAdmin, router],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        const profile = await withStudent((token) =>
          getCurrentStudent(token, controller.signal),
        );
        if (!controller.signal.aborted) setStudent(profile);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "暂时无法打开学生端预览。",
          );
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [withStudent, version]);
  const logout = useCallback(async () => {
    endPreview();
    router.replace("/admin");
  }, [endPreview, router]);
  const value = useMemo<StudentContextValue>(
    () => ({
      isAdminPreview: true,
      studentId: student?.student_id ?? null,
      student,
      status: student ? "ready" : "initializing",
      error: null,
      withStudent,
      completeLogin: () => {
        /* Preview uses the administrator session. */
      },
      updateProfile: () => {
        throw new Error("请前往管理员账号信息页面修改资料。");
      },
      changePassword: async () => {
        throw new Error("请前往管理员账号信息页面修改密码。");
      },
      logout,
    }),
    [student, withStudent, logout],
  );
  if (error)
    return (
      <main className="grid min-h-svh place-items-center bg-canvas p-6">
        <section className="card max-w-md">
          <h1 className="text-heading-4 text-ink">暂时无法打开学生端预览</h1>
          <p role="alert" className="mt-3 text-sm text-steel">
            {error}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setError("");
                setVersion((value) => value + 1);
              }}
              className="btn-secondary"
            >
              重试
            </button>
            <Link href="/admin" onClick={endPreview} className="btn-secondary">
              返回管理后台
            </Link>
          </div>
        </section>
      </main>
    );
  if (!student)
    return (
      <main
        role="status"
        className="grid min-h-svh place-items-center text-sm text-steel"
      >
        正在进入管理员预览…
      </main>
    );
  return (
    <StudentContext.Provider value={value}>{children}</StudentContext.Provider>
  );
}
