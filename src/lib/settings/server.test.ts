import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ maybeSingle }) }),
  }),
}));

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
    expect(await loadPlatformSettings()).toEqual({
      featureFlags: { voice: false },
      manualUrl: "https://x.example",
    });
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
    expect(await loadPlatformSettings()).toEqual({
      featureFlags: {},
      manualUrl: "",
    });
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
