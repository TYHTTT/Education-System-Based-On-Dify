"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

/** A compact disclosure keeps navigation and account actions available on touch screens. */
export default function MobileNavigation({
  label,
  items,
  children,
}: {
  label: string;
  items: Array<{ href: string; label: string; active: boolean }>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="relative ml-auto lg:hidden"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={open ? "收起导航" : "展开导航"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen((value) => !value)}
        className="btn-secondary size-11 p-0"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="size-5"
        >
          <path d={open ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>
      {open && (
        <div
          id="mobile-navigation"
          className="absolute right-0 top-[calc(100%+12px)] w-[min(320px,calc(100vw-32px))] rounded-xl border border-hairline bg-canvas p-3 shadow-modal"
        >
          <nav aria-label={label} className="space-y-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${item.active ? "bg-surface text-ink" : "text-steel hover:bg-surface hover:text-ink"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {children && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
