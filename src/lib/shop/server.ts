import "server-only";
import { randomUUID } from "node:crypto";
import type { Lang } from "@/lib/i18n/dict";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MAX_IMAGE_BYTES, MAX_IMAGES } from "./product";
import type { OrderStatus } from "./shop";

const BUCKET = "shop-images";

let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const { error } = await createAdminClient().storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_IMAGE_BYTES + 1024,
  });
  if (
    error &&
    !/already exists|duplicate|resource already/i.test(error.message)
  )
    throw error;
  bucketReady = true;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Stores one image of a product (private bucket; pages show it through /api/shop/img). Returns its id, or null with nothing left behind. */
export async function addProductImage(
  productId: string,
  bytes: Uint8Array,
  mime: "image/jpeg" | "image/png" | "image/webp",
): Promise<{ id: string } | { error: "full" | "failed" }> {
  const db = createAdminClient();
  const { data: existing } = await db
    .from("shop_product_images")
    .select("id, position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(MAX_IMAGES + 1);
  if ((existing?.length ?? 0) >= MAX_IMAGES) return { error: "full" };
  await ensureBucket();
  const path = `${productId}/${randomUUID()}.${EXT[mime]}`;
  const up = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    console.error("[shop] image upload failed:", up.error.message);
    return { error: "failed" };
  }
  const position = (existing?.[0]?.position ?? -1) + 1;
  const { data, error } = await db
    .from("shop_product_images")
    .insert({
      product_id: productId,
      path,
      mime,
      bytes: bytes.length,
      position,
    })
    .select("id");
  if (error || data?.length !== 1) {
    await db.storage.from(BUCKET).remove([path]);
    return { error: "failed" };
  }
  return { id: data[0].id };
}

export async function removeProductImages(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = createAdminClient();
  const { data } = await db
    .from("shop_product_images")
    .select("id, path")
    .in("id", ids);
  const rows = data ?? [];
  if (rows.length === 0) return 0;
  await db.storage.from(BUCKET).remove(rows.map((r) => r.path));
  const { data: gone } = await db
    .from("shop_product_images")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    )
    .select("id");
  return gone?.length ?? 0;
}

/** Every storage object under a product — for when the product itself is deleted. */
export async function removeAllImagesOf(productId: string): Promise<void> {
  const db = createAdminClient();
  const { data } = await db
    .from("shop_product_images")
    .select("id")
    .eq("product_id", productId);
  await removeProductImages((data ?? []).map((r) => r.id));
}

export async function readProductImage(
  id: string,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("shop_product_images")
    .select("path, mime")
    .eq("id", id)
    .maybeSingle<{ path: string; mime: string }>();
  if (!row) return null;
  const { data, error } = await db.storage.from(BUCKET).download(row.path);
  if (error || !data) return null;
  return { bytes: await data.arrayBuffer(), mime: row.mime };
}

// ── catalog ─────────────────────────────────────────────────────────────────
export interface ProductRow {
  id: string;
  sku: string;
  partner_id: string;
  name_th: string;
  name_en: string | null;
  brand: string | null;
  summary_th: string | null;
  summary_en: string | null;
  description_th: string | null;
  description_en: string | null;
  ingredients: string | null;
  usage_note: string | null;
  caution: string | null;
  fda_no: string | null;
  serving: string | null;
  price_thb: number;
  compare_at_thb: number | null;
  stock: number | null;
  focus_tags: string[];
  active: boolean;
  sort: number;
}

export const PRODUCT_COLUMNS =
  "id, sku, partner_id, name_th, name_en, brand, summary_th, summary_en, description_th, description_en, ingredients, usage_note, caution, fda_no, serving, price_thb, compare_at_thb, stock, focus_tags, active, sort";

export interface ImageRow {
  id: string;
  product_id: string;
  position: number;
}

export interface CatalogItem extends ProductRow {
  name: string;
  summary: string | null;
  cover: string | null;
  images: string[];
  availability: "in" | "low" | "out";
}

const LOW_STOCK = 5;

export function localized(p: ProductRow, lang: Lang) {
  return {
    name: lang === "en" && p.name_en ? p.name_en : p.name_th,
    summary:
      (lang === "en" && p.summary_en ? p.summary_en : p.summary_th) ?? null,
    description:
      (lang === "en" && p.description_en
        ? p.description_en
        : p.description_th) ?? null,
  };
}

