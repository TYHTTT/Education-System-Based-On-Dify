import type { ReactNode } from "react";

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
