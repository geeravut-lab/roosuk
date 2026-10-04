"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { trackEvent } from "@/lib/analytics/server";
import { requireUser } from "@/lib/auth/server";
import { cleanPayerRef } from "@/lib/billing/payments";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getLang } from "@/lib/i18n/server";
import { shopPaymentReviewNotice } from "@/lib/notify/messages";
import { notifyAdmins } from "@/lib/notify/server";
import { loadBalance } from "@/lib/rewards/server";
import { loadPlatformSettings } from "@/lib/settings/server";
import { loadCart, loadProduct } from "@/lib/shop/server";
import {
  MAX_CART_LINES,
  MAX_QTY,
  clampQty,
  orderLabel,
  parseShipTo,
  type ShipField,
} from "@/lib/shop/shop";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Put a product in the cart (adding to what is there, up to 10). */
export async function addToCartAction(formData: FormData): Promise<void> {
  await assertFeature("marketplace");
  const user = await requireUser();
  const id = String(formData.get("productId") ?? "");
  const qty = clampQty(formData.get("qty") ?? 1);
  if (!UUID.test(id) || qty === null) redirect("/shop?error=err_invalid_input");
  const product = await loadProduct(id, await getLang());
  if (!product) redirect("/shop?error=err_shop_unavailable");
  if (product.availability === "out")
    redirect(`/shop/${id}?error=err_shop_stock`);
  const db = createAdminClient();
  const { data: lines } = await db
    .from("shop_cart_items")
    .select("product_id, qty")
    .eq("user_id", user.id);
  const have = lines?.find((l) => l.product_id === id)?.qty ?? 0;
  if (
    !lines?.some((l) => l.product_id === id) &&
    (lines?.length ?? 0) >= MAX_CART_LINES
  )
    redirect("/shop/cart?error=err_shop_cart_full");
  const next = Math.min(MAX_QTY, have + qty);
  if (product.stock !== null && next > product.stock)
    redirect(`/shop/${id}?error=err_shop_stock`);
  const { error } = await db
    .from("shop_cart_items")
    .upsert(
      { user_id: user.id, product_id: id, qty: next },
      { onConflict: "user_id,product_id" },
    );
  if (error) redirect(`/shop/${id}?error=err_save_failed`);
  revalidatePath("/shop/cart");
  redirect("/shop/cart?added=1");
}

/** Set a line's quantity; 0 removes it. */
export async function setCartQtyAction(formData: FormData): Promise<void> {
  await assertFeature("marketplace");
  const user = await requireUser();
  const id = String(formData.get("productId") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const raw = Number(formData.get("qty"));
  const db = createAdminClient();
  if (!Number.isFinite(raw) || raw <= 0) {
    await db
      .from("shop_cart_items")
      .delete()
      .eq("user_id", user.id)
      .eq("product_id", id);
  } else {
    const qty = clampQty(Math.min(raw, MAX_QTY));
    if (qty === null) throw new AppError("err_invalid_input");
    await db
      .from("shop_cart_items")
      .update({ qty })
      .eq("user_id", user.id)
      .eq("product_id", id);
  }
  revalidatePath("/shop/cart");
  redirect("/shop/cart");
}

export interface CheckoutState {
  error?: ErrorKey;
  fields?: ShipField[];
}

const REASON: Record<string, ErrorKey> = {
  empty: "err_shop_empty",
  unavailable: "err_shop_unavailable",
  stock: "err_shop_stock",
  credit: "err_credit_changed",
};

/**
 * Turns the cart into an order. Prices, stock, shipping and credit are all decided
 * by the database function from ITS rows; the browser sends only the address and a
 * yes/no for credit.
 */
export async function checkoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  await assertFeature("marketplace");
  const user = await requireUser();
  const ship = parseShipTo((k) => formData.get(k));
  if (!ship.ok) return { error: "err_shop_address", fields: ship.fields };

  const [cart, settings] = await Promise.all([
    loadCart(user.id, await getLang()),
    loadPlatformSettings(),
  ]);
  if (cart.length === 0) return { error: "err_shop_empty" };
  if (!settings.promptpayId) return { error: "err_payment_not_ready" };

  const useCredit = formData.get("useCredit") === "on";
  const balance = useCredit ? await loadBalance(user.id) : 0;
  const { data, error } = await createAdminClient().rpc("create_shop_order", {
    p_user: user.id,
    p_lines: cart.map((l) => ({ product_id: l.product.id, qty: l.qty })),
    p_ship: ship.value,
    p_use_credit: useCredit && balance > 0,
    p_credit_max: settings.rewards.redeemMaxOtherThb,
    p_shipping: settings.shop.shippingThb,
    p_free_from: settings.shop.freeShippingFromThb,
    p_promptpay: settings.promptpayId,
  });
  if (error) {
    console.error("[shop] order failed:", error.message);
    return { error: "err_save_failed" };
  }
  const r = data as { ok: boolean; reason?: string; id?: string };
  if (!r.ok) return { error: REASON[r.reason ?? ""] ?? "err_save_failed" };
  await trackEvent("shop_order", user.id);
  revalidatePath("/shop/cart");
  redirect(`/shop/orders/${r.id}`);
}

export interface ReportState {
  error?: ErrorKey;
  ok?: boolean;
}

/** "I have transferred": a claim, not a receipt — only an admin marks the order paid. */
export async function reportShopPaymentAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  await assertFeature("marketplace");
  const user = await requireUser();
  const id = String(formData.get("orderId") ?? "");
  const ref = cleanPayerRef(formData.get("payerRef"));
  if (!UUID.test(id)) return { error: "err_invalid_input" };
  if (!ref) return { error: "err_payer_ref_required" };
  const db = createAdminClient();
  const { data, error } = await db
    .from("shop_orders")
    .update({
      status: "payment_reported",
      payer_ref: ref,
      reported_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending_payment")
    .select("order_no");
  if (error) return { error: "err_save_failed" };
  if (data?.length !== 1) return { error: "err_shop_state" };
  await notifyAdmins(
    (t) => shopPaymentReviewNotice(t, orderLabel(data[0].order_no)),
    user.id,
  );
  revalidatePath(`/shop/orders/${id}`);
  return { ok: true };
}

/** Cancel an order that is not paid yet: stock and credit come back. */
export async function cancelShopOrderAction(formData: FormData): Promise<void> {
  await assertFeature("marketplace");
  const user = await requireUser();
  const id = String(formData.get("orderId") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const { data, error } = await createAdminClient().rpc("cancel_shop_order", {
    p_order: id,
    p_user: user.id,
    p_admin: false,
    p_reason: "cancelled by the buyer",
  });
  if (error) redirect(`/shop/orders/${id}?error=err_save_failed`);
  if (data !== "ok") redirect(`/shop/orders/${id}?error=err_shop_state`);
  revalidatePath("/shop/orders");
  redirect(`/shop/orders/${id}`);
}
