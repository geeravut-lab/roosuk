import { z } from "zod";

/** The admin's numbers (platform_settings), in whole baht. Each falls back to its default if missing or out of range. */
export interface RewardSettings {
  referralThb: number;
  refereeThb: number;
  challengeThb: number;
  /** most one payment can be reduced by credit (subscription) */
  redeemMaxSubscriptionThb: number;
  /** most one purchase of a product/service can be reduced by credit (shown now, used when those exist) */
  redeemMaxOtherThb: number;
  referralMinCheckinDays: number;
  referralMaxRewards: number;
  challengeMaxRewardsPerMonth: number;
}

export const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  referralThb: 10,
  refereeThb: 0,
  challengeThb: 15,
  redeemMaxSubscriptionThb: 10,
  redeemMaxOtherThb: 20,
  referralMinCheckinDays: 3,
  referralMaxRewards: 20,
  challengeMaxRewardsPerMonth: 4,
};

const num = (fallback: number, min: number, max: number) =>
  z
    .preprocess(
      (v) => (v === null || v === "" ? undefined : v),
      z.coerce.number().int().min(min).max(max),
    )
    .catch(fallback);

export function parseRewardSettings(
  row: Record<string, unknown> | null | undefined,
): RewardSettings {
  const d = DEFAULT_REWARD_SETTINGS;
  const r = row ?? {};
  return {
    referralThb: num(d.referralThb, 0, 1000).parse(r.reward_referral_thb),
    refereeThb: num(d.refereeThb, 0, 1000).parse(r.reward_referee_thb),
    challengeThb: num(d.challengeThb, 0, 1000).parse(r.reward_challenge_thb),
    redeemMaxSubscriptionThb: num(d.redeemMaxSubscriptionThb, 0, 100000).parse(
      r.redeem_max_subscription_thb,
    ),
    redeemMaxOtherThb: num(d.redeemMaxOtherThb, 0, 100000).parse(
      r.redeem_max_other_thb,
    ),
    referralMinCheckinDays: num(d.referralMinCheckinDays, 1, 30).parse(
      r.referral_min_checkin_days,
    ),
    referralMaxRewards: num(d.referralMaxRewards, 0, 1000).parse(
      r.referral_max_rewards,
    ),
    challengeMaxRewardsPerMonth: num(
      d.challengeMaxRewardsPerMonth,
      0,
      100,
    ).parse(r.challenge_max_rewards_per_month),
  };
}

/** The admin form → column values, or null with the first bad field named. */
export const REWARD_FIELDS = [
  { field: "referralThb", column: "reward_referral_thb", min: 0, max: 1000 },
  { field: "refereeThb", column: "reward_referee_thb", min: 0, max: 1000 },
  { field: "challengeThb", column: "reward_challenge_thb", min: 0, max: 1000 },
  {
    field: "redeemMaxSubscriptionThb",
    column: "redeem_max_subscription_thb",
    min: 0,
    max: 100000,
  },
  {
    field: "redeemMaxOtherThb",
    column: "redeem_max_other_thb",
    min: 0,
    max: 100000,
  },
  {
    field: "referralMinCheckinDays",
    column: "referral_min_checkin_days",
    min: 1,
    max: 30,
  },
  {
    field: "referralMaxRewards",
    column: "referral_max_rewards",
    min: 0,
    max: 1000,
  },
  {
    field: "challengeMaxRewardsPerMonth",
    column: "challenge_max_rewards_per_month",
    min: 0,
    max: 100,
  },
] as const satisfies readonly {
  field: keyof RewardSettings;
  column: string;
  min: number;
  max: number;
}[];

export function parseRewardForm(
  get: (name: string) => unknown,
):
  { ok: true; columns: Record<string, number> } | { ok: false; field: string } {
  const columns: Record<string, number> = {};
  for (const f of REWARD_FIELDS) {
    const raw = get(f.field);
    const s = typeof raw === "string" ? raw.trim() : "";
    const n = Number(s);
    if (s === "" || !Number.isInteger(n) || n < f.min || n > f.max)
      return { ok: false, field: f.field };
    columns[f.column] = n;
  }
  return { ok: true, columns };
}

/**
 * How much credit this payment may use: the smaller of what the person has, the
 * admin's per-use maximum, and the price less one baht (a payment must stay
 * above zero). Never negative, never a fraction.
 */
export function creditDiscount(a: {
  price: number;
  balance: number;
  maxPerUse: number;
}): number {
  const d = Math.min(
    Math.floor(a.balance),
    Math.floor(a.maxPerUse),
    Math.floor(a.price) - 1,
  );
  return Number.isFinite(d) && d > 0 ? d : 0;
}

const CODE_RE = /^[2-9A-HJ-NP-Z]{6,10}$/;

/** A referral code as typed by a person or found in a link: upper-cased, spaces and look-alike letters tidied; null when it cannot be one. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  return CODE_RE.test(v) ? v : null;
}

export const REFERRAL_COOKIE = "roosuk-ref";

export type LedgerKind =
  | "referral_reward"
  | "referee_bonus"
  | "challenge_reward"
  | "redeem_subscription"
  | "redeem_refund"
  | "redeem_other"
  | "admin_adjust";
