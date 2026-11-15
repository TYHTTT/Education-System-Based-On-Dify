import type { DifyCallLogSummary } from "@/lib/types";

export default function DifyCallCost({
  log,
  compact = false,
}: {
  log: Pick<DifyCallLogSummary, "total_price" | "currency" | "cny_conversion">;
  compact?: boolean;
}) {
  if (log.total_price === null) return <>未知</>;
  const converted = log.cny_conversion;
  const reference =
    converted?.source === "Frankfurter"
      ? `1 ${log.currency} = ${converted.rate} CNY；${converted.rate_date}，Frankfurter 参考汇率`
      : undefined;
  return (
    <span className="block break-all tabular-nums" title={reference}>
      {converted ? (
        <>
          <span>
            {converted.source === "original" ? "" : "约 "}
            {converted.amount} CNY
          </span>
          {converted.source !== "original" && (
            <span className="mt-1 block text-xs text-steel">
              原金额：{log.total_price} {log.currency}
            </span>
          )}
          {!compact && reference && (
            <span className="mt-2 block text-xs leading-5 text-steel">
              {reference}
            </span>
          )}
        </>
      ) : (
        <>
          <span>
            {log.total_price} {log.currency ?? "币种未知"}
          </span>
          <span className="mt-1 block text-xs text-steel">人民币暂未换算</span>
        </>
      )}
    </span>
  );
}
