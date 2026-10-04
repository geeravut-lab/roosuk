import { bangkokDate } from "@/lib/health/dates";
import type { ObsType } from "./types";

export interface ObsRow {
  type: string;
  value: number | string;
  start_at: string;
  source: string;
}

export interface DayPoint {
  date: string;
  value: number;
}

const ADDITIVE: ReadonlySet<string> = new Set(["steps", "sleep_minutes"]);

/**
 * One value per day per type from rows that may come from several sources.
 * Steps and sleep are totals, so when two sources both counted the same day the
 * larger one stands (they overlap; adding them would double count). Everything
 * else is a reading, so the day's figure is the average of what was sent.
 */
export function dailySeries(
  rows: readonly ObsRow[],
): Partial<Record<ObsType, DayPoint[]>> {
  const bySource = new Map<string, number[]>(); // type|date|source → values
  for (const r of rows) {
    const key = `${r.type}|${bangkokDate(new Date(r.start_at))}|${r.source}`;
    const list = bySource.get(key);
    const v = Number(r.value);
    if (list) list.push(v);
    else bySource.set(key, [v]);
  }
  const perDay = new Map<string, number[]>(); // type|date → one figure per source
  for (const [key, values] of bySource) {
    const [type, date] = key.split("|");
    const figure = ADDITIVE.has(type)
      ? values[values.length - 1] // each source sends one total a day; a re-send replaced it
      : values.reduce((a, b) => a + b, 0) / values.length;
    const k = `${type}|${date}`;
    const l = perDay.get(k);
    if (l) l.push(figure);
    else perDay.set(k, [figure]);
  }
  const out: Partial<Record<ObsType, DayPoint[]>> = {};
  for (const [key, figures] of perDay) {
    const [type, date] = key.split("|") as [ObsType, string];
    const value = ADDITIVE.has(type)
      ? Math.max(...figures)
      : figures.reduce((a, b) => a + b, 0) / figures.length;
    (out[type] ??= []).push({ date, value: Math.round(value * 10) / 10 });
  }
  for (const list of Object.values(out))
    list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export interface DayFigures {
  steps: number | null;
  restingHr: number | null;
  sleepMinutes: number | null;
}

/** The three figures the passport summarises, one entry per day that has any of them. */
export function passportDays(
  series: Partial<Record<ObsType, DayPoint[]>>,
): DayFigures[] {
  const days = new Map<string, DayFigures>();
  const put = (type: ObsType, key: keyof DayFigures) => {
    for (const p of series[type] ?? []) {
      const d = days.get(p.date) ?? {
        steps: null,
        restingHr: null,
        sleepMinutes: null,
      };
      d[key] = p.value;
      days.set(p.date, d);
    }
  };
  put("steps", "steps");
  put("resting_heart_rate", "restingHr");
  put("sleep_minutes", "sleepMinutes");
  return [...days.values()];
}
