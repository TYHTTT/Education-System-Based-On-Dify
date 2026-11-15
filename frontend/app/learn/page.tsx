"use client";

import Link from "next/link";
import HeroBand from "@/components/HeroBand";
import { ArrowRightIcon, BookIcon, GraphIcon, SparklesIcon, TargetIcon } from "@/components/Icons";
import { useCourseCatalog } from "@/components/CourseCatalogProvider";
import { COURSE_META } from "@/lib/types";

/** Pastel feature-card palette (DESIGN.md › card-feature-*), cycled per course. */
const TINTS = [
  { card: "bg-tint-lavender", mark: "bg-primary text-white" },
  { card: "bg-tint-peach", mark: "bg-brand-orange text-white" },
  { card: "bg-tint-mint", mark: "bg-brand-green text-white" },
  { card: "bg-tint-sky", mark: "bg-link text-white" },
  { card: "bg-tint-rose", mark: "bg-brand-pink-deep text-white" },
  { card: "bg-tint-yellow", mark: "bg-brand-brown text-white" },
];

export default function LearnHomePage() {
  const { courses, loading, error, reload } = useCourseCatalog();
  const totalTopics = courses.reduce(
    (sum, course) => sum + (course.topic_count ?? 0),
    0,
  );
  return (
    <div className="min-h-[calc(100svh-65px)] bg-canvas">
      <HeroBand
        eyebrow="Course Coach · 课程学习"
        title={<>让每一个知识点，<br />都成为你的底气。</>}
        subtitle="围绕知识点讲解、练习、评价与掌握度更新的学习闭环。AI 导师会根据你的掌握情况推荐下一步。"
        actions={
          <>
            <a href="#courses" className="btn-primary">
              浏览课程
            </a>
            <Link href="/?view=chat" className="btn-secondary-on-dark">
              自由问答
            </Link>
          </>
        }
      >
        <div className="mx-auto mt-12 max-w-4xl rounded-xl border border-hairline bg-canvas p-5 text-left text-ink shadow-mockup sm:mt-16 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-5">
            <span className="flex items-center gap-2 text-sm font-semibold"><BookIcon className="size-4 text-steel" />你的学习空间</span>
            <span className="text-[13px] text-steel">从理解到掌握，一步一步来</span>
          </div>
          <ol className="mt-5 grid gap-5 sm:grid-cols-3 sm:gap-6">
            {[
              { icon: BookIcon, title: "理解概念", description: "围绕知识点，获取清晰的讲解。", tint: "bg-tint-peach" },
              { icon: SparklesIcon, title: "练习与追问", description: "动手练习，把疑问当场弄明白。", tint: "bg-tint-lavender" },
              { icon: TargetIcon, title: "掌握与进阶", description: "结合学习反馈，找到下一步。", tint: "bg-tint-mint" },
            ].map(({ icon: Icon, title, description, tint }, index) => (
              <li key={title} className="flex items-start gap-3 sm:block">
                <span className={`grid size-10 shrink-0 place-items-center rounded-lg text-charcoal ${tint}`}><Icon className="size-5" /></span>
                <div>
                  <h2 className="text-base font-semibold sm:mt-4"><span className="mr-2 text-[12px] font-medium tabular-nums text-steel">0{index + 1}</span>{title}</h2>
                  <p className="mt-1.5 text-[13px] leading-6 text-steel">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </HeroBand>

      <div
        id="courses"
        className="mx-auto max-w-container scroll-mt-24 px-4 py-section sm:px-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Explore your courses</p>
            <h2 className="text-heading-3 text-ink sm:text-heading-2">
              全部课程
            </h2>
            <p className="mt-2 text-base text-steel">
              每门课程都按阶段组织知识点，可随时切换。
            </p>
          </div>
          {!loading && !error && courses.length > 0 && (
            <dl className="flex items-center gap-6 text-sm sm:gap-8">
              <div><dt className="text-[13px] text-steel">可选课程</dt><dd className="mt-1 text-heading-4 tabular-nums text-ink">{courses.length}<span className="ml-1.5 text-[13px] font-normal text-steel">门</span></dd></div>
              <div className="border-l border-hairline pl-6 sm:pl-8"><dt className="text-[13px] text-steel">知识点</dt><dd className="mt-1 text-heading-4 tabular-nums text-ink">{totalTopics}<span className="ml-1.5 text-[13px] font-normal text-steel">个</span></dd></div>
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
                  className={`card-tint group flex min-h-72 flex-col p-6 transition-shadow hover:shadow-card sm:p-8 ${tint.card}`}
                >
                  <div className="flex items-start justify-between gap-5">
                    <span
                      className={`grid size-12 place-items-center rounded-lg text-lg font-semibold ${tint.mark}`}
                    >
                      {COURSE_META[course.id]?.shortLabel ??
                        course.title.slice(0, 2)}
                    </span>
                    <span className="rounded-md bg-white/70 px-2 py-1 text-[12px] font-medium text-charcoal">
                      {course.topic_count ?? 0} 个知识点
                    </span>
                  </div>
                  <h3 className="mt-8 text-heading-4 text-ink">
                    {course.title}
                  </h3>
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

        <aside className="mt-section-sm grid items-center gap-6 rounded-xl bg-tint-yellow-bold p-6 sm:p-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-charcoal"><SparklesIcon className="size-4" />随时向 AI 导师提问</p>
            <h2 className="mt-3 text-heading-4 text-ink sm:text-heading-3">卡住的时候，让问题继续往前走。</h2>
            <p className="mt-3 text-sm leading-6 text-charcoal">换一种解释、补一个例子，或者一起拆解一道难题。</p>
          </div>
          <div className="flex flex-wrap gap-3 md:flex-col">
            <Link href="/?view=chat" className="btn-primary">开始提问<ArrowRightIcon className="size-4" /></Link>
            <Link href="/knowledge-graph" className="btn-ghost"><GraphIcon className="size-4" />探索知识图谱</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
