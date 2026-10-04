import { createHash } from "node:crypto";
import type { Pricing } from "@/config/plans";

/**
 * Paywall A/B. Same plans, same prices, same options in both — only the order
 * and wording differ, so nobody is offered a worse deal than anybody else:
 *   a (control): the monthly price first;
 *   b: the yearly price first, with what it saves, and a plain reminder that the
 *      free plan stays free.
 * A person's version is fixed by their id (it never flips between visits), and
 * every funnel event carries it, so the admin can compare the two.
 */
export type PaywallVariant = "a" | "b";
export type PaywallMode = "off" | "ab" | "a" | "b";
export const PAYWALL_MODES: readonly PaywallMode[] = ["off", "ab", "a", "b"];

export const isPaywallMode = (v: unknown): v is PaywallMode =>
  typeof v === "string" && (PAYWALL_MODES as readonly string[]).includes(v);

export function variantFor(userId: string, mode: PaywallMode): PaywallVariant {
  if (mode === "a" || mode === "b") return mode;
  if (mode === "off") return "a";
  // first byte of a hash: even → a, odd → b; stable and unrelated to when someone signed up
  return createHash("sha256").update(`paywall:${userId}`).digest()[0] % 2 === 0
    ? "a"
    : "b";
}

/** The tag stored on analytics events (letters, digits, underscore only). */
export const variantTag = (v: PaywallVariant) => `pw_${v}`;

/** Whole percent the yearly price saves against twelve monthly payments; 0 when it saves nothing. */
export function yearlySavingPercent(monthly: number, yearly: number): number {
  if (!(monthly > 0) || !(yearly > 0)) return 0;
  const p = Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
  return p > 0 && p < 100 ? p : 0;
}

export function savingFor(pricing: Pricing, tier: "gold" | "premium"): number {
  return tier === "gold"
    ? yearlySavingPercent(pricing.goldMonthly, pricing.goldYearly)
    : yearlySavingPercent(pricing.premiumMonthly, pricing.premiumYearly);
}

export interface VariantStats {
  viewed: number;
  ordered: number;
  reported: number;
  subscribed: number;
}

export const emptyStats = (): VariantStats => ({
  viewed: 0,
  ordered: 0,
  reported: 0,
  subscribed: 0,
});

const STEP: Record<string, keyof VariantStats> = {
  paywall_viewed: "viewed",
  order_created: "ordered",
  payment_reported: "reported",
  subscribed: "subscribed",
};

/** Distinct people per step and version, from the funnel events' (user, event, tag) rows. */
export function tally(
  rows: readonly {
    user_id: string | null;
    event: string;
    detail: string | null;
  }[],
): Record<PaywallVariant, VariantStats> {
  const seen: Record<string, Set<string>> = {};
  const out = { a: emptyStats(), b: emptyStats() };
  for (const r of rows) {
    const step = STEP[r.event];
    const v = r.detail === "pw_a" ? "a" : r.detail === "pw_b" ? "b" : null;
    if (!step || !v || !r.user_id) continue;
    const key = `${v}:${step}`;
    (seen[key] ??= new Set()).add(r.user_id);
  }
  for (const [key, set] of Object.entries(seen)) {
    const [v, step] = key.split(":") as [PaywallVariant, keyof VariantStats];
    out[v][step] = set.size;
  }
  return out;
}

/** a/b as a percentage with one decimal, or null when there is nobody to divide by. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** Below this many viewers per version, any difference is noise. */
export const MIN_VIEWERS = 30;
