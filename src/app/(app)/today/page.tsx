import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";
import { requireUser } from "@/lib/auth/server";
import { getBillingProfile } from "@/lib/billing/profile.server";
import { resolvePlan } from "@/lib/billing/plan";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navToday };
}

export default async function TodayPage() {
  const user = await requireUser();
  const [t, billing] = await Promise.all([getT(), getBillingProfile(user.id)]);
  const plan = billing ? resolvePlan(billing) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">{t.navToday}</h1>

      {plan?.source === "trial" ? (
        <Link
          href="/subscription"
          className="card bg-tint-secondary hover:bg-tint-primary flex items-center gap-3"
        >
          <Clock className="text-primary-strong size-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 font-medium">
            {fmt(t.todayTrialBanner, { days: plan.trialDaysLeft ?? 0 })}
          </span>
          <span className="text-primary-strong shrink-0 text-sm font-semibold underline">
            {t.todayTrialLink}
          </span>
        </Link>
      ) : null}

      <ComingSoon />
    </div>
  );
}