function shape(p: ProductRow, imgs: ImageRow[], lang: Lang): CatalogItem {
  const mine = imgs.filter((i) => i.product_id === p.id);
  return {
    ...p,
    ...localized(p, lang),
    cover: mine[0]?.id ?? null,
    images: mine.map((i) => i.id),
    availability:
      p.stock === null
        ? "in"
        : p.stock <= 0
          ? "out"
          : p.stock <= LOW_STOCK
            ? "low"
            : "in",
  };
}

async function imagesFor(ids: string[]): Promise<ImageRow[]> {
  if (ids.length === 0) return [];
  const { data } = await createAdminClient()
    .from("shop_product_images")
    .select("id, product_id, position")
    .in("product_id", ids)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<ImageRow[]>();
  return data ?? [];
}

/** What is on sale: active products of active partners (admin client — the catalog holds nothing personal). */
export async function loadCatalog(lang: Lang): Promise<CatalogItem[]> {
  const db = createAdminClient();
  const { data: partners } = await db
    .from("shop_partners")
    .select("id")
    .eq("active", true);
  const open = new Set((partners ?? []).map((p) => p.id));
  const { data } = await db
    .from("shop_products")
    .select(PRODUCT_COLUMNS)
    .eq("active", true)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<ProductRow[]>();
  const rows = (data ?? []).filter((p) => open.has(p.partner_id));
  const imgs = await imagesFor(rows.map((p) => p.id));
  return rows.map((p) => shape(p, imgs, lang));
}

export async function loadProduct(
  id: string,
  lang: Lang,
  includeInactive = false,
): Promise<CatalogItem | null> {
  const db = createAdminClient();
  let q = db.from("shop_products").select(PRODUCT_COLUMNS).eq("id", id);
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q.maybeSingle<ProductRow>();
  if (!data) return null;
  if (!includeInactive) {
    const { data: partner } = await db
      .from("shop_partners")
      .select("active")
      .eq("id", data.partner_id)
      .maybeSingle();
    if (!partner?.active) return null;
  }
  return shape(data, await imagesFor([id]), lang);
}

// ── cart and orders (the person's own rows) ─────────────────────────────────
export interface CartLine {
  product: CatalogItem;
  qty: number;
}

export async function loadCart(
  userId: string,
  lang: Lang,
): Promise<CartLine[]> {
  const { data } = await (
    await createClient()
  )
    .from("shop_cart_items")
    .select("product_id, qty")
    .order("added_at", { ascending: true })
    .returns<{ product_id: string; qty: number }[]>();
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const catalog = new Map((await loadCatalog(lang)).map((p) => [p.id, p]));
  void userId;
  return rows.flatMap((r) => {
    const product = catalog.get(r.product_id);
    return product ? [{ product, qty: r.qty }] : [];
  });
}

export interface OrderRow {
  id: string;
  order_no: number;
  status: OrderStatus;
  subtotal_thb: number;
  shipping_thb: number;
  credit_thb: number;
  total_thb: number;
  ship_name: string;
  ship_phone: string;
  ship_address: string;
  ship_province: string;
  ship_postal: string;
  note: string | null;
  promptpay_id: string | null;
  payer_ref: string | null;
  reported_at: string | null;
  paid_at: string | null;
  carrier: string | null;
  tracking_no: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export const ORDER_COLUMNS =
  "id, order_no, status, subtotal_thb, shipping_thb, credit_thb, total_thb, ship_name, ship_phone, ship_address, ship_province, ship_postal, note, promptpay_id, payer_ref, reported_at, paid_at, carrier, tracking_no, shipped_at, delivered_at, cancelled_at, cancel_reason, created_at";

export interface ItemRow {
  id: string;
  order_id: string;
  sku: string;
  name: string;
  unit_price_thb: number;
  qty: number;
  partner_id: string | null;
}

export async function loadItems(
  orderIds: string[],
  admin = false,
): Promise<ItemRow[]> {
  if (orderIds.length === 0) return [];
  const client = admin ? createAdminClient() : await createClient();
  const { data } = await client
    .from("shop_order_items")
    .select("id, order_id, sku, name, unit_price_thb, qty, partner_id")
    .in("order_id", orderIds)
    .returns<ItemRow[]>();
  return data ?? [];
}
