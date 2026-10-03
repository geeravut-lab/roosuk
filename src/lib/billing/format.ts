import type { Quota } from "@/config/plans";
import { fmt, type Dict } from "@/lib/i18n/dict";

/** "30 ต่อเดือน" / "1 ต่อ 3 เดือน" / "ไม่จำกัด" */
export function quotaText(t: Dict, quota: Quota): string {
  if (quota.limit === "unlimited") return t.subUnlimited;
  const period =
    quota.periodMonths === 1
      ? t.subUsagePerMonth
      : fmt(t.subUsagePerMonths, { n: quota.periodMonths });
  return `${quota.limit} ${period}`;
}
