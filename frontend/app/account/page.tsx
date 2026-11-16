"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LearningShell from "@/components/LearningShell";
import { useStudent } from "@/components/StudentProvider";
import {
  AccountPasswordForm,
  AccountProfileForm,
} from "@/components/AccountForms";
import { getCurrentStudent, updateStudentProfile } from "@/lib/api";
import type { AuthenticatedStudent } from "@/lib/types";

export default function StudentAccountPage() {
  const { isAdminPreview } = useStudent();
  return (
    <LearningShell>
      {isAdminPreview ? (
        <section className="page-container">
          <h1 className="text-heading-3 text-ink">账号信息</h1>
          <p className="my-5 text-sm text-steel">
            当前处于管理员预览，请前往管理员账号信息页面修改个人资料。
          </p>
          <Link href="/admin/account" className="btn-primary">
            管理管理员账号信息
          </Link>
        </section>
      ) : (
        <StudentAccountDetails />
      )}
    </LearningShell>
  );
}

function StudentAccountDetails() {
  const { withStudent, updateProfile, changePassword } = useStudent();
  const [profile, setProfile] = useState<Omit<
    AuthenticatedStudent,
    "access_token"
  > | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        const result = await withStudent((token) =>
          getCurrentStudent(token, controller.signal),
        );
        if (!controller.signal.aborted) {
          setProfile(result);
          updateProfile(result);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "账号信息加载失败。",
          );
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [withStudent, updateProfile, version]);
  async function save(values: { username: string; display_name: string }) {
    const result = await withStudent((token) =>
      updateStudentProfile(token, values),
    );
    setProfile(result);
    updateProfile(result);
  }
  return (
    <section className="page-container">
      <h1 className="text-heading-3 text-ink sm:text-heading-2">账号信息</h1>
      <p className="mt-3 text-sm text-steel">
        查看和修改自己的基本信息与登录密码。
      </p>
      {error ? (
        <div role="alert" className="card mt-8 text-sm text-rose-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setVersion((value) => value + 1)}
            className="mt-3 underline"
          >
            重试
          </button>
        </div>
      ) : !profile ? (
        <p role="status" className="mt-8 text-sm text-steel">
          正在加载账号信息…
        </p>
      ) : (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <section className="card min-w-0">
            <h2 className="text-heading-4 text-ink">基本信息</h2>
            <p className="mt-3 text-xs text-steel">
              学生 · 创建于{" "}
              {new Date(profile.created_at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </p>
            <AccountProfileForm profile={profile} onSave={save} />
          </section>
          <section className="card min-w-0">
            <h2 className="text-heading-4 text-ink">修改密码</h2>
            <AccountPasswordForm role="student" onSave={changePassword} />
          </section>
        </div>
      )}
    </section>
  );
}
