import { Check, Minus } from "lucide-react";
import {
  METERED_FEATURES,
  PLAN_IDS,
  PLANS,
  quotaFor,
  type PlanId,
  type QuotaOverrides,
} from "@/config/plans";
import { startPaymentAction } from "@/app/actions/payments";
import { quotaText } from "@/lib/billing/format";
import type { BillingSettings } from "@/lib/billing/settings";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { SubmitButton } from "@/components/SubmitButton";

function Yes({ t, on }: { t: Dict; on: boolean }) {
  return on ? (
    <Check className="text-primary-strong size-5" aria-label={t.subIncluded} />
  ) : (
    <Minus className="text-muted size-5" aria-label={t.subNotIncluded} />
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <span className="text-right font-medium">{children}</span>
    </li>
  );
}

/**
 * Plan cards, stacked on mobile. Every number comes from the same config +
 * settings the quota gate uses, so what is advertised is what is enforced.
 * The pay buttons start a PromptPay order (startPaymentAction); the amount is
 * read again from settings on the server, so these numbers are display only.
 */
export function PlanComparison({
  t,
  current,
  billing,
  credit,
}: {
  t: Dict;
  current: PlanId;
  billing: BillingSettings;
  /** the person's reward credit and the admin's per-payment maximum; offered only when both are above zero */
  credit?: { balance: number; maxPerUse: number };
}) {
  const overrides: QuotaOverrides = billing.planOverrides;
  const price = (id: "gold" | "premium") => {
    const p = billing.pricing;
    return id === "gold"
      ? { monthly: p.goldMonthly, yearly: p.goldYearly }
      : { monthly: p.premiumMonthly, yearly: p.premiumYearly };
  };
  const priceLines = (id: PlanId) => {
    if (id === "free") return [t.subPriceFree];
    const { monthly, yearly } = price(id);
    return [
      fmt(t.subPricePerMonth, { price: monthly }),
      fmt(t.subPricePerYear, { price: yearly }),
    ];
  };

  return (
    <ul className="space-y-4">
      {PLAN_IDS.map((id) => {
        const plan = PLANS[id];
        const isCurrent = id === current;
        return (
          <li
            key={id}
            className={`card space-y-3 ${isCurrent ? "border-primary-strong border-2" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-primary-strong text-lg font-bold">
                  {t[`planName_${id}` as const]}
                </h3>
                {priceLines(id).map((line) => (
                  <p key={line} className="text-sm">
                    {line}
                  </p>
                ))}
              </div>
              {isCurrent ? (
                <span className="bg-tint-secondary text-primary-strong rounded-full px-2.5 py-1 text-xs font-semibold">
                  {t.subYourPlanTag}
                </span>
              ) : null}
            </div>

            <ul className="divide-line divide-y">
              {METERED_FEATURES.map((f) => (
                <Row key={f} label={t[`feature_${f}` as const]}>
                  {quotaText(t, quotaFor(id, f, overrides))}
                </Row>
              ))}
              <Row label={t.subTimeline}>
                {plan.timelineHistoryMonths === "unlimited"
                  ? t.subUnlimited
                  : fmt(t.subTimelineMonths, { n: plan.timelineHistoryMonths })}
              </Row>
              <Row label={t.subVault}>
                {plan.vaultMaxFiles === "unlimited"
                  ? t.subUnlimited
                  : fmt(t.subVaultFiles, { n: plan.vaultMaxFiles })}
              </Row>
              <Row label={t.subPassport}>
                <Yes t={t} on={plan.healthPassport} />
              </Row>
              <Row label={t.subAgent}>
                <Yes t={t} on={plan.healthAgent} />
              </Row>
              <Row label={t.subFamily}>
                {plan.familyMembers > 0 ? (
                  fmt(t.subFamilyMembers, { n: plan.familyMembers })
                ) : (
                  <Yes t={t} on={false} />
                )}
              </Row>
            </ul>

            {id !== "free" ? (
              <form action={startPaymentAction} className="grid gap-2">
                <input type="hidden" name="tier" value={id} />
                {credit && credit.balance > 0 && credit.maxPerUse > 0 ? (
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      name="useCredit"
                      className="size-5 shrink-0"
                    />
                    <span className="text-sm">
                      {fmt(t.subUseCredit, {
                        max: credit.maxPerUse,
                        balance: credit.balance,
                      })}
                    </span>
                  </label>
                ) : null}
                <SubmitButton
                  name="period"
                  value="monthly"
                  className="btn btn-primary w-full"
                >
                  {fmt(t.subPayMonthly, { price: price(id).monthly })}
                </SubmitButton>
                <SubmitButton
                  name="period"
                  value="yearly"
                  className="btn btn-secondary w-full"
                >
                  {fmt(t.subPayYearly, { price: price(id).yearly })}
                </SubmitButton>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
