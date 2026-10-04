import { describe, expect, it } from "vitest";
import { METERED_FEATURES } from "@/config/plans";
import {
  fairUseCapFor,
  resolvePlan,
  summarizeUsage,
  bestGrant,
  withGrant,
  type BillingProfile,
} from "./plan";
import { windowStart } from "./period";

const NOW = new Date("2026-10-10T05:00:00Z");
const iso = (daysFromNow: number) =>
  new Date(NOW.getTime() + daysFromNow * 86_400_000).toISOString();

const profile = (over: Partial<BillingProfile> = {}): BillingProfile => ({
  plan_tier: "free",
  plan_expires_at: null,
  trial_started_at: null,
  trial_ends_at: null,
  ai_suspended: false,
  ...over,
});

describe("resolvePlan", () => {
  it("a new user who has not started a trial is Free-lite", () => {
    expect(resolvePlan(profile(), NOW)).toMatchObject({
      tier: "free",
      source: "free",
      trialEnded: false,
      trialDaysLeft: null,
    });
  });

  it("during the trial the user gets Premium and a day count (rounded up)", () => {
    const p = resolvePlan(
      profile({ trial_started_at: iso(-13), trial_ends_at: iso(1) }),
      NOW,
    );
    expect(p).toMatchObject({
      tier: "premium",
      source: "trial",
      trialDaysLeft: 1,
    });
    expect(
      resolvePlan(
        profile({ trial_started_at: iso(0), trial_ends_at: iso(14) }),
        NOW,
      ).trialDaysLeft,
    ).toBe(14);
    expect(
      resolvePlan(
        profile({ trial_started_at: iso(-14), trial_ends_at: iso(0.2) }),
        NOW,
      ).trialDaysLeft,
    ).toBe(1);
  });

  it("after the trial the user falls back to Free-lite and is marked as having had one", () => {
    expect(
      resolvePlan(
        profile({ trial_started_at: iso(-15), trial_ends_at: iso(-1) }),
        NOW,
      ),
    ).toMatchObject({
      tier: "free",
      source: "free",
      trialEnded: true,
    });
    // exactly at the end instant it is over
    expect(
      resolvePlan(
        profile({ trial_started_at: iso(-14), trial_ends_at: iso(0) }),
        NOW,
      ).source,
    ).toBe("free");
  });

  it("a live paid plan wins over a trial; an expired one is ignored", () => {
    const paid = resolvePlan(
      profile({
        plan_tier: "gold",
        plan_expires_at: iso(20),
        trial_started_at: iso(-3),
        trial_ends_at: iso(11),
      }),
      NOW,
    );
    expect(paid).toMatchObject({ tier: "gold", source: "paid" });
    const expired = resolvePlan(
      profile({ plan_tier: "gold", plan_expires_at: iso(-1) }),
      NOW,
    );
    expect(expired).toMatchObject({ tier: "free", source: "free" });
    // a paid tier with no expiry date is not trusted
    expect(
      resolvePlan(profile({ plan_tier: "premium", plan_expires_at: null }), NOW)
        .source,
    ).toBe("free");
  });

  it("an expired paid plan can still fall back to a live trial", () => {
    const p = resolvePlan(
      profile({
        plan_tier: "gold",
        plan_expires_at: iso(-1),
        trial_started_at: iso(-3),
        trial_ends_at: iso(11),
      }),
      NOW,
    );
    expect(p).toMatchObject({ tier: "premium", source: "trial" });
  });

  it("reports suspension independently of the plan", () => {
    expect(
      resolvePlan(
        profile({
          plan_tier: "premium",
          plan_expires_at: iso(5),
          ai_suspended: true,
        }),
        NOW,
      ).suspended,
    ).toBe(true);
  });
});

describe("fairUseCapFor", () => {
  const caps = { trial: 200, premium: 600 };
  it("caps trial and paid Premium, not Gold or Free-lite", () => {
    expect(
      fairUseCapFor(
        resolvePlan(
          profile({ trial_ends_at: iso(3), trial_started_at: iso(-11) }),
          NOW,
        ),
        caps,
      ),
    ).toBe(200);
    expect(
      fairUseCapFor(
        resolvePlan(
          profile({ plan_tier: "premium", plan_expires_at: iso(9) }),
          NOW,
        ),
        caps,
      ),
    ).toBe(600);
    expect(
      fairUseCapFor(
        resolvePlan(
          profile({ plan_tier: "gold", plan_expires_at: iso(9) }),
          NOW,
        ),
        caps,
      ),
    ).toBe(0);
    expect(fairUseCapFor(resolvePlan(profile(), NOW), caps)).toBe(0);
  });
});

