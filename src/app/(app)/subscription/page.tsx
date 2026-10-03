import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";
import { METERED_FEATURES } from "@/config/plans";
import { requireUser } from "@/lib/auth/server";
import { PAYMENT_COLUMNS, type PaymentRow } from "@/lib/billing/payments";
import { getBillingProfile, getUsageRows } from "@/lib/billing/profile.server";
import { bangkokMonthStart, windowStart } from "@/lib/billing/period";
import {
  resolvePlan,
  summarizeUsage,
  type BillingProfile,
} from "@/lib/billing/plan";
import { errorText, fmt } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { loadPlatformSettings } from "@/lib/settings/server";
import { createClient } from "@/lib/supabase/server";
import { PlanComparison } from "./PlanComparison";
import { UsageMeter } from "./UsageMeter";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).subTitle };
}

const NO_BILLING: BillingProfile = {
  plan_tier: "free",
  plan_expires_at: null,
  trial_started_at: null,
  trial_ends_at: null,
  ai_suspended: false,
};

export default async function SubscriptionPage({
  searchParams,
}: PageProps<"/subscription">) {
  const user = await requireUser();
  const { error } = await searchParams;
  const now = new Date();
  const monthStart = bangkokMonthStart(now);
  const supabase = await createClient();
  const [t, lang, { billing }, profile, rows, { data: payments }] =
    await Promise.all([
      getT(),
      getLang(),
      loadPlatformSettings(),
      getBillingProfile(user.id),
      getUsageRows(user.id, monthStart),
      supabase
        .from("payments")
        .select(PAYMENT_COLUMNS)
        .eq("user_id", user.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<PaymentRow[]>(),
    ]);

  const plan = resolvePlan(profile ?? NO_BILLING, now);
  const usage = summarizeUsage(
    rows,
    plan.tier,
    METERED_FEATURES,
    monthStart,
    windowStart,
    billing.planOverrides,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-primary-strong text-2xl font-bold">{t.subTitle}</h1>

      {typeof error === "string" ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      <section className="card space-y-2" aria-labelledby="current-h">
        <h2 id="current-h" className="text-muted text-sm font-semibold">
          {t.subCurrentPlan}
        </h2>
        <p className="text-xl font-bold">
          {t[`planName_${plan.tier}` as const]}
        </p>
        {plan.source === "trial" && plan.trialEndsAt ? (
          <p className="inline-flex items-start gap-2">
            <Clock
              className="text-primary-strong mt-0.5 size-5 shrink-0"
              aria-hidden
            />
            <span>
              <strong>{t.subTrialActive}</strong>
              <br />
              {fmt(t.subTrialDaysLeft, {
                days: plan.trialDaysLeft ?? 0,
                date: formatDate(lang, plan.trialEndsAt),
              })}
            </span>
          </p>
        ) : null}
        {plan.source === "paid" && plan.paidUntil ? (
          <p>
            {fmt(t.subPaidUntil, { date: formatDate(lang, plan.paidUntil) })}
          </p>
        ) : null}
        {plan.trialEnded ? <p>{t.subTrialEnded}</p> : null}
        {plan.suspended ? (
          <p
            role="alert"
            className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
          >
            {t.subSuspended}
          </p>
        ) : null}
      </section>

      <section className="card space-y-4" aria-labelledby="usage-h">
        <h2 id="usage-h" className="font-semibold">
          {t.subUsageTitle}
        </h2>
        <ul className="space-y-4">
          {usage.map((u) => (
            <UsageMeter key={u.feature} t={t} usage={u} />
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="plans-h">
        <h2 id="plans-h" className="font-semibold">
          {t.subPlansTitle}
        </h2>
        <PlanComparison t={t} current={plan.tier} billing={billing} />
        <p className="text-muted text-sm">{t.subPayNote}</p>
      </section>

      {payments && payments.length > 0 ? (
        <section className="space-y-3" aria-labelledby="payments-h">
          <h2 id="payments-h" className="font-semibold">
            {t.subPaymentsTitle}
          </h2>
          <ul className="space-y-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="card flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {t[`planName_${p.plan_tier}` as const]} ·{" "}
                    {t[`payPeriod_${p.period}` as const]} · ฿
                    {p.amount.toLocaleString("en-US")}
                  </p>
                  <p className="text-muted text-sm">
                    {formatDate(lang, p.created_at)} ·{" "}
                    {t[`payStatus_${p.status}` as const]}
                  </p>
                </div>
                <Link
                  href={`/subscription/pay/${p.id}`}
                  className="btn btn-secondary shrink-0"
                >
                  {t.subPaymentOpen}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
