"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { sniffImageType } from "@/lib/food/food";
import type { ErrorKey } from "@/lib/i18n/dict";
import {
  shopOrderCancelledNotice,
  shopOrderPaidNotice,
  shopOrderShippedNotice,
} from "@/lib/notify/messages";
import { dictFor, notifyUser } from "@/lib/notify/server";
import { invalidatePlatformSettingsCache } from "@/lib/settings/server";
import {
  MAX_IMAGE_BYTES,
  parseProduct,
  parseProductCsv,
  type ProductField,
} from "@/lib/shop/product";
import {
  addProductImage,
  removeAllImagesOf,
  removeProductImages,
} from "@/lib/shop/server";
import {
  ADMIN_STEPS,
  canAdminCancel,
  isAdminStep,
  isOrderStatus,
  orderLabel,
} from "@/lib/shop/shop";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const touch = () => {
  revalidatePath("/admin/shop", "layout");
  revalidatePath("/shop", "layout");
};

// ── partners ────────────────────────────────────────────────────────────────
export interface SimpleState {
  error?: ErrorKey;
  saved?: boolean;
}

const text = (v: FormDataEntryValue | null, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

export async function savePartnerAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = text(formData.get("name"), 80);
  if (!name) return { error: "err_invalid_input" };
  const row = {
    name,
    contact: text(formData.get("contact"), 200) || null,
    note: text(formData.get("note"), 500) || null,
    active: formData.get("active") === "on",
  };
  const db = createAdminClient();
  const { data, error } = UUID.test(id)
    ? await db.from("shop_partners").update(row).eq("id", id).select("id")
    : await db.from("shop_partners").insert(row).select("id");
  if (error)
    return {
      error:
        error.code === "23505" ? "err_shop_partner_exists" : "err_save_failed",
    };
  if (data?.length !== 1) return { error: "err_save_failed" };
  touch();
  return { saved: true };
}

// ── products ────────────────────────────────────────────────────────────────
export interface ProductState {
  error?: ErrorKey;
  fields?: ProductField[];
  saved?: boolean;
}

/** Create or update one product from the form. A new product starts hidden until it is switched on. */
export async function saveProductAction(
  _prev: ProductState,
  formData: FormData,
): Promise<ProductState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const partnerId = String(formData.get("partner_id") ?? "");
  const parsed = parseProduct((k) => {
    if (k === "tags") return formData.getAll("tags");
    // an unticked checkbox sends nothing, so the form says "I am carrying this field" with a marker
    if (k === "requires_kyc")
      return formData.get("requires_kyc_form")
        ? formData.get("requires_kyc") === "on"
          ? "yes"
          : "no"
        : undefined;
    return formData.get(k);
  });
  if (!parsed.ok)
    return { error: "err_shop_product_fields", fields: parsed.fields };
  if (!UUID.test(partnerId))
    return { error: "err_shop_product_fields", fields: ["partner"] };
  const db = createAdminClient();
  const row = { ...parsed.value, partner_id: partnerId };
  const { data, error } = UUID.test(id)
    ? await db.from("shop_products").update(row).eq("id", id).select("id")
    : await db.from("shop_products").insert(row).select("id");
  if (error) {
    return error.code === "23505"
      ? { error: "err_shop_product_fields", fields: ["sku"] }
      : { error: "err_save_failed" };
  }
  if (data?.length !== 1) return { error: "err_save_failed" };
  touch();
  if (!UUID.test(id)) redirect(`/admin/shop/products/${data[0].id}?created=1`);
  return { saved: true };
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  await removeAllImagesOf(id);
  const { error } = await createAdminClient()
    .from("shop_products")
    .delete()
    .eq("id", id);
  if (error) throw new AppError("err_save_failed");
  touch();
  redirect("/admin/shop/products");
}

// ── product photos ──────────────────────────────────────────────────────────
export interface ImageState {
  error?: ErrorKey;
  id?: string;
}

