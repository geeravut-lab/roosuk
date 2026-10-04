import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  ClipboardCheck,
  Clock,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/achievements/achievements";
import { awardAchievements } from "@/lib/achievements/server";
import { requireUser } from "@/lib/auth/server";
import { getBillingProfile } from "@/lib/billing/profile.server";
import { resolvePlan } from "@/lib/billing/plan";
import { fmt } from "@/lib/i18n/dict";
import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/health/dates";
import { loadCheckins, loadDoneActions } from "@/lib/health/server";
import { buildHabitView } from "@/lib/health/view";
import { getLang, getT } from "@/lib/i18n/server";
import {
  ActionsCard,
  CheckinCard,
  LowMoodCard,
  ScoreCard,
  StreakCard,
} from "./HabitCards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navToday };
}

export default async function TodayPage() {
  const user = await requireUser();
  const today = bangkokDate(new Date());
  const supabase = await createClient();
  // Before reading, so a badge earned by what the person just did is counted on this very visit.
  await awardAchievements(user.id);
  const [
    t,
    lang,
    billing,
    rows,
    doneKeys,
    { data: profileRow },
    { count: badges },
  ] = await Promise.all([
    getT(),
    getLang(),
    getBillingProfile(user.id),
    loadCheckins(today),
    loadDoneActions(today),
    supabase
      .from("health_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_achievements")
      .select("key", { count: "exact", head: true }),
  ]);
  const plan = billing ? resolvePlan(billing) : null;
  const view = buildHabitView(rows, doneKeys, today);

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

      {view.lowMood ? <LowMoodCard t={t} /> : null}
      {profileRow ? null : (
        <Link
          href="/profile"
          className="card bg-tint-secondary hover:bg-tint-primary flex items-center gap-3"
        >
          <UserRound
            className="text-primary-strong size-5 shrink-0"
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t.todayProfileCta}</span>
            <span className="text-muted block text-sm">
              {t.todayProfileHint}
            </span>
          </span>
        </Link>
      )}
      <CheckinCard t={t} view={view} />
      <Link
        href="/quiz"
        className="card hover:bg-tint-primary flex items-center gap-3 font-semibold"
      >
        <ClipboardCheck
          className="text-primary-strong size-5 shrink-0"
          aria-hidden
        />
        {t.todayQuizCta}
      </Link>
      <Link
        href="/checkup-interest"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Stethoscope
          className="text-primary-strong size-5 shrink-0"
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t.leadCta}</span>
          <span className="text-muted block text-sm">{t.leadCtaHint}</span>
        </span>
      </Link>
      <ScoreCard t={t} score={view.score} />
      <ActionsCard t={t} view={view} />
      <StreakCard t={t} lang={lang} view={view} />
      <Link
        href="/achievements"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Award className="text-primary-strong size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t.achievementsCta}</span>
          <span className="text-muted block text-sm">
            {fmt(t.achievementsCtaHint, {
              n: badges ?? 0,
              total: ACHIEVEMENTS.length,
            })}
          </span>
        </span>
      </Link>
    </div>
  );
}
