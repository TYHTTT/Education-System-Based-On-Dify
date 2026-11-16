"use client";

import { AccountPasswordForm } from "@/components/AccountForms";
import { useAdmin } from "@/components/AdminProvider";

export default function ChangeAdminPassword() {
  const { changePassword } = useAdmin();
  return <AccountPasswordForm role="admin" onSave={changePassword} />;
}