/** One photo per call (the browser shrinks it first; this re-checks type and size). */
export async function uploadProductImageAction(
  formData: FormData,
): Promise<ImageState> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file");
  if (!UUID.test(productId) || !(file instanceof File) || file.size === 0)
    return { error: "err_invalid_input" };
  if (file.size > MAX_IMAGE_BYTES) return { error: "err_shop_image_big" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime) return { error: "err_shop_image_type" };
  const r = await addProductImage(productId, bytes, mime);
  if ("error" in r)
    return {
      error: r.error === "full" ? "err_shop_image_full" : "err_save_failed",
    };
  touch();
  return { id: r.id };
}

export async function deleteProductImageAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const back = String(formData.get("back") ?? "/admin/shop/products");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  await removeProductImages([id]);
  touch();
  redirect(back.startsWith("/admin/shop/") ? back : "/admin/shop/products");
}

/** Move a photo one place earlier or later; the first one is the cover. */
export async function moveProductImageAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const back = String(formData.get("back") ?? "/admin/shop/products");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const db = createAdminClient();
  const { data: me } = await db
    .from("shop_product_images")
    .select("product_id")
    .eq("id", id)
    .maybeSingle();
  if (me) {
    const { data: all } = await db
      .from("shop_product_images")
      .select("id")
      .eq("product_id", me.product_id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    const ids = (all ?? []).map((r) => r.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i >= 0 && j >= 0 && j < ids.length) {
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await Promise.all(
        ids.map((x, pos) =>
          db.from("shop_product_images").update({ position: pos }).eq("id", x),
        ),
      );
    }
  }
  touch();
  redirect(back.startsWith("/admin/shop/") ? back : "/admin/shop/products");
}

/** Remove every photo of a product (an import that should replace them). */
export async function clearProductImagesAction(
  productId: string,
): Promise<void> {
  await requireAdmin();
  if (!UUID.test(productId)) throw new AppError("err_invalid_input");
  await removeAllImagesOf(productId);
  touch();
}

// ── import ──────────────────────────────────────────────────────────────────
export interface ImportResult {
  error?: ErrorKey;
  /** sku → product id, for the photos the browser uploads next */
  saved?: { sku: string; id: string; created: boolean; images: string[] }[];
  issues?: { line: number; sku: string; fields: string[] }[];
}

/** Product rows from a CSV: validated again here, created or updated by SKU. A row that names no partner we know is an issue, not a guess. */
export async function importProductsAction(csv: string): Promise<ImportResult> {
  await requireAdmin();
  const parsed = parseProductCsv(csv.slice(0, 2_000_000));
  if (!parsed.ok)
    return {
      error:
        parsed.reason === "too_many"
          ? "err_shop_import_many"
          : "err_shop_import_file",
    };
  const db = createAdminClient();
  const { data: partners } = await db.from("shop_partners").select("id, name");
  const byName = new Map(
    (partners ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]),
  );
  const issues: { line: number; sku: string; fields: string[] }[] =
    parsed.issues.map((i) => ({ ...i }));
  const saved: NonNullable<ImportResult["saved"]> = [];
  for (const p of parsed.products) {
    const partnerId = byName.get(p.partner.trim().toLowerCase());
    if (!partnerId) {
      issues.push({ line: p.line, sku: p.value.sku, fields: ["partner"] });
      continue;
    }
    const { data: existing } = await db
      .from("shop_products")
      .select("id")
      .eq("sku", p.value.sku)
      .maybeSingle();
    const row = { ...p.value, partner_id: partnerId };
    const { data, error } = existing
      ? await db
          .from("shop_products")
          .update(row)
          .eq("id", existing.id)
          .select("id")
      : await db.from("shop_products").insert(row).select("id");
    if (error || data?.length !== 1) {
      issues.push({ line: p.line, sku: p.value.sku, fields: ["save"] });
      continue;
    }
    saved.push({
      sku: p.value.sku,
      id: data[0].id,
      created: !existing,
      images: p.images,
    });
  }
  touch();
  return { saved, issues: issues.sort((a, b) => a.line - b.line) };
}

