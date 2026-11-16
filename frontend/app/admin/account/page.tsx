"use client";

import { useAdmin } from "@/components/AdminProvider";
import { AccountProfileForm } from "@/components/AccountForms";
import ChangeAdminPassword from "@/components/ChangeAdminPassword";
import DeleteAdminAccount from "@/components/DeleteAdminAccount";
import { updateAdminProfile } from "@/lib/api";

export default function AdminAccountPage() {
  const { admin, withAdmin, updateProfile } = useAdmin();
  if (!admin) return null;
  async function save(values: { username: string; display_name: string }) {
    const result = await withAdmin((token) =>
      updateAdminProfile(token, values),
    );
    updateProfile(result);
  }
  return (
    <section className="page-container">
      <h1 className="text-heading-3 text-ink sm:text-heading-2">账号信息</h1>
      <p className="mt-3 text-sm text-steel">
        管理当前管理员的基本信息、密码和账号。
      </p>
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <section className="card min-w-0">
          <h2 className="text-heading-4 text-ink">基本信息</h2>
          <p className="mt-3 text-xs text-steel">
            管理员 · 创建于{" "}
            {new Date(admin.created_at).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
            })}
          </p>
          <AccountProfileForm profile={admin} onSave={save} />
        </section>
        <section className="card min-w-0">
          <h2 className="text-heading-4 text-ink">修改密码</h2>
          <ChangeAdminPassword />
        </section>
      </div>
      <section className="card mt-6 border-rose-200">
        <h2 className="text-heading-4 text-ink">删除账号</h2>
        <p className="mb-5 mt-3 text-sm leading-6 text-steel">
          永久删除当前管理员账号并退出登录，此操作无法恢复。
        </p>
        <DeleteAdminAccount />
      </section>
    </section>
  );
}
