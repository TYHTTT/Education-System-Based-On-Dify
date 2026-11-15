import type { Metadata } from "next";
import LearningShell from "@/components/LearningShell";
import CourseLayout from "@/components/CourseLayout";
import CourseCatalogProvider from "@/components/CourseCatalogProvider";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "课程学习",
  description: "课程列表、章节目录与知识点学习",
};

export default function LearnLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <LearningShell>
      <CourseCatalogProvider>
        <Suspense
          fallback={
            <div className="p-8" role="status">
              正在准备课程目录…
            </div>
          }
        >
          <CourseLayout>{children}</CourseLayout>
        </Suspense>
      </CourseCatalogProvider>
    </LearningShell>
  );
}
