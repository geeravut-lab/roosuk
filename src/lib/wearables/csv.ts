import { OBS_TYPES, isObsType, type RawObservation } from "./types";

/**
 * A plain CSV the person can make in any spreadsheet: `date,type,value` (a
 * `unit` column is allowed and ignored — values must be in the units of
 * OBS_TYPES). One row per reading.
 */
export const CSV_MAX_ROWS = 5000;

export const CSV_TEMPLATE =
  "date,type,value\n2026-10-01,steps,8200\n2026-10-01,resting_heart_rate,62\n2026-10-01,sleep_minutes,420\n";

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export type CsvParse =
  | { ok: true; rows: RawObservation[]; skipped: number }
  | { ok: false; reason: "header" | "empty" | "too_many" };

export function parseObservationCsv(text: string): CsvParse {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return { ok: false, reason: "empty" };
  const head = splitLine(lines[0]).map((h) => h.toLowerCase());
  const di = head.indexOf("date");
  const ti = head.indexOf("type");
  const vi = head.indexOf("value");
  if (di < 0 || ti < 0 || vi < 0) return { ok: false, reason: "header" };
  if (lines.length - 1 > CSV_MAX_ROWS) return { ok: false, reason: "too_many" };
  const rows: RawObservation[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = splitLine(line);
    const type = (c[ti] ?? "").toLowerCase();
    const value = Number(c[vi]);
    const date = c[di] ?? "";
    if (!isObsType(type) || !Number.isFinite(value) || !date) {
      skipped++;
      continue;
    }
    rows.push({
      type,
      value,
      start: date,
      device: "CSV",
      // one reading per type and day from this file; importing it again replaces, not repeats
      external_id: `${type}:${date}`,
    });
  }
  return { ok: true, rows, skipped };
}

export const CSV_TYPES = Object.keys(OBS_TYPES);