// ── orders ──────────────────────────────────────────────────────────────────
const backTo = (id: string, error?: ErrorKey) =>
  redirect(`/admin/shop/orders/${id}${error ? `?error=${error}` : ""}`);

/** One step of an order's life, only from the statuses that allow it. */
export async function orderStepAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const step = formData.get("step");
  if (!UUID.test(id) || !isAdminStep(step))
    throw new AppError("err_invalid_input");
  const spec = ADMIN_STEPS[step];
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: spec.to };
  if (step === "confirm_paid") patch.paid_at = now;
  if (step === "reject_payment")
    Object.assign(patch, { payer_ref: null, reported_at: null });
  if (step === "send_to_partner") patch.partner_sent_at = now;
  if (step === "ship") {
    const carrier = text(formData.get("carrier"), 40);
    const tracking = text(formData.get("tracking"), 60);
    if (!tracking) backTo(id, "err_shop_tracking");
    Object.assign(patch, {
      carrier: carrier || null,
      tracking_no: tracking,
      shipped_at: now,
    });
  }
  if (step === "deliver") patch.delivered_at = now;

  const db = createAdminClient();
  const { data, error } = await db
    .from("shop_orders")
    .update(patch)
    .eq("id", id)
    .in("status", [...spec.from])
    .select("user_id, order_no, carrier, tracking_no");
  if (error) backTo(id, "err_save_failed");
  if (data?.length !== 1) backTo(id, "err_shop_state");
  const o = data![0];
  if (o.user_id) {
    const { t } = await dictFor(o.user_id);
    if (step === "confirm_paid")
      await notifyUser(
        o.user_id,
        shopOrderPaidNotice(t, orderLabel(o.order_no), id),
      );
    if (step === "ship")
      await notifyUser(
        o.user_id,
        shopOrderShippedNotice(
          t,
          orderLabel(o.order_no),
          id,
          o.carrier,
          o.tracking_no,
        ),
      );
  }
  revalidatePath("/admin/shop/orders");
  backTo(id);
}

/** Cancel an order that has not shipped: stock and credit come back, the buyer is told. */
export async function adminCancelOrderAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const reason = text(formData.get("reason"), 200) || "cancelled by the shop";
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const db = createAdminClient();
  const { data: before } = await db
    .from("shop_orders")
    .select("status, user_id, order_no")
    .eq("id", id)
    .maybeSingle();
  if (
    !before ||
    !isOrderStatus(before.status) ||
    !canAdminCancel(before.status)
  )
    backTo(id, "err_shop_state");
  const { data, error } = await db.rpc("cancel_shop_order", {
    p_order: id,
    p_user: admin.id,
    p_admin: true,
    p_reason: reason,
  });
  if (error || data !== "ok") backTo(id, "err_shop_state");
  if (before!.user_id) {
    const { t } = await dictFor(before!.user_id);
    await notifyUser(
      before!.user_id,
      shopOrderCancelledNotice(t, orderLabel(before!.order_no), id),
    );
  }
  revalidatePath("/admin/shop/orders");
  backTo(id);
}

export async function saveOrderNoteAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  await createAdminClient()
    .from("shop_orders")
    .update({ admin_note: text(formData.get("note"), 500) || null })
    .eq("id", id);
  backTo(id);
}

// ── settings ────────────────────────────────────────────────────────────────
export async function saveShopSettingsAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const admin = await requireAdmin();
  const num = (k: string, max: number) => {
    const s = String(formData.get(k) ?? "").trim();
    return /^\d{1,6}$/.test(s) && Number(s) <= max ? Number(s) : null;
  };
  const shipping = num("shipping", 5000);
  const free = num("freeFrom", 100000);
  if (shipping === null || free === null) return { error: "err_shop_settings" };
  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .update({
      shop_shipping_thb: shipping,
      shop_free_shipping_from_thb: free,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  invalidatePlatformSettingsCache();
  touch();
  return { saved: true };
}
