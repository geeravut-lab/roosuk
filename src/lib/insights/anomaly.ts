import type { CheckinRow } from "@/lib/health/checkin";
import { addDays, daysBetween } from "@/lib/health/dates";
import { dayScore } from "@/lib/health/score";

/**
 * "Something worth a look" — found by CODE from the person's own check-ins and
 * lab results, never by a model. Each insight says what changed, in plain facts,
 * and points to one small next step. It never says why, never names a disease,
 * and the lab one hands off to a doctor. (Low mood already has its own card.)
 */
export type InsightKind =
  "lab_worse" | "score_drop" | "sleep_short" | "comeback";

export interface Insight {
  kind: InsightKind;
  /** 3 = see a doctor-ish, 2 = a pattern to act on, 1 = a gentle nudge */
  severity: 1 | 2 | 3;
  /** One note per (kind, anchor): the AI explanation is only paid for once per anchor. */
  anchor: string;
  /** Plain facts, safe to show and to give a model. */
  facts: Record<string, string | number>;
  /** Where "the next step" goes. */
  href: string;
}

export interface LabResultRow {
  marker_key: string | null;
  status: "normal" | "watch" | "abnormal" | "unknown";
  collected_on: string;
  report_id: string;
}

const RANK = { normal: 0, watch: 1, abnormal: 2 } as const;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Monday of the week containing `date` (the anchor for weekly insights). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export const DROP_POINTS = 15;
export const MIN_DAYS_PER_WEEK = 3;
export const SHORT_SLEEP_DAYS = 3;
export const COMEBACK_GAP_DAYS = 4;
export const COMEBACK_MIN_RUN = 5;

function labWorse(labs: LabResultRow[], today: string): Insight | null {
  const byMarker = new Map<string, LabResultRow[]>();
  for (const r of labs)
    if (r.marker_key && r.status !== "unknown")
      (
        byMarker.get(r.marker_key) ??
        byMarker.set(r.marker_key, []).get(r.marker_key)!
      ).push(r);
  const worse: { key: string; latest: LabResultRow }[] = [];
  for (const [key, rows] of byMarker) {
    // one result per day, newest first
    const days = [
      ...new Map(
        rows
          .sort((a, b) => (a.collected_on < b.collected_on ? 1 : -1))
          .map((r) => [r.collected_on, r]),
      ).values(),
    ];
    if (days.length < 2) continue;
    const [latest, previous] = days;
    if (daysBetween(latest.collected_on, today) > 180) continue; // stale: not news
    if (RANK[latest.status as "normal"] > RANK[previous.status as "normal"])
      worse.push({ key, latest });
  }
  if (worse.length === 0) return null;
  worse.sort((a, b) =>
    a.latest.collected_on < b.latest.collected_on ? 1 : -1,
  );
  const newest = worse[0].latest;
  return {
    kind: "lab_worse",
    severity: 3,
    anchor: `${newest.collected_on}:${worse
      .map((w) => w.key)
      .sort()
      .join(",")}`.slice(0, 120),
    facts: {
      markers: worse
        .slice(0, 3)
        .map((w) => w.key)
        .join(","),
      count: worse.length,
    },
    href: `/scan/lab/${newest.report_id}?from=today`,
  };
}

function scoreDrop(rows: CheckinRow[], today: string): Insight | null {
  const inRange = (from: number, to: number) =>
    rows
      .filter(
        (r) =>
          r.checkin_date >= addDays(today, from) &&
          r.checkin_date <= addDays(today, to),
      )
      .map((r) => dayScore(r));
  const recent = inRange(-6, 0);
  const before = inRange(-13, -7);
  if (recent.length < MIN_DAYS_PER_WEEK || before.length < MIN_DAYS_PER_WEEK)
    return null;
  const drop = Math.round(avg(before) - avg(recent));
  if (drop < DROP_POINTS) return null;
  return {
    kind: "score_drop",
    severity: 2,
    anchor: weekStart(today),
    facts: {
      recent: Math.round(avg(recent)),
      previous: Math.round(avg(before)),
      drop,
    },
    href: "/timeline?from=today",
  };
}

function sleepShort(rows: CheckinRow[], today: string): Insight | null {
  const last = rows
    .filter((r) => r.checkin_date >= addDays(today, -6))
    .sort((a, b) => (a.checkin_date < b.checkin_date ? 1 : -1))
    .slice(0, 5);
  const short = last.filter((r) => r.sleep_band === 1);
  if (last.length < SHORT_SLEEP_DAYS || short.length < SHORT_SLEEP_DAYS)
    return null;
  return {
    kind: "sleep_short",
    severity: 2,
    anchor: last[0].checkin_date,
    facts: { days: short.length, of: last.length },
    href: "/today",
  };
}

function comeback(rows: CheckinRow[], today: string): Insight | null {
  if (rows.length === 0) return null;
  const dates = new Set(rows.map((r) => r.checkin_date));
  const lastDate = [...dates].sort().at(-1)!;
  const gap = daysBetween(lastDate, today);
  if (gap < COMEBACK_GAP_DAYS || gap > 30) return null;
  let run = 0;
  for (let d = lastDate; dates.has(d); d = addDays(d, -1)) run++;
  if (run < COMEBACK_MIN_RUN) return null;
  return {
    kind: "comeback",
    severity: 1,
    anchor: lastDate,
    facts: { run, gap },
    href: "/today/checkin",
  };
}

/** Every insight that applies, most important first (at most one per kind). */
export function detectInsights(i: {
  today: string;
  checkins: CheckinRow[];
  labs: LabResultRow[];
}): Insight[] {
  return [
    labWorse(i.labs, i.today),
    scoreDrop(i.checkins, i.today),
    sleepShort(i.checkins, i.today),
    comeback(i.checkins, i.today),
  ]
    .filter((x): x is Insight => x !== null)
    .sort((a, b) => b.severity - a.severity);
}
