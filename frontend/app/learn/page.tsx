"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@/components/Icons";
import { useCourseCatalog } from "@/components/CourseCatalogProvider";

/** Pastel feature-card palette (DESIGN.md › card-feature-*), cycled per course. */
const TINTS = [
  "bg-tint-lavender",
  "bg-tint-peach",
  "bg-tint-mint",
  "bg-tint-sky",
  "bg-tint-rose",
  "bg-tint-yellow",
];

export default function LearnHomePage() {
  const { courses, loading, error, reload } = useCourseCatalog();
  const totalTopics = courses.reduce(
    (sum, course) => sum + (course.topic_count ?? 0),
    0,
  );
  return (
    <div className="min-h-[calc(100svh-65px)] bg-canvas">
      <div id="courses" className="page-container">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-heading-3 text-ink sm:text-heading-2">
              全部课程
            </h1>
          </div>
          {!loading && !error && courses.length > 0 && (
            <dl className="flex items-center gap-6 text-sm sm:gap-8">
              <div>
                <dt className="text-[13px] text-steel">可选课程</dt>
                <dd className="mt-1 text-heading-4 tabular-nums text-ink">
                  {courses.length}
                  <span className="ml-1.5 text-[13px] font-normal text-steel">
                    门
                  </span>
                </dd>
              </div>
              <div className="border-l border-hairline pl-6 sm:pl-8">
                <dt className="text-[13px] text-steel">知识点</dt>
                <dd className="mt-1 text-heading-4 tabular-nums text-ink">
                  {totalTopics}
                  <span className="ml-1.5 text-[13px] font-normal text-steel">
                    个
                  </span>
                </dd>
              </div>
            </dl>
          )}
        </div>

        {loading ? (
          <p role="status" className="mt-8 text-sm text-steel">
            正在加载课程…
          </p>
        ) : error ? (
          <div
            role="alert"
            className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
          >
            <p>{error}</p>
            <button type="button" onClick={reload} className="btn-secondary">
              重试
            </button>
          </div>
        ) : courses.length ? (
          <section
            className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4"
            aria-label="选择课程"
          >
            {courses.map((course, index) => {
              const tint = TINTS[index % TINTS.length];
              return (
                <Link
                  key={course.id}
                  href={`/learn/${course.id}`}
                  className={`card-tint group flex min-h-72 flex-col p-6 transition-shadow hover:shadow-card sm:p-8 ${tint}`}
                >
                  <h2 className="text-heading-4 text-ink">
                    {course.title}
                  </h2>
                  <span className="mt-3 self-start rounded-md bg-white/70 px-2 py-1 text-[12px] font-medium text-charcoal">
                    {course.topic_count ?? 0} 个知识点
                  </span>
                  {course.description && (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-charcoal/80">
                      {course.description}
                    </p>
                  )}
                  <span className="mt-auto pt-6">
                    <span className="flex items-center justify-between gap-2 border-t border-charcoal/10 pt-4 text-sm font-medium text-ink">
                      查看学习路径
                      <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </span>
                </Link>
              );
            })}
          </section>
        ) : (
          <p className="mt-8 rounded-xl bg-surface p-section-sm text-center text-sm text-steel">
            暂无可学习的课程。
          </p>
        )}
      </div>
    </div>
  );
}
