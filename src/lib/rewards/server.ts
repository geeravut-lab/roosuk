import "server-only";
import { cookies } from "next/headers";
import { dictFor, notifyUser } from "@/lib/notify/server";
import { rewardEarnedNotice } from "@/lib/notify/messages";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  REFERRAL_COOKIE,
  normalizeReferralCode,
  type LedgerKind,
} from "./rewards";

export interface LedgerRow {
  id: number;
  kind: LedgerKind;
  amount_thb: number;
  created_at: string;
}

export interface Wallet {
  balance: number;
  ledger: LedgerRow[];
  code: string;
  invited: number;
  qualified: number;
  /** the person was invited by someone (so the "enter a code" form is not offered) */
  referred: boolean;
}

/** The person's wallet, from their own rows (RLS), plus their code (made on first need). */
export async function loadWallet(userId: string): Promise<Wallet> {
  const supabase = await createClient();
  const { data: code } = await createAdminClient().rpc("ensure_referral_code", {
    p_user: userId,
  });
  const [{ data: ledger }, { data: referrals }] = await Promise.all([
    supabase
      .from("reward_ledger")
      .select("id, kind, amount_thb, created_at")
      .order("id", { ascending: false })
      .limit(500)
      .returns<LedgerRow[]>(),
    supabase
      .from("referrals")
      .select("referee_id, referrer_id, qualified_at")
      .returns<
        {
          referee_id: string;
          referrer_id: string | null;
          qualified_at: string | null;
        }[]
      >(),
  ]);
  const rows = ledger ?? [];
  const mine = (referrals ?? []).filter((r) => r.referrer_id === userId);
  return {
    balance: rows.reduce((n, r) => n + r.amount_thb, 0),
    ledger: rows.slice(0, 30),
    code: typeof code === "string" ? code : "",
    invited: mine.length,
    qualified: mine.filter((r) => r.qualified_at).length,
    referred: (referrals ?? []).some((r) => r.referee_id === userId),
  };
}

/** Just the balance (checkout needs nothing else). */
export async function loadBalance(userId: string): Promise<number> {
  const { data } = await createAdminClient()
    .from("reward_ledger")
    .select("amount_thb")
    .eq("user_id", userId)
    .limit(5000)
    .returns<{ amount_thb: number }[]>();
  return (data ?? []).reduce((n, r) => n + r.amount_thb, 0);
}

export type AttachResult = "ok" | "invalid" | "self" | "already" | "too_late";

export async function attachReferral(
  userId: string,
  rawCode: unknown,
): Promise<AttachResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return "invalid";
  const { data, error } = await createAdminClient().rpc("attach_referral", {
    p_referee: userId,
    p_code: code,
  });
  if (error) {
    console.error("[referral] attach failed:", error.message);
    return "invalid";
  }
  return (["ok", "invalid", "self", "already", "too_late"] as const).includes(
    data as AttachResult,
  )
    ? (data as AttachResult)
    : "invalid";
}

/** After consent: a code remembered from an invite link (cookie) is attached once, then forgotten. */
export async function attachReferralFromCookie(userId: string): Promise<void> {
  try {
    const store = await cookies();
    const code = store.get(REFERRAL_COOKIE)?.value;
    if (!code) return;
    await attachReferral(userId, code);
    store.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 });
  } catch (err) {
    // Setting a cookie is not allowed in every render context; the attach itself already happened.
    console.warn("[referral] cookie cleanup skipped:", err);
  }
}

/**
 * Called when an invited person shows up (Today): once they have checked in
 * enough days the reward is earned — in SQL, once — and the inviter is told.
 */
export async function maybeQualifyReferral(userId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: pending } = await db
      .from("referrals")
      .select("referee_id")
      .eq("referee_id", userId)
      .is("qualified_at", null)
      .maybeSingle();
    if (!pending) return;
    const { data, error } = await db.rpc("qualify_referral", {
      p_referee: userId,
    });
    if (error) throw error;
    const r = data as {
      qualified?: boolean;
      referrer?: string;
      referrer_amount?: number;
      referee_amount?: number;
    } | null;
    if (!r?.qualified) return;
    if (r.referrer && (r.referrer_amount ?? 0) > 0) {
      const { t } = await dictFor(r.referrer);
      await notifyUser(
        r.referrer,
        rewardEarnedNotice(t, "referral", r.referrer_amount as number, userId),
      );
    }
    if ((r.referee_amount ?? 0) > 0) {
      const { t } = await dictFor(userId);
      await notifyUser(
        userId,
        rewardEarnedNotice(t, "referee", r.referee_amount as number, userId),
      );
    }
  } catch (err) {
    console.error("[referral] qualify failed:", err);
  }
}
