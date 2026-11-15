"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { placeGraphCallout, type GraphCalloutObstacle } from "@/lib/graph-callout";

export default function GraphNodeCallout({
  anchor, radius, viewport, nodes, children,
}: {
  anchor: { x: number; y: number };
  radius: number;
  viewport: { width: number; height: number };
  nodes: GraphCalloutObstacle[];
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(0);
  const placement = placeGraphCallout(anchor, radius, { width: 310, height: height || 380 }, viewport, nodes);
  const visible = placement !== null && height > 0;
  useEffect(() => {
    if (!panel.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.borderBoxSize[0]?.blockSize ?? entry.target.getBoundingClientRect().height);
    });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      {visible && (
        <svg
          aria-hidden="true"
          data-graph-callout-connector
          className="pointer-events-none absolute inset-0 z-10"
          width={viewport.width}
          height={viewport.height}
        >
          <path
            d={placement.points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <aside
        ref={panel}
        aria-label="知识点详情"
        className="graph-panel absolute z-10 overflow-y-auto overscroll-contain rounded-xl p-4"
        style={{
          left: placement?.x ?? 16,
          top: placement?.y ?? 156,
          width: placement?.width ?? Math.min(310, viewport.width - 32),
          maxHeight: placement?.maxHeight ?? 380,
          visibility: visible ? "visible" : "hidden",
        }}
      >
        {children}
      </aside>
    </>
  );
}
