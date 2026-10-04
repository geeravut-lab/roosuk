"use server";

import { trackEvent } from "@/lib/analytics/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import {
  cleanPayerRef,
  cleanReviewNote,
  isBillingPeriod,
  isPaidTier,
  priceFor,
} from "@/lib/billing/payments";
import {
  isValidPromptpayId,
  normalizePromptpayId,
} from "@/lib/billing/promptpay";
import { AppError } from "@/lib/errors";
import { variantFor, variantTag } from "@/lib/paywall/paywall";
import { creditDiscount } from "@/lib/rewards/rewards";
import { loadBalance } from "@/lib/rewards/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";
import {
  paymentPaidNotice,
  paymentRejectedNotice,
  paymentToReviewNotice,
} from "@/lib/notify/messages";
import { dictFor, notifyAdmins, notifyUser } from "@/lib/notify/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FormState {
  error?: ErrorKey;
  ok?: boolean;
}

// ── payer side ───────────────────────────────────────────────────────────────

/**
 * Creates (or replaces) the user's draft order and sends them to its QR page.
 * The amount comes from platform_settings and is frozen on the row together
 * with the PromptPay id, so neither can be changed from the browser.
 */
export async function startPaymentAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const tier = formData.get("tier");
  const period = formData.get("period");
  if (!isPaidTier(tier) || !isBillingPeriod(period))
    redirect("/subscription?error=err_invalid_input");

  const { billing, promptpayId, rewards, paywallMode } =
    await loadPlatformSettings();
  const amount = priceFor(billing.pricing, tier, period);
  if (!promptpayId || amount <= 0)
    redirect("/subscription?error=err_payment_not_ready");

  // Reward credit the person chose to use: capped by the admin's per-use maximum, their balance and the price.
  const discount =
    formData.get("useCredit") === "on"
      ? creditDiscount({
          price: amount,
          balance: await loadBalance(user.id),
          maxPerUse: rewards.redeemMaxSubscriptionThb,
        })
      : 0;

  const db = createAdminClient();
  // One open draft per user (a unique index enforces it): the new order replaces the old.
  const { error: cancelError } = await db
    .from("payments")
    .update({ status: "cancelled" })
    .eq("user_id", user.id)
    .eq("status", "draft");
  if (cancelError) redirect("/subscription?error=err_save_failed");

  const { data, error } = await db
    .from("payments")
    .insert({
      user_id: user.id,
      plan_tier: tier,
      period,
      amount: amount - discount,
      credit_applied_thb: discount,
      promptpay_id: promptpayId,
    })
    .select("id");
  if (error || data?.length !== 1)
    redirect("/subscription?error=err_save_failed");

  await trackEvent(
    "order_created",
    user.id,
    variantTag(variantFor(user.id, paywallMode)),
  );
  redirect(`/subscription/pay/${data[0].id}`);
}

/**
 * "I have transferred": draft/rejected → review. This is a claim, not a
 * receipt — only an admin (confirm_payment) can mark a payment paid. The
 * payer reference is mandatory so the reviewer can find the transfer.
 */
