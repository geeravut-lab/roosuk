import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@/config/plans";
import { requireUser } from "@/lib/auth/server";
import { getBillingProfile } from "@/lib/billing/profile.server";
import { resolvePlan } from "@/lib/billing/plan";
import { addDays, bangkokDate } from "@/lib/health/dates";
import { parseStoredItems } from "@/lib/food/food";
import { countOutOfRange, parseStoredLabItems } from "@/lib/lab/lab";
import { loadCheckins } from "@/lib/health/server";
import { dailyScores } from "@/lib/health/view";
import type { Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navTimeline };
}

const CHART_DAYS = 14;

/**
 * Timeline basics: the check-in history and a 14-day score chart. How far back
 * the page shows depends on the plan (Free-lite 1 month, Gold 3, Premium all) —
 * older rows are never deleted, only hidden, so upgrading brings them back and
 * the user's own data stays theirs (export/deletion comes with PDPA cards).
 */
export default async function TimelinePage() {
  const user = await requireUser();
  const now = new Date();
  const today = bangkokDate(now);
  const supabase = await createClient();
  const [t, lang, billing, rows, { data: mealRows }, { data: labRows }] =
    await Promise.all([
      getT(),
      getLang(),
      getBillingProfile(user.id),
      loadCheckins(today),
      supabase
        .from("meal_logs")
        .select("id, meal_date, kcal, items")
        .eq("status", "confirmed")
        .order("meal_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60)
        .returns<
          { id: string; meal_date: string; kcal: number; items: unknown }[]
        >(),
      supabase
        .from("lab_reports")
        .select("id, collected_on, items")
        .eq("status", "confirmed")
        .order("collected_on", { ascending: false })
        .limit(40)
        .returns<{ id: string; collected_on: string; items: unknown }[]>(),
    ]);

  const tier = billing ? resolvePlan(billing, now).tier : "free";
  const months = PLANS[tier].timelineHistoryMonths;
  // Months → days (30 per month) is close enough for a visibility window.
  const cutoff = months === "unlimited" ? null : addDays(today, -30 * months);
  const visible = cutoff ? rows.filter((r) => r.checkin_date >= cutoff) : rows;
  const meals = (mealRows ?? []).filter(
    (m) => !cutoff || m.meal_date >= cutoff,
  );
  const labs = (labRows ?? []).filter(
    (r) => !cutoff || r.collected_on >= cutoff,
  );
  const hidden = rows.length - visible.length;

  const scores = new Map(dailyScores(visible).map((s) => [s.date, s.score]));
  const chart = Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = addDays(today, i - (CHART_DAYS - 1));
    return { date, score: scores.get(date) ?? null };
  });

  const answer = (prefix: string, n: number) =>
    t[`${prefix}_${n}` as keyof Dict];

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.navTimeline}
      </h1>

      <section className="card space-y-3" aria-labelledby="chart-h">
        <h2 id="chart-h" className="font-semibold">
          {t.timelineChartTitle}
        </h2>
        <ul
          className="flex h-32 items-end gap-1"
          aria-label={t.timelineChartTitle}
        >
          {chart.map((d) => (
            <li
              key={d.date}
              className="flex h-full flex-1 flex-col justify-end"
              aria-label={`${formatDate(lang, d.date)}: ${d.score === null ? "–" : fmt(t.timelineScore, { n: d.score })}`}
            >
              <div
                className={`rounded-t-md ${d.score === null ? "bg-line" : "bg-primary"}`}
                style={{
                  height: `${d.score === null ? 4 : Math.max(d.score, 6)}%`,
                }}
              />
            </li>
          ))}
        </ul>
        <p className="text-muted text-xs">
          {months === "unlimited"
            ? t.timelineWindowUnlimited
            : fmt(t.timelineWindow, { n: months })}
        </p>
      </section>

      {labs.length > 0 ? (
        <section className="space-y-3" aria-labelledby="labs-h">
          <h2 id="labs-h" className="font-semibold">
            {t.timelineLabsTitle}
          </h2>
          <ul className="space-y-2">
            {labs.map((r) => {
              const items = parseStoredLabItems(r.items);
              const out = countOutOfRange(items);
              return (
                <li key={r.id}>
                  <Link
                    href={`/scan/lab/${r.id}?from=timeline`}
                    className="card hover:bg-tint-primary block space-y-1"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">
                        {formatDate(lang, r.collected_on)}
                      </span>
                      <span className="text-muted text-sm">
                        {fmt(t.timelineLabItems, { n: items.length })}
                      </span>
                    </span>
                    <span className="block text-sm font-medium">
                      {out > 0
                        ? fmt(t.timelineLabOutOfRange, { n: out })
                        : t.timelineLabAllGood}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {meals.length > 0 ? (
        <section className="space-y-3" aria-labelledby="meals-h">
          <h2 id="meals-h" className="font-semibold">
            {t.timelineMealsTitle}
          </h2>
          <ul className="space-y-2">
            {meals.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/scan/food/${m.id}?from=timeline`}
                  className="card hover:bg-tint-primary block space-y-1"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      {formatDate(lang, m.meal_date)}
                    </span>
                    <span className="text-primary-strong font-bold">
                      {fmt(t.foodKcal, { kcal: m.kcal })}
                    </span>
                  </span>
                  <span className="text-muted block text-sm">
                    {parseStoredItems(m.items)
                      .map((i) => i.name)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="list-h">
        <h2 id="list-h" className="font-semibold">
          {t.timelineListTitle}
        </h2>
        {visible.length === 0 ? (
          <div className="card space-y-3">
            <p>{t.timelineEmpty}</p>
            <Link href="/today/checkin" className="btn btn-primary w-full">
              {t.todayCheckinCta}
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((r) => (
              <li key={r.checkin_date} className="card space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    {formatDate(lang, r.checkin_date)}
                  </span>
                  <span className="text-primary-strong font-bold">
                    {fmt(t.timelineScore, {
                      n: scores.get(r.checkin_date) ?? 0,
                    })}
                  </span>
                </div>
                <p className="text-muted text-sm">
                  {fmt(t.timelineAnswers, {
                    sleep: answer("sleep", r.sleep_band),
                    activity: answer("act", r.activity_band),
                    energy: answer("energy", r.energy),
                    mood: answer("mood", r.mood),
                    nutrition: answer("nutrition", r.nutrition),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
        {hidden > 0 ? (
          <p className="card bg-tint-secondary text-sm">
            {fmt(t.timelineHidden, { n: hidden })}{" "}
            <Link
              href="/subscription"
              className="text-primary-strong font-semibold underline"
            >
              {t.todayTrialLink}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
