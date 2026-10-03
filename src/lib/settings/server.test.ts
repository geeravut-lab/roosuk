import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ maybeSingle }) }),
  }),
}));

import { DEFAULT_BILLING_SETTINGS } from "@/lib/billing/settings";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "./server";

beforeEach(() => {
  invalidatePlatformSettingsCache();
  maybeSingle.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("loadPlatformSettings", () => {
  it("reads flags and the manual URL from the database", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        feature_flags: { voice: false, bogus: false },
        manual_url: " https://x.example ",
      },
      error: null,
    });
    const settings = await loadPlatformSettings();
    expect(settings.featureFlags).toEqual({ voice: false });
    expect(settings.manualUrl).toBe("https://x.example");
    expect(settings.billing.trialDays).toBe(14); // column absent → default
  });

  it("reads billing columns from the same row", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        feature_flags: {},
        manual_url: "",
        trial_days: 7,
        price_gold_monthly: 59,
      },
      error: null,
    });
    const { billing } = await loadPlatformSettings();
    expect(billing.trialDays).toBe(7);
    expect(billing.pricing.goldMonthly).toBe(59);
    expect(billing.pricing.premiumMonthly).toBe(89); // untouched columns keep their defaults
  });

  it("caches the result for a short time", async () => {
    maybeSingle.mockResolvedValue({
      data: { feature_flags: {}, manual_url: "" },
      error: null,
    });
    await loadPlatformSettings();
    await loadPlatformSettings();
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("falls back to 'everything on' when the read fails and nothing was cached", async () => {
    maybeSingle.mockRejectedValue(new Error("db down"));
    const settings = await loadPlatformSettings();
    expect(settings.featureFlags).toEqual({});
    expect(settings.manualUrl).toBe("");
    expect(settings.billing).toEqual(DEFAULT_BILLING_SETTINGS);
  });

  it("keeps the last known values when a later read fails", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { feature_flags: { voice: false }, manual_url: "" },
      error: null,
    });
    const first = await loadPlatformSettings();
    expect(first.featureFlags).toEqual({ voice: false });

    // Expire only the cache timestamp, not the remembered value.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    maybeSingle.mockRejectedValue(new Error("db down"));
    expect((await loadPlatformSettings()).featureFlags).toEqual({
      voice: false,
    });
    vi.useRealTimers();
  });
});
