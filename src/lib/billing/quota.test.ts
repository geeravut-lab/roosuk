import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { BillingProfile } from "./plan";
import { consumeQuota, type ConsumeArgs, type QuotaDeps } from "./quota";
import { DEFAULT_BILLING_SETTINGS, type BillingSettings } from "./settings";

const NOW = new Date("2026-11-20T05:00:00Z"); // 20 Nov 2026, Bangkok
const iso = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();
const base: BillingProfile = {
  plan_tier: "free",
  plan_expires_at: null,
  trial_started_at: null,
  trial_ends_at: null,
  ai_suspended: false,
};

function setup(
  profile: BillingProfile | null,
  settings: Partial<BillingSettings> = {},
  consumeResult: unknown = { allowed: true, reason: "ok", used: 1 },
) {
  const consume = vi.fn<
    (
      a: ConsumeArgs,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  >(async () => ({ data: consumeResult, error: null }));
  const deps: QuotaDeps = {
    loadProfile: async () => profile,
    loadSettings: async () => ({ ...DEFAULT_BILLING_SETTINGS, ...settings }),
    consume,
  };
  return { deps, consume };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("consumeQuota", () => {
  it("sends the Free-lite chat limit and this month's window to the counter", async () => {
    const { deps, consume } = setup(base);
    const d = await consumeQuota("u1", "aiChat", deps, NOW);
    expect(d).toMatchObject({ allowed: true, limit: 5 });
    expect(consume).toHaveBeenCalledWith({
      user: "u1",
      feature: "aiChat",
      month: "2026-11-01",
      windowStart: "2026-11-01",
      limit: 5,
      monthCap: 0,
    });
  });

  it("uses the quarter window for the Free-lite quiz", async () => {
    const { deps, consume } = setup(base);
    await consumeQuota("u1", "healthQuiz", deps, NOW);
    expect(consume.mock.calls[0][0]).toMatchObject({
      month: "2026-11-01",
      windowStart: "2026-10-01",
      limit: 1,
    });
  });

  it("trial users get Premium (unlimited, but counted) under the trial fair-use cap", async () => {
    const { deps, consume } = setup(
      { ...base, trial_started_at: iso(-3), trial_ends_at: iso(11) },
      { fairUseCapTrial: 123 },
    );
    const d = await consumeQuota("u1", "foodSnap", deps, NOW);
    expect(d).toMatchObject({
      allowed: true,
      limit: "unlimited",
      plan: { tier: "premium", source: "trial" },
    });
    expect(consume.mock.calls[0][0]).toMatchObject({
      limit: null,
      monthCap: 123,
    });
  });

  it("paid Premium is unlimited under the premium cap; paid Gold has per-feature limits and no cap", async () => {
    const premium = setup(
      { ...base, plan_tier: "premium", plan_expires_at: iso(9) },
      { fairUseCapPremium: 77 },
    );
    await consumeQuota("u1", "aiChat", premium.deps, NOW);
    expect(premium.consume.mock.calls[0][0]).toMatchObject({
      limit: null,
      monthCap: 77,
    });

    const gold = setup({ ...base, plan_tier: "gold", plan_expires_at: iso(9) });
    await consumeQuota("u1", "foodSnap", gold.deps, NOW);
    expect(gold.consume.mock.calls[0][0]).toMatchObject({
      limit: 15,
      monthCap: 0,
    });
  });

  it("applies admin quota overrides", async () => {
    const { deps, consume } = setup(base, {
      planOverrides: { free: { aiChat: 9 } },
    });
    await consumeQuota("u1", "aiChat", deps, NOW);
    expect(consume.mock.calls[0][0].limit).toBe(9);
  });

  it("refuses with a translated error code when the counter says the quota is used up", async () => {
    const { deps } = setup(
      base,
      {},
      { allowed: false, reason: "quota_exhausted", used: 5 },
    );
    expect(await consumeQuota("u1", "aiChat", deps, NOW)).toMatchObject({
      allowed: false,
      reason: "quota_exhausted",
      error: "err_quota_exhausted",
    });
  });

  it("distinguishes the fair-use cap", async () => {
    const { deps } = setup(
      base,
      {},
      { allowed: false, reason: "fair_use", used: 2 },
    );
    expect(await consumeQuota("u1", "aiChat", deps, NOW)).toMatchObject({
      allowed: false,
      reason: "fair_use",
      error: "err_fair_use",
    });
  });

  it("a suspended account is refused before anything is counted — even on Premium", async () => {
    const { deps, consume } = setup({
      ...base,
      plan_tier: "premium",
      plan_expires_at: iso(9),
      ai_suspended: true,
    });
    expect(await consumeQuota("u1", "aiChat", deps, NOW)).toMatchObject({
      allowed: false,
      reason: "suspended",
      error: "err_ai_suspended",
    });
    expect(consume).not.toHaveBeenCalled();
  });

  it("an expired paid plan and an ended trial both fall back to Free-lite limits", async () => {
    const { deps, consume } = setup({
      ...base,
      plan_tier: "gold",
      plan_expires_at: iso(-2),
      trial_started_at: iso(-20),
      trial_ends_at: iso(-6),
    });
    await consumeQuota("u1", "aiChat", deps, NOW);
    expect(consume.mock.calls[0][0].limit).toBe(5);
  });

  it("fails CLOSED when the counter errors or returns nonsense", async () => {
    const failing: QuotaDeps = {
      ...setup(base).deps,
      consume: async () => ({ data: null, error: { message: "db down" } }),
    };
    await expect(
      consumeQuota("u1", "aiChat", failing, NOW),
    ).rejects.toMatchObject({ code: "err_quota_unavailable" });
    const garbage = setup(base, {}, { hello: "world" });
    await expect(
      consumeQuota("u1", "aiChat", garbage.deps, NOW),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects an unknown user", async () => {
    await expect(
      consumeQuota("ghost", "aiChat", setup(null).deps, NOW),
    ).rejects.toMatchObject({ code: "err_not_signed_in" });
  });
});
