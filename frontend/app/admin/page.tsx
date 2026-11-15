"use client";

import Link from "next/link";
import { useAdmin } from "@/components/AdminProvider";
import HeroBand from "@/components/HeroBand";
import { ArrowRightIcon } from "@/components/Icons";

const QUICK_LINKS = [
  {
    href: "/admin/courses",
    title: "课程管理",
    description: "新增、启用或停用课程，维护章节与知识点。",
    tint: "bg-tint-lavender",
  },
  {
    href: "/admin/knowledge-graph",
    title: "知识图谱",
    description: "查看知识点之间的关联，检查课程结构是否完整。",
    tint: "bg-tint-mint",
  },
  {
    href: "/learn",
    title: "学生端预览",
    description: "以学生视角浏览课程目录与学习路径。",
    tint: "bg-tint-peach",
  },
];

export default function AdminHomePage() {
  const { admin } = useAdmin();
  if (!admin) return null;

  return (
    <>
      <HeroBand
        size="sm"
        align="left"
        eyebrow="Admin Console"
        title="管理后台"
        subtitle={`欢迎回来，${admin.display_name}。在这里维护课程内容与知识结构。`}
        actions={
          <>
            <Link href="/admin/courses" className="btn-primary">
              管理课程
            </Link>
            <Link
              href="/admin/knowledge-graph"
              className="btn-secondary-on-dark"
            >
              查看知识图谱
            </Link>
          </>
        }
      />
      <section
        aria-label="管理员账户"
        className="mx-auto grid max-w-container gap-6 px-4 py-section sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
      >
        <div className="card-feature">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-full bg-tint-lavender font-semibold text-brand-purple-800"
              >
                {admin.display_name.slice(0, 1)}
              </span>
              <h2 className="text-heading-4 text-ink">{admin.display_name}</h2>
            </div>
            <span className="tag-purple">管理员</span>
          </div>
          <dl className="mt-8 grid gap-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="eyebrow">用户名</dt>
              <dd className="mt-1.5 break-all font-medium text-ink">
                {admin.username}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">账户状态</dt>
              <dd className="mt-1.5">
                <span className="tag-green">正常</span>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">创建时间</dt>
              <dd className="mt-1.5 text-charcoal">
                {new Date(admin.created_at).toLocaleString("zh-CN")}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">最近活动</dt>
              <dd className="mt-1.5 text-charcoal">
                {new Date(admin.last_active_at).toLocaleString("zh-CN")}
              </dd>
            </div>
          </dl>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={`card-tint group flex flex-col p-6 transition-shadow hover:shadow-card ${item.tint} ${index === 0 ? "sm:col-span-2" : ""}`}
            >
              <h3 className="text-heading-5 text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-charcoal">
                {item.description}
              </p>
              <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-ink">
                进入
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
