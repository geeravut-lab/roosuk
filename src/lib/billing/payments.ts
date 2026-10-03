import type { Pricing } from "@/config/plans";

export type PaidTier = "gold" | "premium";
export type BillingPeriod = "monthly" | "yearly";
export type PaymentStatus =
  "draft" | "review" | "paid" | "rejected" | "cancelled";

export interface PaymentRow {
  id: string;
  user_id: string | null;
  plan_tier: PaidTier;
  period: BillingPeriod;
  amount: number;
  promptpay_id: string;
  status: PaymentStatus;
  payer_ref: string | null;
  reported_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  paid_at: string | null;
  created_at: string;
}

export const PAYMENT_COLUMNS =
  "id, user_id, plan_tier, period, amount, promptpay_id, status, payer_ref, reported_at, reviewed_at, review_note, paid_at, created_at";

export function isPaidTier(v: unknown): v is PaidTier {
  return v === "gold" || v === "premium";
}

export function isBillingPeriod(v: unknown): v is BillingPeriod {
  return v === "monthly" || v === "yearly";
}

/** The price is always read from settings on the server — never from the client. */
export function priceFor(
  pricing: Pricing,
  tier: PaidTier,
  period: BillingPeriod,
): number {
  if (tier === "gold")
    return period === "yearly" ? pricing.goldYearly : pricing.goldMonthly;
  return period === "yearly" ? pricing.premiumYearly : pricing.premiumMonthly;
}

/** The payer reference the reviewer will search the statement for. */
export function cleanPayerRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/\s+/g, " ");
  return v.length >= 1 && v.length <= 80 ? v : null;
}

export function cleanReviewNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length === 0 ? null : v.slice(0, 500);
}

/** A payment waiting on the payer to (re)report a transfer. */
export function canReport(status: PaymentStatus): boolean {
  return status === "draft" || status === "rejected";
}
