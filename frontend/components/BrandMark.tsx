import Link from "next/link";

/** Course Coach wordmark: a black rounded square monogram + product name. */
export default function BrandMark({
  href = "/",
  label = "Course Coach",
  onDark = false,
}: {
  href?: string;
  label?: string;
  onDark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-[-0.2px] ${onDark ? "text-white" : "text-ink"}`}
    >
      <span
        aria-hidden="true"
        className={`grid size-7 place-items-center rounded-md border-2 text-[13px] font-bold ${onDark ? "border-white bg-[#ffffff] text-navy" : "border-current bg-canvas text-ink"}`}
      >
        C
      </span>
      <span>{label}</span>
    </Link>
  );
}
