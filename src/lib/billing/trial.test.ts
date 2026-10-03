import { describe, expect, it } from "vitest";
import { trialWindow } from "./trial";

describe("trialWindow", () => {
  it("runs for the configured number of days from the start instant", () => {
    const w = trialWindow(new Date("2026-10-04T10:00:00.000Z"), 14);
    expect(w).toEqual({
      startedAt: "2026-10-04T10:00:00.000Z",
      endsAt: "2026-10-18T10:00:00.000Z",
    });
  });
});
