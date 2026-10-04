import type { Metadata } from "next";
import Link from "next/link";
import { TrendChart } from "@/components/charts/TrendChart";
import { biomarkerByKey } from "@/config/biomarkers";
import { PLANS } from "@/config/plans";
import { requireUser } from "@/lib/auth/server";
import { getBillingProfile } from "@/lib/billing/profile.server";
import { resolvePlan } from "@/lib/billing/plan";
import { addDays, bangkokDate } from "@/lib/health/dates";
import { parseStoredItems } from "@/lib/food/food";
import { ensureCatalog } from "@/lib/lab/catalog.server";
import { countOutOfRange, parseStoredLabItems } from "@/lib/lab/lab";
import {
  RANGE_OPTIONS,
  dailyKcal,
  markerSeries,
  parseRange,
  rangeStart,
  trendableMarkers,
} from "@/lib/timeline/charts";
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

const FILTERS = ["all", "checkin", "meal", "lab", "body"] as const;
type Filter = (typeof FILTERS)[number];
const LIST_CAP = 100;

/** Keep the other choices when one chip is pressed. */
function href(params: { range: number; type: Filter; marker?: string }) {
  const q = new URLSearchParams({
    range: String(params.range),
    type: params.type,
  });
  if (params.marker) q.set("marker", params.marker);
  return `/timeline?${q}`;
}

/**
 * The timeline: score and meal-energy charts over a chosen period, a trend
 * chart per lab test, and the history lists, filterable by type. How far back
 * the page shows depends on the plan (Free-lite 1 month, Gold 3, Premium all) —
 * older rows are never deleted, only hidden, so upgrading brings them back and
 * the user's own data stays theirs (export/deletion comes with PDPA cards).
 */
