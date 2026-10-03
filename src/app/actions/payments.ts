"use server";

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
import type { ErrorKey } from "@/lib/i18n/dict";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";
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

  const { billing, promptpayId } = await loadPlatformSettings();
  const amount = priceFor(billing.pricing, tier, period);
  if (!promptpayId || amount <= 0)
    redirect("/subscription?error=err_payment_not_ready");

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
      amount,
      promptpay_id: promptpayId,
    })
    .select("id");
  if (error || data?.length !== 1)
    redirect("/subscription?error=err_save_failed");

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

  revalidatePath(`/subscription/pay/${id}`);
  revalidatePath("/subscription");
  revalidatePath("/admin/payments");
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
  if (!(data as { ok?: boolean } | null)?.ok)
    throw new AppError("err_payment_state");

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
    .select("id");
  if (error) throw new AppError("err_save_failed");
  if (data?.length !== 1) throw new AppError("err_payment_state");

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
