import { redirect } from "next/navigation";
import { legacyDashboardHref } from "@/lib/dify-dashboard";

export default async function LegacyUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyDashboardHref(await searchParams, "trends"));
}