export default async function TimelinePage({
  searchParams,
}: PageProps<"/timeline">) {
  const sp = await searchParams;
  const user = await requireUser();
  await ensureCatalog();
  const now = new Date();
  const today = bangkokDate(now);
  const supabase = await createClient();
  const [
    t,
    lang,
    billing,
    rows,
    { data: mealRows },
    { data: labRows },
    { data: resultRows },
    { data: bodyRows },
  ] = await Promise.all([
    getT(),
    getLang(),
    getBillingProfile(user.id),
    loadCheckins(today),
    supabase
      .from("meal_logs")
      .select("id, meal_date, kcal, items")
      .eq("status", "confirmed")
      .gte("meal_date", addDays(today, -365))
      .order("meal_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<
        { id: string; meal_date: string; kcal: number; items: unknown }[]
      >(),
    supabase
      .from("lab_reports")
      .select("id, collected_on, items")
      .eq("status", "confirmed")
      .order("collected_on", { ascending: false })
      .limit(100)
      .returns<{ id: string; collected_on: string; items: unknown }[]>(),
    supabase
      .from("lab_results")
      .select("marker_key, value_std, status, collected_on")
      .not("marker_key", "is", null)
      .not("value_std", "is", null)
      .order("collected_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1500)
      .returns<
        {
          marker_key: string;
          value_std: number | string;
          status: "normal" | "watch" | "abnormal" | "unknown";
          collected_on: string;
        }[]
      >(),
    supabase
      .from("body_scans")
      .select("id, created_at, bmi_low, bmi_high, bmi_band")
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<
        {
          id: string;
          created_at: string;
          bmi_low: number;
          bmi_high: number;
          bmi_band: string;
        }[]
      >(),
  ]);

  const tier = billing ? resolvePlan(billing, now).tier : "free";
  const months = PLANS[tier].timelineHistoryMonths;
  // Months → days (30 per month) is close enough for a visibility window.
  const planDays = months === "unlimited" ? null : 30 * months;
  const planCutoff = planDays === null ? null : addDays(today, -planDays);
  const range = parseRange(sp.range, planDays);
  const type: Filter = FILTERS.find((f) => f === sp.type) ?? "all";
  const from = rangeStart(today, range);
  // What the plan shows AND the chosen period allows.
  const shownFrom = planCutoff && planCutoff > from ? planCutoff : from;
  const inShown = (date: string) => date >= shownFrom;

  const allVisible = planCutoff
    ? rows.filter((r) => r.checkin_date >= planCutoff)
    : rows;
  const hidden = rows.length - allVisible.length;
  const visible = allVisible.filter((r) => inShown(r.checkin_date));
  const meals = (mealRows ?? []).filter((m) => inShown(m.meal_date));
  const labs = (labRows ?? []).filter((r) => inShown(r.collected_on));
  const bodies = (bodyRows ?? []).filter((b) =>
    inShown(bangkokDate(new Date(b.created_at))),
  );

  const scores = new Map(dailyScores(visible).map((s) => [s.date, s.score]));
  const scorePoints = [...scores].map(([date, value]) => ({ date, value }));
  const kcalPoints = dailyKcal(meals);

  // Lab trends: only tests with 2+ results inside what the plan shows; the picked one is a query param.
  const trendRows = (resultRows ?? []).filter(
    (r) => !planCutoff || r.collected_on >= planCutoff,
  );
  const markers = trendableMarkers(trendRows).filter((k) => biomarkerByKey(k));
  const markerKey =
    markers.find((k) => k === sp.marker) ?? markers[0] ?? undefined;
  const marker = markerKey ? biomarkerByKey(markerKey) : undefined;
  // Lab trends are slow-moving: show the whole visible history for the test, not just the period.
  const markerFrom = trendRows.length
    ? trendRows.reduce(
        (min, r) => (r.collected_on < min ? r.collected_on : min),
        today,
      )
    : from;

  const answer = (prefix: string, n: number) =>
    t[`${prefix}_${n}` as keyof Dict];
  const show = (k: Filter) => type === "all" || type === k;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border-2 px-3.5 text-sm font-semibold ${
      active
        ? "border-primary-strong bg-tint-primary text-primary-strong"
        : "border-line bg-surface"
    }`;

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.navTimeline}
      </h1>

      <nav aria-label={t.timelineRangeLabel} className="space-y-2">
        <ul className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((r) => {
            const allowed = planDays === null || r <= planDays;
            return (
              <li key={r}>
                {allowed ? (
                  <Link
                    href={href({ range: r, type, marker: markerKey })}
                    className={chip(r === range)}
                    aria-current={r === range ? "page" : undefined}
                  >
                    {t[`timelineRange_${r}` as keyof Dict]}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
        <ul className="flex flex-wrap gap-2" aria-label={t.timelineFilterLabel}>
          {FILTERS.map((f) => (
            <li key={f}>
              <Link
                href={href({ range, type: f, marker: markerKey })}
                className={chip(f === type)}
                aria-current={f === type ? "page" : undefined}
              >
                {t[`timelineFilter_${f}` as keyof Dict]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {show("checkin") ? (
        <section className="card space-y-3" aria-labelledby="chart-h">
          <h2 id="chart-h" className="font-semibold">
            {t.timelineScoreChartTitle}
          </h2>
          <TrendChart
            t={t}
            lang={lang}
            title={t.timelineScoreChartTitle}
            unit={t.timelineScoreUnit}
            points={scorePoints}
            from={shownFrom}
            to={today}
            fixedY={[0, 100]}
            formatValue={(v) => String(Math.round(v))}
          />
          <p className="text-muted text-xs">{t.timelineScoreChartHint}</p>
          <p className="text-muted text-xs">
            {months === "unlimited"
              ? t.timelineWindowUnlimited
              : fmt(t.timelineWindow, { n: months })}
          </p>
        </section>
      ) : null}

      {show("meal") && kcalPoints.length > 0 ? (
        <section className="card space-y-3" aria-labelledby="kcal-h">
          <h2 id="kcal-h" className="font-semibold">
            {t.timelineKcalChartTitle}
          </h2>
          <TrendChart
            t={t}
            lang={lang}
            title={t.timelineKcalChartTitle}
            unit="kcal"
            points={kcalPoints}
            from={shownFrom}
            to={today}
            formatValue={(v) => String(Math.round(v))}
          />
          <p className="text-muted text-xs">{t.timelineKcalChartHint}</p>
        </section>
      ) : null}

      {show("lab") ? (
        <section className="card space-y-3" aria-labelledby="trend-h">
          <h2 id="trend-h" className="font-semibold">
            {t.timelineMarkerTitle}
          </h2>
          {marker && markerKey ? (
            <>
              <ul
                className="flex flex-wrap gap-2"
                aria-label={t.timelineMarkerPick}
              >
                {markers.map((k) => {
                  const m = biomarkerByKey(k);
                  return m ? (
                    <li key={k}>
                      <Link
                        href={href({ range, type, marker: k })}
                        className={chip(k === markerKey)}
                        aria-current={k === markerKey ? "page" : undefined}
                      >
                        {lang === "th" ? m.th : m.en}
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
              <TrendChart
                t={t}
                lang={lang}
                title={lang === "th" ? marker.th : marker.en}
                unit={marker.unit}
                points={markerSeries(trendRows, markerKey)}
                from={markerFrom}
                to={today}
                band={marker.normal}
                joinGaps
              />
              <p className="text-muted text-xs">{t.timelineMarkerHint}</p>
            </>
          ) : (
            <p className="text-muted text-sm">{t.timelineMarkerNone}</p>
          )}
        </section>
      ) : null}

      {show("body") && bodies.length > 0 ? (
        <section className="space-y-3" aria-labelledby="body-h">
          <h2 id="body-h" className="font-semibold">
            {t.bodyTimelineTitle}
          </h2>
          <ul className="space-y-2">
            {bodies.map((b) => {
              const lo = Number(b.bmi_low);
              const hi = Number(b.bmi_high);
              return (
                <li key={b.id}>
                  <Link
                    href={`/scan/body/${b.id}?from=timeline`}
                    className="card hover:bg-tint-primary flex items-center justify-between gap-3"
                  >
                    <span className="font-medium">
                      {fmt(t.bodyTimelineRow, {
                        bmi: lo === hi ? `${lo}` : `${lo}–${hi}`,
                        band: t[`bodyBand_${b.bmi_band}` as keyof Dict],
                      })}
                    </span>
                    <span className="text-muted text-sm">
                      {formatDate(lang, b.created_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {show("lab") && labs.length > 0 ? (
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

      {show("meal") && meals.length > 0 ? (
        <section className="space-y-3" aria-labelledby="meals-h">
          <h2 id="meals-h" className="font-semibold">
            {t.timelineMealsTitle}
          </h2>
          <ul className="space-y-2">
            {meals.slice(0, LIST_CAP).map((m) => (
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

      {show("checkin") ? (
        <section className="space-y-3" aria-labelledby="list-h">
          <h2 id="list-h" className="font-semibold">
            {t.timelineListTitle}
          </h2>
          {visible.length === 0 ? (
            <div className="card space-y-3">
              <p>{rows.length === 0 ? t.timelineEmpty : t.timelineListNone}</p>
              {rows.length === 0 ? (
                <Link href="/today/checkin" className="btn btn-primary w-full">
                  {t.todayCheckinCta}
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.slice(0, LIST_CAP).map((r) => (
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
      ) : null}
    </div>
  );
}
