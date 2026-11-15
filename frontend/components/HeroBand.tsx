import type { CSSProperties, ReactNode } from "react";

/** Brand-colored sticky-note dots scattered around hero content. */
const DOTS: Array<{ className: string; style: CSSProperties }> = [
  { className: "left-[6%] top-[22%] size-8", style: { background: "#f5d75e", "--r": "-8deg" } as CSSProperties },
  { className: "left-[12%] bottom-[18%] size-5", style: { background: "#ff64c8", "--r": "12deg" } as CSSProperties },
  { className: "left-[22%] top-[12%] size-3", style: { background: "#2a9d99", "--r": "0deg" } as CSSProperties },
  { className: "right-[8%] top-[18%] size-6", style: { background: "#dd5b00", "--r": "10deg" } as CSSProperties },
  { className: "right-[16%] bottom-[22%] size-9", style: { background: "#d6b6f6", "--r": "-6deg" } as CSSProperties },
  { className: "right-[26%] top-[10%] size-3", style: { background: "#1aae39", "--r": "0deg" } as CSSProperties },
];

function MeshWire({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 120"
      fill="none"
      className={`pointer-events-none absolute -z-10 text-white/15 ${className}`}
    >
      <path
        d="M2 90 C 40 20, 80 120, 120 50 S 180 10, 198 60"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2 110 C 50 50, 90 130, 140 70 S 185 40, 198 90"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="4 6"
      />
    </svg>
  );
}

export default function HeroBand({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  align = "center",
  size = "md",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  align?: "center" | "left";
  size?: "sm" | "md";
}) {
  const centered = align === "center";
  return (
    <section className="hero-band">
      {DOTS.map((dot, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`hero-dot hidden md:block ${dot.className}`}
          style={dot.style}
        />
      ))}
      <MeshWire className="-left-10 top-6 hidden w-72 md:block" />
      <MeshWire className="-right-12 bottom-4 hidden w-80 rotate-180 md:block" />
      <div
        className={`mx-auto max-w-container px-4 sm:px-8 ${size === "sm" ? "py-section-sm sm:py-section" : "py-section sm:py-section-lg"} ${centered ? "text-center" : ""}`}
      >
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[1px] text-white/60">
            {eyebrow}
          </p>
        )}
        <h1
          className={`text-balance font-semibold text-white ${size === "sm" ? "text-[36px] leading-[1.2] tracking-[-0.5px] sm:text-heading-1" : "text-[36px] leading-[1.2] tracking-[-0.5px] min-[480px]:text-[48px] md:text-display-lg lg:text-[72px] lg:leading-[1.15] lg:tracking-[-2px] xl:text-[80px]"} ${eyebrow ? "mt-4" : ""}`}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={`mt-5 text-base leading-7 text-white/70 sm:text-subtitle ${centered ? "mx-auto max-w-2xl" : "max-w-2xl"}`}
          >
            {subtitle}
          </p>
        )}
        {actions && (
          <div
            className={`mt-8 flex flex-wrap gap-3 ${centered ? "justify-center" : ""}`}
          >
            {actions}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
