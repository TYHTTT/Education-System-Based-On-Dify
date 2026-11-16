"use client";

import { useState } from "react";
import {
  chartNumber,
  trendValue,
  TREND_METRICS,
  type TrendMetric,
} from "@/lib/dify-usage-trends";
import type { DifyUsageTrends } from "@/lib/types";

function axis(value: number) {
  return value !== 0 && (value < 0.001 || value >= 1000000)
    ? value.toExponential(1)
    : new Intl.NumberFormat("zh-CN", { maximumSignificantDigits: 3 }).format(
        value,
      );
}

export default function DifyTrendChart({
  daily,
  metric,
  currency,
}: {
  daily: DifyUsageTrends["daily"];
  metric: TrendMetric;
  currency: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const points = daily.map((row) => ({
    ...trendValue(row, metric, currency),
    day: row.day,
  }));
  const values = points.map((point) => chartNumber(point.raw));
  const max =
    Math.max(...values.filter((value): value is number => value !== null), 0) ||
    1;
  const width = 860,
    left = 70,
    right = 22,
    top = 20,
    bottom = 210;
  const x = (i: number) =>
    left + ((i + 0.5) / daily.length) * (width - left - right);
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  const active = Math.min(selected ?? points.length - 1, points.length - 1);
  const current = points[active];
  const segments: string[] = [];
  let segment: string[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      if (segment.length) segments.push(segment.join(" "));
      segment = [];
    } else segment.push(`${x(i)},${y(value)}`);
  });
  if (segment.length) segments.push(segment.join(" "));
  const unit =
    metric === "cost" ? currency : metric === "total_calls" ? "次" : "Token";
  const ticks = [
    ...new Set(
      Array.from({ length: Math.min(6, daily.length) }, (_, i) =>
        Math.round(
          (i * (daily.length - 1)) / Math.max(1, Math.min(6, daily.length) - 1),
        ),
      ),
    ),
  ];
  return (
    <div>
      <div
        role="region"
        aria-label="每日趋势图表"
        tabIndex={0}
        className="mt-4 overflow-x-auto"
      >
        <svg
          viewBox={`0 0 ${width} 252`}
          className="min-w-[640px] w-full"
          role="img"
          aria-label={`每日${TREND_METRICS[metric]}趋势，单位 ${unit || "未选择币种"}，未知值留空`}
        >
          <title>按北京时间日期统计，使用下方日期滑块查看精确值</title>
          {[0, 0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={y(max * fraction)}
                y2={y(max * fraction)}
                stroke="#e5e7eb"
              />
              <text
                x={left - 10}
                y={y(max * fraction) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#64748b"
              >
                {axis(max * fraction)}
              </text>
            </g>
          ))}
          {segments.map((part, i) => (
            <polyline
              key={i}
              points={part}
              fill="none"
              stroke="#6d28d9"
              strokeWidth="2.5"
            />
          ))}
          {values.map((value, i) =>
            value !== null && (daily.length <= 60 || i === active) ? (
              <circle
                key={i}
                cx={x(i)}
                cy={y(value)}
                r={i === active ? 5 : 3}
                fill="#6d28d9"
              />
            ) : null,
          )}
          {values[active] !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={top}
              y2={bottom}
              stroke="#a78bfa"
              strokeDasharray="4 4"
            />
          )}
          {ticks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={bottom + 25}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
            >
              {daily[i].day.slice(5)}
            </text>
          ))}
          {points.map((point, i) => (
            <rect
              key={point.day}
              x={left + (i / daily.length) * (width - left - right)}
              width={(width - left - right) / daily.length}
              y={top}
              height={bottom - top}
              fill="transparent"
              onPointerEnter={() => setSelected(i)}
              onClick={() => setSelected(i)}
            >
              <title>
                {point.day}：{point.raw ?? "未知"} {unit}；{point.unknown}{" "}
                次未报告
              </title>
            </rect>
          ))}
        </svg>
      </div>
      <p className="mt-2 text-xs text-steel sm:hidden">
        可横向滑动图表，也可用下方滑块查看日期。
      </p>
      <label className="block text-xs text-steel">
        查看趋势日期（可拖动或使用方向键）
        <input
          type="range"
          min={0}
          max={Math.max(0, daily.length - 1)}
          value={active}
          onChange={(event) => setSelected(Number(event.target.value))}
          className="mt-2 w-full accent-violet-700"
        />
      </label>
      <p
        aria-live="polite"
        className="mt-3 break-words rounded-lg bg-surface p-3 text-sm leading-6 text-ink"
      >
        {current.day} · {TREND_METRICS[metric]}：
        <strong className="break-all tabular-nums">
          {current.raw ?? "未知"}
        </strong>{" "}
        {unit}
        {current.unknown > 0 && (
          <span className="text-steel">
            {" "}
            · {current.unknown} 次未报告，当前为已知部分
          </span>
        )}
        {current.raw !== null && values[active] === null && (
          <span className="text-steel"> · 数值超出图表范围，请以明细为准</span>
        )}
      </p>
    </div>
  );
}

export function DifyTrendComparison({
  groups,
  metric,
  currency,
}: {
  groups: DifyUsageTrends["groups"];
  metric: TrendMetric;
  currency: string;
}) {
  const values = groups.map((group) => trendValue(group, metric, currency));
  const max =
    Math.max(...values.map((value) => chartNumber(value.raw) ?? 0), 0) || 1;
  return (
    <dl className="mt-5 space-y-4" aria-label="当前页分组对比">
      {groups.map((group, i) => {
        const value = values[i];
        const number = chartNumber(value.raw);
        return (
          <div
            key={group.group_id ?? "unassigned"}
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4"
          >
            <dt className="break-all text-xs leading-5 text-steel">
              {group.label}
            </dt>
            <dd className="min-w-0">
              <div className="h-2 rounded-full bg-surface" aria-hidden="true">
                <div
                  className="h-2 rounded-full bg-violet-600"
                  style={{
                    width: `${number === null ? 0 : (number / max) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-1 break-all text-xs tabular-nums text-ink">
                {value.raw ?? "未知"}
                {metric === "cost" ? ` ${currency}` : ""}
                {value.unknown > 0 && ` · ${value.unknown} 次未报告`}
              </p>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
