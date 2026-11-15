"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChartIcon,
  LayersIcon,
  TargetIcon,
} from "@/components/Icons";
import { LoadingBlock, MasteryBar, TopicStatusBadge } from "@/components/LearningWidgets";
import { useCourseCatalog } from "@/components/CourseCatalogProvider";
import { useStudent } from "@/components/StudentProvider";
import { getCurriculum, getLearningDashboard } from "@/lib/api";
import { hasValidTopicEvidence, nextActionLabel } from "@/lib/learning";
import {
  type Course,
  type CurriculumResponse,
  type CurriculumTopicSummary,
  type LearningDashboard,
} from "@/lib/types";

function visibleMastery(topic: CurriculumTopicSummary): number | null {
  return hasValidTopicEvidence(topic) ? topic.mastery : null;
}

function TopicCard({ topic, course }: { topic: CurriculumTopicSummary; course: Course }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface text-[13px] font-semibold tabular-nums text-steel">
          {topic.order_index ?? "·"}
        </span>
        <TopicStatusBadge status={topic.status} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink">{topic.title}</h3>
      {topic.description && <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-steel">{topic.description}</p>}
      <div className="mt-4">
        <MasteryBar value={visibleMastery(topic)} compact />
      </div>
    </>
  );

  return (
    <Link
      href={`/learn/${course}/${encodeURIComponent(topic.id)}`}
      className="group rounded-xl border border-hairline bg-canvas p-5 transition hover:border-hairline-strong hover:shadow-card"
    >
      {content}
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-link">
        进入知识点 <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export default function CourseDashboardPage() {
  const params = useParams<{ course: string }>();
  const rawCourse = Array.isArray(params.course) ? params.course[0] : params.course;
  const catalog = useCourseCatalog();
  const courseRecord = catalog.courses.find((item) => item.id === rawCourse);
  const course = courseRecord?.id ?? null;
  const { status: studentStatus, withStudent } = useStudent();
  const [dashboard, setDashboard] = useState<LearningDashboard | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const currentDashboard = dashboard?.course === course ? dashboard : null;
  const currentCurriculum = curriculum?.course === course ? curriculum : null;

  const load = useCallback(async () => {
    if (!course) return;
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    try {
      const [nextDashboard, nextCurriculum] = await withStudent((studentId) =>
        Promise.all([
          getLearningDashboard(course, studentId),
          getCurriculum(course, studentId),
        ]),
      );
      if (requestId === loadRequest.current) {
        setDashboard(nextDashboard);
        setCurriculum(nextCurriculum);
      }
    } catch (cause) {
      if (requestId === loadRequest.current) setError(cause instanceof Error ? cause.message : "学习进度加载失败，请稍后重试。");
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [course, withStudent]);

  useEffect(() => {
    if (studentStatus === "initializing" || !course) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [course, load, studentStatus]);

  const progress = currentDashboard && currentDashboard.total_topics > 0
    ? currentDashboard.mastered_count / currentDashboard.total_topics
    : 0;
  const activeStage = useMemo(() => {
    if (!currentCurriculum) return null;
    return currentCurriculum.stages.find((stage) =>
      stage.topics.some((topic) => !["not_started", "mastered"].includes(topic.status)),
    ) ?? currentCurriculum.stages.find((stage) => stage.topics.some((topic) => topic.status !== "mastered")) ?? null;
  }, [currentCurriculum]);

  if (catalog.loading) return <div className="p-8"><LoadingBlock label="正在加载课程…" /></div>;
  if (catalog.error) return <div role="alert" className="p-8 text-sm text-rose-700">{catalog.error}<button type="button" onClick={catalog.reload} className="ml-3 underline">重试</button></div>;
  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <AlertIcon className="mx-auto size-9 text-amber-500" />
        <h1 className="mt-4 text-heading-4 text-ink">课程不存在</h1>
        <Link href="/learn" className="btn-dark mt-5">返回课程列表</Link>
      </div>
    );
  }

  const courseTitle = courseRecord?.title ?? course;
  const recommended = currentDashboard
    ? currentCurriculum?.stages
        .flatMap((stage) => stage.topics)
        .find((topic) => topic.id === currentDashboard.recommended_topic_id) ?? currentDashboard.current_topic
    : null;

  return (
    <div className="min-h-[calc(100svh-65px)] bg-canvas">
      <div className="mx-auto max-w-container px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <Link href="/learn" className="inline-flex items-center gap-1.5 text-sm font-medium text-steel transition hover:text-ink">
              <ArrowLeftIcon className="size-3.5" /> 切换课程
            </Link>
            <h1 className="mt-5 text-heading-3 text-ink sm:text-heading-2">{courseTitle}学习路径</h1>
          </div>
          <Link href="/?view=chat" className="btn-secondary w-fit">
            自由问答 <ArrowRightIcon className="size-4" />
          </Link>
        </div>

        {loading || studentStatus === "initializing" ? (
          <div className="mt-7"><LoadingBlock /></div>
        ) : error ? (
          <div className="mt-7 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert">
            <div className="flex items-start gap-3">
              <AlertIcon className="mt-0.5 size-5 shrink-0" />
              <div className="flex-1">
                <h2 className="font-semibold">学习数据暂时无法加载</h2>
                <p className="mt-1 text-sm">{error}</p>
              </div>
              <button type="button" onClick={() => void load()} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold shadow-sm">重试</button>
            </div>
          </div>
        ) : currentDashboard?.total_topics === 0 ? (<section className="mt-7 rounded-3xl border border-slate-200 bg-white p-10 text-center"><h2 className="text-lg font-semibold text-slate-800">当前课程暂无知识点</h2><p className="mt-3 text-sm text-slate-500">课程内容准备好后会显示在这里。</p></section>) : currentDashboard && currentCurriculum ? (
          <>
            <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
              <div className="card-feature">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-steel"><ChartIcon className="size-4 text-primary" />总体进度</span>
                    <p className="mt-3 text-heading-2 tabular-nums text-ink">{currentDashboard.mastered_count}<span className="ml-1 text-base font-medium text-stone">/ {currentDashboard.total_topics}</span></p>
                    <p className="mt-1 text-sm text-steel">知识点已有掌握记录</p>
                  </div>
                  {activeStage && <span className="tag-purple">当前 · 阶段 {activeStage.stage}</span>}
                </div>
                <div className="mt-6"><MasteryBar value={progress} label="课程完成度" /></div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    ["已掌握", currentDashboard.mastered_count, "bg-tint-mint"],
                    ["学习中", currentDashboard.learning_count, "bg-tint-lavender"],
                    ["可开始", currentDashboard.not_started_count, "bg-tint-sky"],
                  ].map(([label, value, className]) => (
                    <div key={String(label)} className={`rounded-lg p-4 text-charcoal ${className}`}>
                      <p className="text-heading-4 tabular-nums">{value}</p>
                      <p className="mt-1 text-[13px] font-medium">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-tint flex flex-col bg-tint-yellow-bold">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-charcoal"><TargetIcon className="size-4" />推荐下一步</span>
                <h2 className="mt-4 text-heading-4 text-ink">{recommended?.title ?? nextActionLabel(currentDashboard.next_action)}</h2>
                <p className="mt-2 text-sm leading-6 text-charcoal">{nextActionLabel(currentDashboard.next_action)}</p>
                {currentDashboard.reasons.length > 0 && (
                  <ul className="mt-4 space-y-1.5 text-[13px] leading-5 text-charcoal">
                    {currentDashboard.reasons.slice(0, 3).map((reason) => <li key={reason} className="flex gap-2"><span aria-hidden="true">·</span><span>{reason}</span></li>)}
                  </ul>
                )}
                {recommended && (
                  <div className="mt-auto pt-6">
                    <Link href={`/learn/${course}/${encodeURIComponent(recommended.id)}`} className="btn-dark">
                      继续学习 <ArrowRightIcon className="size-4" />
                    </Link>
                  </div>
                )}
              </div>
            </section>

            <section className="mt-section-sm space-y-6">
              <div className="space-y-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-heading-3 text-ink">课程阶段与知识点</h2>
                  </div>
                  <span className="text-[13px] text-stone">学习状态</span>
                </div>
                {currentCurriculum.stages.map((stage) => (
                  <section key={stage.stage} className="card">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-lg bg-tint-lavender font-semibold tabular-nums text-brand-purple-800">{stage.stage}</span>
                        <div>
                          <h3 className="text-heading-5 text-ink">{stage.title}</h3>
                          <p className="mt-0.5 text-[13px] text-stone">{stage.topics.length} 个知识点</p>
                        </div>
                      </div>
                      <LayersIcon className="size-5 text-slate-300" />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {stage.topics.map((topic) => <TopicCard key={topic.id} topic={topic} course={course} />)}
                    </div>
                  </section>
                ))}
              </div>


            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
