import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Thumb } from "@/components/shop/Photos";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { PRODUCT_COLUMNS, type ProductRow } from "@/lib/shop/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminShopProducts };
}

export default async function AdminProductsPage() {
  const db = createAdminClient();
  const [t, { data }, { data: images }, { data: partners }] = await Promise.all(
    [
      getT(),
      db
        .from("shop_products")
        .select(PRODUCT_COLUMNS)
        .order("sort", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(500)
        .returns<ProductRow[]>(),
      db
        .from("shop_product_images")
        .select("id, product_id, position")
        .order("position", { ascending: true })
        .returns<{ id: string; product_id: string }[]>(),
      db.from("shop_partners").select("id, name"),
    ],
  );
  const cover = new Map<string, string>();
  for (const i of images ?? [])
    if (!cover.has(i.product_id)) cover.set(i.product_id, i.id);
  const pname = new Map((partners ?? []).map((p) => [p.id, p.name]));
  const rows = data ?? [];
  return (
    <div className="space-y-5">
      <Link
        href="/admin/shop"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.adminShopTitle}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminShopProducts}
        </h1>
        <Link href="/admin/shop/products/new" className="btn btn-primary">
          <Plus className="size-4" aria-hidden />
          {t.adminShopProductNew}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="card">{t.adminShopProductsNone}</p>
      ) : null}
      <ul className="space-y-3" aria-label={t.adminShopProducts}>
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/shop/products/${p.id}`}
              className="card hover:bg-tint-primary flex gap-3"
            >
              <div className="w-16 shrink-0">
                <Thumb t={t} name={p.name_th} id={cover.get(p.id) ?? null} />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold">{p.name_th}</p>
                <p className="text-muted text-sm">
                  {p.sku} · ฿{p.price_thb.toLocaleString("en-US")} ·{" "}
                  {p.stock === null
                    ? t.adminShopStockNone
                    : fmt(t.adminShopStock, { n: p.stock })}
                </p>
                <p className="text-muted text-sm">
                  {fmt(t.adminShopPartnerOf, {
                    name: pname.get(p.partner_id) ?? "—",
                  })}
                </p>
                <p className="text-sm font-medium">
                  {p.active ? t.adminShopProductOn : t.adminShopProductOff}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
