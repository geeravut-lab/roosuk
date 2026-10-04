import type { RawObservation } from "./types";

/**
 * Apple Health `export.xml` → one reading per day and type, worked out in the
 * browser while the file streams past (an export can be hundreds of MB, and it
 * never leaves the phone as such: only these daily figures are sent).
 *
 * Phone and watch both record steps and sleep, so per day each SOURCE is summed on
 * its own and the largest one wins — a safe stand-in for Apple's own de-duplication.
 */
const QUANTITY: Record<string, string> = {
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierHeartRate: "heart_rate",
  HKQuantityTypeIdentifierRestingHeartRate: "resting_heart_rate",
  HKQuantityTypeIdentifierBodyMass: "weight_kg",
  HKQuantityTypeIdentifierBloodPressureSystolic: "bp_systolic",
  HKQuantityTypeIdentifierBloodPressureDiastolic: "bp_diastolic",
  HKQuantityTypeIdentifierBloodGlucose: "blood_glucose",
  HKQuantityTypeIdentifierOxygenSaturation: "spo2",
};
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const ASLEEP = /Asleep/; // …AsleepCore / Deep / REM / Unspecified (and the old plain Asleep); not InBed, not Awake

const ATTR = /(\w+)="([^"]*)"/g;

function attrs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of line.matchAll(ATTR)) out[m[1]] = m[2];
  return out;
}

/** "2026-10-01 07:50:00 +0700" → ms since epoch, or null */
function parseAppleDate(s: string | undefined): number | null {
  const m =
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/.exec(
      s ?? "",
    );
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`);
  return Number.isNaN(t) ? null : t;
}

function toUnit(type: string, value: number, unit: string): number {
  if (type === "weight_kg" && /^lb/i.test(unit)) return value * 0.45359237;
  if (type === "blood_glucose" && /mmol/i.test(unit)) return value * 18.016;
  if (type === "spo2" && value <= 1) return value * 100;
  return value;
}

interface Acc {
  sumBySource: Map<string, number>;
  total: number;
  n: number;
  last: number;
  lastAt: number;
}

export class AppleHealthAggregator {
  private tail = "";
  private days = new Map<string, Acc>();
  /** records read, and records kept (inside the window and a type we use) */
  seen = 0;
  kept = 0;

  /** `sinceDay` (YYYY-MM-DD): older days are skipped. */
  constructor(private readonly sinceDay: string) {}

  /** Feed text as it arrives; a record may be cut in two between pushes. */
  push(chunk: string): void {
    const text = this.tail + chunk;
    const cut = text.lastIndexOf("\n");
    if (cut === -1) {
      this.tail = text.length > 20_000 ? "" : text; // a runaway line is not a record
      return;
    }
    this.tail = text.slice(cut + 1);
    for (const line of text.slice(0, cut).split("\n")) this.line(line);
  }

  private line(line: string): void {
    if (!line.includes("<Record ")) return;
    this.seen++;
    const a = attrs(line);
    const kind = a.type;
    if (!kind) return;
    const start = parseAppleDate(a.startDate);
    const end = parseAppleDate(a.endDate);
    if (start === null || end === null) return;
    const source = a.sourceName ?? "?";

    let type: string | undefined;
    let value: number;
    let day: string;
    if (kind === SLEEP) {
      if (!ASLEEP.test(a.value ?? "") || end <= start) return;
      type = "sleep_minutes";
      value = (end - start) / 60_000;
      day = (a.endDate ?? "").slice(0, 10); // the night belongs to the day you woke up
    } else {
      type = QUANTITY[kind];
      if (!type) return;
      const raw = Number(a.value);
      if (!Number.isFinite(raw)) return;
      value = toUnit(type, raw, a.unit ?? "");
      day = (a.startDate ?? "").slice(0, 10);
    }
    if (day < this.sinceDay) return;
    this.kept++;
    const key = `${type}|${day}`;
    let acc = this.days.get(key);
    if (!acc) {
      acc = { sumBySource: new Map(), total: 0, n: 0, last: 0, lastAt: 0 };
      this.days.set(key, acc);
    }
    acc.sumBySource.set(source, (acc.sumBySource.get(source) ?? 0) + value);
    acc.total += value;
    acc.n++;
    if (start >= acc.lastAt) {
      acc.lastAt = start;
      acc.last = value;
    }
  }

  /** The daily readings, oldest first. Call once, after the last push. */
  finish(): RawObservation[] {
    if (this.tail) this.line(this.tail);
    this.tail = "";
    const out: RawObservation[] = [];
    for (const [key, acc] of this.days) {
      const [type, day] = key.split("|");
      let value: number;
      if (type === "steps" || type === "sleep_minutes")
        value = Math.max(...acc.sumBySource.values());
      else if (type === "weight_kg") value = acc.last;
      else value = acc.total / acc.n; // heart rate, blood pressure, glucose, SpO2: the day's average
      out.push({
        type,
        value: Math.round(value * 100) / 100,
        start: day,
        device: "Apple Health",
        external_id: `${type}:${day}`,
      });
    }
    return out.sort(
      (x, y) => x.start.localeCompare(y.start) || x.type.localeCompare(y.type),
    );
  }
}

/** Convenience for tests and small files. */
export function aggregateAppleXml(
  xml: string,
  sinceDay: string,
): RawObservation[] {
  const agg = new AppleHealthAggregator(sinceDay);
  agg.push(xml);
  return agg.finish();
}
