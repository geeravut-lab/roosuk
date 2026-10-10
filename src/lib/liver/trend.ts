import { biomarkerByKey } from "@/config/biomarkers";
import type { LabStatus } from "@/lib/lab/lab";
import { markerSeries, type ChartPoint } from "@/lib/timeline/charts";
import {
  CORE_MARKERS,
  LIVER_MARKERS,
  type LabPanel,
  type LabValue,
  type LiverMarker,
} from "./engine";
import { fib4, type ScoreResult } from "./scores";

/** A confirmed Lab Scan value as stored in `lab_results`. */
export interface LiverLabRow {
  marker_key: string | null;
  value_std: number | string | null;
  status: LabStatus;
  collected_on: string;
}

const isLiverMarker = (k: string | null): k is LiverMarker =>
  k !== null && (LIVER_MARKERS as readonly string[]).includes(k);

/** The columns the loaders select (kept next to the type). */
export const LIVER_LAB_COLUMNS = "marker_key, value_std, status, collected_on";

/**
 * Rows (newest first) → one panel per day. Two results of the same test on one
 * day: the first row wins, i.e. the one saved last. Values that could not be
 * converted to the catalog unit (value_std null) are left out, never guessed.
 */
export function toPanels(rows: readonly LiverLabRow[]): LabPanel[] {
  const byDate = new Map<string, LabPanel>();
  for (const r of rows) {
    if (!isLiverMarker(r.marker_key) || r.value_std === null) continue;
    const value = Number(r.value_std);
    if (!Number.isFinite(value)) continue;
    const p =
      byDate.get(r.collected_on) ??
      byDate
        .set(r.collected_on, { date: r.collected_on, values: {} })
        .get(r.collected_on)!;
    if (!p.values[r.marker_key])
      p.values[r.marker_key] = { value, status: r.status };
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface LatestLab {
  marker: LiverMarker;
  value: number;
  status: LabStatus;
  date: string;
  unit: string;
}

/** The newest value of each liver test, in the order the design lists them. */
export function latestLabs(panels: readonly LabPanel[]): LatestLab[] {
  const out: LatestLab[] = [];
  for (const marker of LIVER_MARKERS) {
    let best: (LabValue & { date: string }) | null = null;
    for (const p of panels) {
      const v = p.values[marker];
      if (v && (!best || p.date > best.date)) best = { ...v, date: p.date };
    }
    if (best)
      out.push({
        marker,
        value: best.value,
        status: best.status,
        date: best.date,
        unit: biomarkerByKey(marker)?.unit ?? "",
      });
  }
  return out;
}

/** One test's history as chart points (drawn only when 2+ days exist at the call site). */
export function liverSeries(
  rows: readonly LiverLabRow[],
  marker: LiverMarker,
): ChartPoint[] {
  return markerSeries(
    rows.map((r) => ({
      marker_key: r.marker_key,
      value_std: r.value_std,
      status: r.status,
      collected_on: r.collected_on,
    })),
    marker,
  );
}

/** Tests with at least two days of results, in the design's order. */
export function trendableLiver(rows: readonly LiverLabRow[]): LiverMarker[] {
  return LIVER_MARKERS.filter((m) => liverSeries(rows, m).length >= 2);
}

/** FIB-4 on each day that has AST, ALT and platelets; the age is the age on that day. */
export function fib4Series(
  panels: readonly LabPanel[],
  birthYear: number | null,
): ChartPoint[] {
  if (birthYear === null) return [];
  const out: ChartPoint[] = [];
  for (const p of panels) {
    const { ast, alt, platelets } = p.values;
    if (!ast || !alt || !platelets) continue;
    const r = fib4({
      age: Number(p.date.slice(0, 4)) - birthYear,
      ast: ast.value,
      alt: alt.value,
      platelets: platelets.value,
    });
    if (r.status === "ok")
      out.push({
        date: p.date,
        value: r.value,
        status:
          r.band === "high"
            ? "abnormal"
            : r.band === "intermediate"
              ? "watch"
              : "normal",
      });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export type TrendKind = "rising" | "falling" | "persistent";
export interface TrendNote {
  marker: LiverMarker;
  kind: TrendKind;
}

/**
 * Plain observations about movement, found by code: a 20 % climb over the last
 * three results that ends outside the range (or a 20 % fall, for albumin and
 * platelets), or the last two results both outside it. The wording that goes with
 * a note never names a cause or a disease — it only suggests taking the figures
 * to a doctor. 🔒 thresholds need doctor review.
 */
export function trendNotes(rows: readonly LiverLabRow[]): TrendNote[] {
  const notes: TrendNote[] = [];
  for (const marker of CORE_MARKERS) {
    const s = liverSeries(rows, marker);
    if (s.length < 2) continue;
    const last = s[s.length - 1];
    const prev = s[s.length - 2];
    const first = s[Math.max(0, s.length - 3)];
    const out = last.status === "watch" || last.status === "abnormal";
    const lowIsBad = marker === "albumin" || marker === "platelets";
    if (out && last.value !== null && first.value !== null) {
      if (!lowIsBad && last.value >= first.value * 1.2)
        notes.push({ marker, kind: "rising" });
      else if (lowIsBad && last.value <= first.value * 0.8)
        notes.push({ marker, kind: "falling" });
      else if (prev.status === "watch" || prev.status === "abnormal")
        notes.push({ marker, kind: "persistent" });
    }
  }
  return notes;
}

/** FIB-4 on the newest day that has AST, ALT and platelets (age on that day), or null when no day does. */
export function latestFib4(
  panels: readonly LabPanel[],
  birthYear: number | null,
): { date: string; score: ScoreResult } | null {
  const sorted = [...panels].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const p of sorted) {
    const { ast, alt, platelets } = p.values;
    if (!ast || !alt || !platelets) continue;
    return {
      date: p.date,
      score: fib4({
        age: birthYear === null ? null : Number(p.date.slice(0, 4)) - birthYear,
        ast: ast.value,
        alt: alt.value,
        platelets: platelets.value,
      }),
    };
  }
  return null;
}
