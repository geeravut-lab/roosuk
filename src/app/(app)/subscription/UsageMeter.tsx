import type { FeatureUsage } from "@/lib/billing/plan";
import { quotaText } from "@/lib/billing/format";
import { fmt, type Dict } from "@/lib/i18n/dict";

/** One AI-usage bar. Colour is never the only signal: the count and a "used up" label are always shown. */
export function UsageMeter({ t, usage }: { t: Dict; usage: FeatureUsage }) {
  const label = t[`feature_${usage.feature}` as const];
  const full = usage.percent !== null && usage.percent >= 100;
  const unlimited = usage.quota.limit === "unlimited";

  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-muted text-sm">
          {unlimited
            ? fmt(t.subUsageUsedOnly, { used: usage.used })
            : fmt(t.subUsageOf, {
                used: usage.used,
                limit: String(usage.quota.limit),
              })}
        </span>
      </div>
      {unlimited ? (
        <p className="text-primary-strong text-sm">{t.subUsageUnlimited}</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={usage.percent ?? 0}
            className="bg-tint-primary ring-field-border h-2.5 overflow-hidden rounded-full ring-1"
          >
            <div
              className={`h-full rounded-full ${full ? "bg-warn" : "bg-primary-strong"}`}
              style={{ width: `${usage.percent ?? 0}%` }}
            />
          </div>
          <p className="text-muted text-xs">
            {quotaText(t, usage.quota)}
            {full ? ` · ${t.subUsageFull}` : ""}
          </p>
        </>
      )}
    </li>
  );
}
