import { addDays, daysBetween } from "@/lib/health/dates";

/** How far back the charts can look; the plan's own window can cut this shorter. */
export const RANGE_OPTIONS = [7, 30, 90, 365] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

/**
 * `?range=` → a number of days. Anything unknown falls back to 30, and the
 * plan's window wins over what was asked for (`maxDays` null = no cap).
 */
export function parseRange(raw: unknown, maxDays: number | null): RangeDays {
  const asked = RANGE_OPTIONS.find((r) => String(r) === raw) ?? 30;
  if (maxDays === null || asked <= maxDays) return asked;
  const fits = RANGE_OPTIONS.filter((r) => r <= maxDays);
  return fits.length ? fits[fits.length - 1] : RANGE_OPTIONS[0];
}

export interface ChartPoint {
  date: string;
  value: number | null;
  /** lab status, used only to mark the dot (never by colour alone) */
  status?: "normal" | "watch" | "abnormal" | "unknown";
}

export interface Geometry {
  width: number;
  height: number;
  padX: number;
  padTop: number;
  padBottom: number;
}

export const GEO: Geometry = {
  width: 320,
  height: 150,
  padX: 14,
  padTop: 12,
  padBottom: 22,
};

export interface Plotted {
  date: string;
  value: number;
  status?: ChartPoint["status"];
  x: number;
  y: number;
}

export interface ChartLayout {
  points: Plotted[];
  /** One path per unbroken run: a day without data breaks the line instead of faking a value. */
  paths: string[];
  yMin: number;
  yMax: number;
  /** y of the normal band's edges, when one was given and it overlaps the plot */
  band: { top: number; bottom: number } | null;
  /** x of the first and last day of the range, for the axis labels */
  xStart: number;
  xEnd: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Pick a y-domain that always includes the data and (if given) the whole normal band, with a little air. */
export function yDomain(
  values: number[],
  band?: readonly [number | null, number | null],
  fixed?: [number, number],
): [number, number] {
  if (fixed) return fixed;
  const all = [...values];
  if (band) for (const b of band) if (b !== null) all.push(b);
  if (all.length === 0) return [0, 1];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const air = (hi - lo) * 0.12;
  return [lo - air, hi + air];
}

/**
 * Turn dated values into SVG coordinates. The x position is proportional to
 * the real date, so a gap of three weeks looks like three weeks.
 */
export function layoutChart(
  points: ChartPoint[],
  from: string,
  to: string,
  opts: {
    band?: readonly [number | null, number | null];
    fixedY?: [number, number];
    /** true for results that are not daily (labs): the line joins across gaps */
    joinGaps?: boolean;
    geo?: Geometry;
  } = {},
): ChartLayout {
  const g = opts.geo ?? GEO;
  const span = Math.max(daysBetween(from, to), 1);
  const plotW = g.width - 2 * g.padX;
  const plotH = g.height - g.padTop - g.padBottom;
  const dated = points
    .filter(
      (p): p is ChartPoint & { value: number } =>
        p.value !== null &&
        Number.isFinite(p.value) &&
        p.date >= from &&
        p.date <= to,
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const [yMin, yMax] = yDomain(
    dated.map((p) => p.value),
    opts.band,
    opts.fixedY,
  );
  const yOf = (v: number) =>
    round(g.padTop + plotH - ((v - yMin) / (yMax - yMin)) * plotH);
  const xOf = (d: string) =>
    round(g.padX + (daysBetween(from, d) / span) * plotW);

  const plotted: Plotted[] = dated.map((p) => ({
    date: p.date,
    value: p.value,
    status: p.status,
    x: xOf(p.date),
    y: yOf(p.value),
  }));

  // consecutive CALENDAR days stay joined; any missing day starts a new run
  const paths: string[] = [];
  let run: Plotted[] = [];
  const flush = () => {
    if (run.length > 1)
      paths.push(run.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "));
    run = [];
  };
  for (const p of plotted) {
    const last = run[run.length - 1];
    if (last && daysBetween(last.date, p.date) !== 1 && !opts.joinGaps) flush();
    run.push(p);
  }
  flush();

  let band: ChartLayout["band"] = null;
  if (opts.band && (opts.band[0] !== null || opts.band[1] !== null)) {
    const lo = opts.band[0] ?? yMin;
    const hi = opts.band[1] ?? yMax;
    band = {
      top: Math.max(g.padTop, yOf(Math.min(hi, yMax))),
      bottom: Math.min(g.padTop + plotH, yOf(Math.max(lo, yMin))),
    };
    if (band.bottom <= band.top) band = null;
  }
  return {
    points: plotted,
    paths,
    yMin: round(yMin),
    yMax: round(yMax),
    band,
    xStart: xOf(from),
    xEnd: xOf(to),
  };
}

/** Total kcal per day from confirmed meals. */
export function dailyKcal(
  meals: { meal_date: string; kcal: number }[],
): ChartPoint[] {
  const totals = new Map<string, number>();
  for (const m of meals) {
    const k = Number(m.kcal);
    if (Number.isFinite(k) && k >= 0)
      totals.set(m.meal_date, (totals.get(m.meal_date) ?? 0) + k);
  }
  return [...totals].map(([date, value]) => ({ date, value }));
}

/**
 * One marker's history. When two results share a day the latest-created one
 * wins (the rows come newest-first). Only values already converted to the
 * catalog unit are drawn; unconvertible ones stay out rather than mislead.
 */
export function markerSeries(
  rows: {
    marker_key: string | null;
    value_std: number | string | null;
    status: ChartPoint["status"];
    collected_on: string;
  }[],
  key: string,
): ChartPoint[] {
  const byDay = new Map<string, ChartPoint>();
  for (const r of rows) {
    if (r.marker_key !== key || r.value_std === null) continue;
    const v = Number(r.value_std);
    if (!Number.isFinite(v) || byDay.has(r.collected_on)) continue;
    byDay.set(r.collected_on, {
      date: r.collected_on,
      value: v,
      status: r.status,
    });
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Markers that have at least two drawable points, most-measured first — a single dot is not a trend. */
export function trendableMarkers(
  rows: {
    marker_key: string | null;
    value_std: number | string | null;
    collected_on: string;
  }[],
): string[] {
  const days = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.marker_key || r.value_std === null) continue;
    (
      days.get(r.marker_key) ??
      days.set(r.marker_key, new Set()).get(r.marker_key)!
    ).add(r.collected_on);
  }
  return [...days]
    .filter(([, d]) => d.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1))
    .map(([k]) => k);
}

/** First day shown for a range ending today. */
export const rangeStart = (today: string, days: number) =>
  addDays(today, -(days - 1));
