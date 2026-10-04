import { describe, expect, it } from "vitest";
import { dailySeries, passportDays } from "./series";

const r = (
  type: string,
  value: number,
  start_at: string,
  source = "apple_health",
) => ({
  type,
  value,
  start_at,
  source,
});

describe("dailySeries", () => {
  it("takes the larger source for steps and sleep, and averages readings", () => {
    const s = dailySeries([
      r("steps", 3000, "2026-10-01T00:00:00+07:00", "apple_health"),
      r("steps", 5200, "2026-10-01T00:00:00+07:00", "health_connect"),
      r("heart_rate", 60, "2026-10-01T10:00:00+07:00", "api"),
      r("heart_rate", 80, "2026-10-01T11:00:00+07:00", "api"),
      r("steps", 100, "2026-10-02T00:00:00+07:00"),
    ]);
    expect(s.steps).toEqual([
      { date: "2026-10-01", value: 5200 },
      { date: "2026-10-02", value: 100 },
    ]);
    expect(s.heart_rate).toEqual([{ date: "2026-10-01", value: 70 }]);
  });

  it("puts a reading on its Bangkok day, not its UTC day", () => {
    const s = dailySeries([r("steps", 10, "2026-10-01T18:30:00Z")]); // 01:30 on the 2nd in Bangkok
    expect(s.steps).toEqual([{ date: "2026-10-02", value: 10 }]);
  });
});

describe("passportDays", () => {
  it("gathers steps, resting heart rate and sleep per day", () => {
    const days = passportDays(
      dailySeries([
        r("steps", 8000, "2026-10-01T00:00:00+07:00"),
        r("resting_heart_rate", 60, "2026-10-01T06:00:00+07:00"),
        r("sleep_minutes", 400, "2026-10-02T00:00:00+07:00"),
        r("weight_kg", 60, "2026-10-02T00:00:00+07:00"),
      ]),
    );
    expect(days).toEqual([
      { steps: 8000, restingHr: 60, sleepMinutes: null },
      { steps: null, restingHr: null, sleepMinutes: 400 },
    ]);
  });
});
