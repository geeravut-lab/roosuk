import "server-only";
import { planSpec } from "@/lib/billing/specs.server";
import { resolvePlan } from "@/lib/billing/plan";
import { getBillingProfile } from "@/lib/billing/profile.server";
import { addDays, bangkokDate } from "@/lib/health/dates";
import { ensureCatalog } from "@/lib/lab/catalog.server";
import { createClient } from "@/lib/supabase/server";
import {
  buildMonthlyStats,
  monthBounds,
  parseStoredNarrative,
  previousMonth,
  recentMonths,
  type MonthlyStats,
  type ReportNarrative,
} from "./monthly";
import type { CheckinRow } from "@/lib/health/checkin";

const CHECKIN_COLUMNS =
  "checkin_date, sleep_band, activity_band, energy, mood, nutrition";

/** Months the person's plan lets them look at (the same window as the timeline), newest first. */
export async function allowedMonths(
  userId: string,
  now: Date,
): Promise<string[]> {
  const billing = await getBillingProfile(userId);
  const tier = billing ? resolvePlan(billing, now).tier : "free";
  const months = (await planSpec(tier)).timelineHistoryMonths;
  const today = bangkokDate(now);
  const cutoff = months === "unlimited" ? null : addDays(today, -30 * months);
  return recentMonths(today, 12).filter(
    (m) => !cutoff || monthBounds(m).to >= cutoff,
  );
}

/** The month's figures from the person's own rows (their client, so RLS applies). */
export async function loadMonthlyStats(
  month: string,
  today: string,
  lang: "th" | "en",
): Promise<MonthlyStats> {
  await ensureCatalog();
  const supabase = await createClient();
  const { from, to } = monthBounds(month);
  const prevFrom = monthBounds(previousMonth(month)).from;
  const [checkins, meals, labs, badges] = await Promise.all([
    supabase
      .from("daily_checkins")
      .select(CHECKIN_COLUMNS)
      .gte("checkin_date", prevFrom)
      .lte("checkin_date", to)
      .limit(100)
      .returns<CheckinRow[]>(),
    supabase
      .from("meal_logs")
      .select("meal_date")
      .eq("status", "confirmed")
      .gte("meal_date", from)
      .lte("meal_date", to)
      .limit(1000)
      .returns<{ meal_date: string }[]>(),
    supabase
      .from("lab_reports")
      .select("collected_on, items")
      .eq("status", "confirmed")
      .gte("collected_on", from)
      .lte("collected_on", to)
      .limit(100)
      .returns<{ collected_on: string; items: unknown }[]>(),
    supabase
      .from("user_achievements")
      .select("key, earned_on")
      .gte("earned_on", from)
      .lte("earned_on", to)
      .returns<{ key: string; earned_on: string }[]>(),
  ]);
  return buildMonthlyStats({
    month,
    today,
    lang,
    checkins: checkins.data ?? [],
    meals: meals.data ?? [],
    labs: labs.data ?? [],
    badges: badges.data ?? [],
  });
}

export async function loadNarrative(
  month: string,
): Promise<ReportNarrative | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("monthly_reports")
    .select("summary, highlights, next_steps")
    .eq("month", `${month}-01`)
    .maybeSingle<{
      summary: unknown;
      highlights: unknown;
      next_steps: unknown;
    }>();
  return data ? parseStoredNarrative(data) : null;
}
