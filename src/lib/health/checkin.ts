import { z } from "zod";

/**
 * The daily check-in: five taps, no typing (docs: Cal AI-style zero friction).
 * Sleep and activity are bands, the rest a 1–5 feeling scale. Nothing here asks
 * about weight or body shape — the habit loop rewards consistency only.
 */
export const SLEEP_BANDS = [1, 2, 3, 4] as const; // <5 h · 5–6 h · 7–8 h · 9+ h
export const ACTIVITY_BANDS = [1, 2, 3, 4] as const; // none · <30 min · 30–60 min · 60+ min
export const SCALE = [1, 2, 3, 4, 5] as const;

export interface CheckinAnswers {
  sleep_band: number;
  activity_band: number;
  energy: number;
  mood: number;
  nutrition: number;
}

export interface CheckinRow extends CheckinAnswers {
  checkin_date: string;
}

export const CHECKIN_COLUMNS =
  "checkin_date, sleep_band, activity_band, energy, mood, nutrition";

const pick = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max);

const schema = z.object({
  sleep_band: pick(1, 4),
  activity_band: pick(1, 4),
  energy: pick(1, 5),
  mood: pick(1, 5),
  nutrition: pick(1, 5),
});

export function parseCheckinForm(
  formData: FormData,
): { ok: true; answers: CheckinAnswers } | { ok: false } {
  // Missing fields must fail: z.coerce.number() would turn null into 0 — but 0 is out of range, so it does.
  const parsed = schema.safeParse({
    sleep_band: formData.get("sleep_band"),
    activity_band: formData.get("activity_band"),
    energy: formData.get("energy"),
    mood: formData.get("mood"),
    nutrition: formData.get("nutrition"),
  });
  return parsed.success ? { ok: true, answers: parsed.data } : { ok: false };
}