describe("summarizeUsage", () => {
  const rows = [
    { feature: "aiChat", period_start: "2026-10-01", used: 4 },
    { feature: "aiChat", period_start: "2026-09-01", used: 30 }, // last month: must not count
    { feature: "healthQuiz", period_start: "2026-10-01", used: 1 },
    { feature: "foodSnap", period_start: "2026-10-01", used: 99 },
  ];
  const run = (tier: "free" | "gold" | "premium", month = "2026-10-01") =>
    Object.fromEntries(
      summarizeUsage(rows, tier, METERED_FEATURES, month, windowStart).map(
        (u) => [u.feature, u],
      ),
    );

  it("counts only the current window and shows remaining and percent", () => {
    const gold = run("gold");
    expect(gold.aiChat).toMatchObject({ used: 4, remaining: 26, percent: 13 });
    expect(gold.foodSnap).toMatchObject({
      used: 99,
      remaining: 0,
      percent: 100,
    });
  });

  it("uses the quarter for Free-lite's quiz", () => {
    expect(run("free", "2026-11-01").healthQuiz).toMatchObject({
      used: 1,
      remaining: 0,
      percent: 100,
    });
    expect(run("free", "2027-01-01").healthQuiz).toMatchObject({
      used: 0,
      remaining: 1,
    });
  });

  it("still reports usage for unlimited plans, with no percentage", () => {
    expect(run("premium").aiChat).toMatchObject({
      used: 4,
      remaining: "unlimited",
      percent: null,
    });
  });
});

describe("withGrant", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const base: BillingProfile = {
    plan_tier: "free",
    plan_expires_at: null,
    trial_started_at: "2026-09-01T00:00:00Z",
    trial_ends_at: "2026-09-15T00:00:00Z",
    ai_suspended: false,
  };
  const grant = { tier: "premium" as const, until: "2026-11-20T00:00:00Z" };

  it("lifts a free person to the granted plan until the grant ends", () => {
    const p = withGrant(base, grant, now);
    expect(p).toMatchObject({
      plan_tier: "premium",
      plan_expires_at: grant.until,
    });
    expect(resolvePlan(p, now)).toMatchObject({
      tier: "premium",
      source: "paid",
    });
    expect(resolvePlan(p, new Date("2026-11-21T00:00:00Z")).tier).toBe("free"); // and not a day longer
  });
  it("lifts Gold to Premium, but never lowers anyone", () => {
    const gold = {
      ...base,
      plan_tier: "gold" as const,
      plan_expires_at: "2026-12-01T00:00:00Z",
    };
    expect(withGrant(gold, grant, now).plan_tier).toBe("premium");
    const prem = {
      ...base,
      plan_tier: "premium" as const,
      plan_expires_at: "2026-12-01T00:00:00Z",
    };
    expect(withGrant(prem, { tier: "gold", until: grant.until }, now)).toBe(
      prem,
    );
    expect(withGrant(prem, grant, now)).toBe(prem); // their own live Premium stands
  });
  it("an expired own plan does not block a grant", () => {
    const lapsed = {
      ...base,
      plan_tier: "gold" as const,
      plan_expires_at: "2026-10-01T00:00:00Z",
    };
    expect(withGrant(lapsed, grant, now).plan_tier).toBe("premium");
  });
  it("ignores no grant, a free grant and a grant that has ended", () => {
    expect(withGrant(base, null, now)).toBe(base);
    expect(withGrant(base, { tier: "free", until: grant.until }, now)).toBe(
      base,
    );
    expect(
      withGrant(base, { tier: "premium", until: "2026-10-19T00:00:00Z" }, now),
    ).toBe(base);
  });
});

describe("bestGrant", () => {
  const g = (tier: "gold" | "premium", until: string) => ({ tier, until });
  it("takes the higher plan, then the later end, and copes with none", () => {
    expect(bestGrant(null, null)).toBeNull();
    expect(bestGrant(g("gold", "2026-12-01T00:00:00Z"), null)).toEqual(
      g("gold", "2026-12-01T00:00:00Z"),
    );
    expect(
      bestGrant(
        g("gold", "2027-01-01T00:00:00Z"),
        g("premium", "2026-11-01T00:00:00Z"),
      )?.tier,
    ).toBe("premium");
    expect(
      bestGrant(
        g("premium", "2026-11-01T00:00:00Z"),
        g("premium", "2026-12-01T00:00:00Z"),
      )?.until,
    ).toBe("2026-12-01T00:00:00Z");
  });
});
