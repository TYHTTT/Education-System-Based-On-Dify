"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/components/AdminProvider";
import { CourseEditor } from "@/components/AdminCourseForms";
import { createCourse } from "@/lib/api";
import type { CourseInput } from "@/lib/types";

export default function NewCoursePage() {
  const { withAdmin } = useAdmin();
  const router = useRouter();
  async function save(values: CourseInput) {
    await withAdmin((token) => createCourse(token, values));
    router.replace("/admin/courses");
  }
  return (
    <section className="page-container">
      <Link href="/admin/courses" className="link text-sm">
        ← 返回课程管理
      </Link>
      <h1 className="mt-5 text-heading-3 text-ink sm:text-heading-2">
        新增课程
      </h1>
      <CourseEditor
        course={null}
        onSave={save}
        onCancel={() => router.push("/admin/courses")}
      />
    </section>
  );
}