export async function reportPaymentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const id = formData.get("paymentId");
  const ref = cleanPayerRef(formData.get("payerRef"));
  if (typeof id !== "string" || !UUID.test(id))
    return { error: "err_invalid_input" };
  if (!ref) return { error: "err_payer_ref_required" };

  // The credit this order was priced with is spent now (once; a repeat press spends nothing more).
  const spent = await createAdminClient().rpc("consume_payment_credit", {
    p_payment: id,
  });
  if (spent.error) return { error: "err_save_failed" };
  if (spent.data !== true) return { error: "err_credit_changed" };

  const { data, error } = await createAdminClient()
    .from("payments")
    .update({
      status: "review",
      payer_ref: ref,
      reported_at: new Date().toISOString(),
      reviewed_at: null,
      review_note: null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["draft", "rejected"])
    .select("id");
  if (error) return { error: "err_save_failed" };
  // Nothing matched: not theirs, or already reported/paid (e.g. a double click).
  if (data?.length !== 1) return { error: "err_payment_state" };

  await trackEvent(
    "payment_reported",
    user.id,
    variantTag(variantFor(user.id, (await loadPlatformSettings()).paywallMode)),
  );
  revalidatePath(`/subscription/pay/${id}`);
  revalidatePath("/subscription");
  revalidatePath("/admin/payments");

  // Tell the reviewers (never fails the payer's report: see notifyUser).
  const { data: pay } = await createAdminClient()
    .from("payments")
    .select("plan_tier, amount")
    .eq("id", id)
    .maybeSingle<{ plan_tier: "gold" | "premium"; amount: number }>();
  if (pay)
    await notifyAdmins(
      (t) =>
        paymentToReviewNotice(
          t,
          id,
          t[`planName_${pay.plan_tier}` as const],
          pay.amount,
          ref,
        ),
      user.id,
    );
  return { ok: true };
}

// ── admin side ───────────────────────────────────────────────────────────────

/** Admin saw the money arrive: grants the plan and writes the ledger in one SQL transaction. */
export async function confirmPaymentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("paymentId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");

  const { data, error } = await createAdminClient().rpc("confirm_payment", {
    p_payment: id,
    p_admin: admin.id,
  });
  if (error) throw new AppError("err_save_failed");
  const result = data as {
    ok?: boolean;
    granted?: boolean;
    plan_tier?: "gold" | "premium";
    ends_at?: string;
  } | null;
  if (!result?.ok) throw new AppError("err_payment_state");

  if (result.granted) {
    const { data: pay } = await createAdminClient()
      .from("payments")
      .select("user_id")
      .eq("id", id)
      .maybeSingle<{ user_id: string | null }>();
    if (pay?.user_id) {
      await trackEvent(
        "subscribed",
        pay.user_id,
        variantTag(
          variantFor(pay.user_id, (await loadPlatformSettings()).paywallMode),
        ),
      );
      const { t, lang } = await dictFor(pay.user_id);
      await notifyUser(
        pay.user_id,
        paymentPaidNotice(
          t,
          lang,
          id,
          t[`planName_${result.plan_tier ?? "gold"}` as const],
          result.ends_at ? new Date(result.ends_at) : null,
        ),
      );
    }
  }

  revalidatePath("/admin/payments");
}

/** "Transfer not found": back to the payer with a reason; they can report again. */
export async function rejectPaymentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("paymentId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");

  const { data, error } = await createAdminClient()
    .from("payments")
    .update({
      status: "rejected",
      review_note: cleanReviewNote(formData.get("note")),
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
    })
    .eq("id", id)
    .eq("status", "review")
    .select("id, user_id");
  if (error) throw new AppError("err_save_failed");
  if (data?.length !== 1) throw new AppError("err_payment_state");

  // A rejected transfer gives the credit back (it is spent again if they report again).
  await createAdminClient().rpc("refund_payment_credit", { p_payment: id });

  const payer = (data[0] as { user_id: string | null }).user_id;
  if (payer) {
    const { t } = await dictFor(payer);
    await notifyUser(
      payer,
      paymentRejectedNotice(t, id, cleanReviewNote(formData.get("note"))),
    );
  }

  revalidatePath("/admin/payments");
}

/** Sets (or clears) the PromptPay id the QR pays into. Empty = payments closed. */
export async function setPromptpayIdAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();

  const raw = String(formData.get("promptpayId") ?? "").trim();
  const id = raw === "" ? null : normalizePromptpayId(raw);
  if (id !== null && !isValidPromptpayId(id))
    return { error: "err_invalid_promptpay" };

  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .update({
      promptpay_id: id,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  if (error || data?.length !== 1) return { error: "err_save_failed" };

  invalidatePlatformSettingsCache();
  revalidatePath("/admin/payments");
  return { ok: true };
}
