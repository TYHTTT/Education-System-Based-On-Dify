"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/components/AdminProvider";

export default function AdminPreviewEntry() {
  const { beginPreview } = useAdmin();
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      beginPreview();
      router.replace("/learn");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [beginPreview, router]);
  return (
    <p role="status" className="page-container text-sm text-steel">
      正在打开学生端预览…
    </p>
  );
}
