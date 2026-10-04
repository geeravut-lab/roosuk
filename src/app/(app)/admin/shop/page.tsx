import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, Package, ReceiptText, Truck } from "lucide-react";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopSettingsForm } from "./ShopSettingsForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminShopTitle };
}

export default async function AdminShopHome() {
  invalidatePlatformSettingsCache();
  const db = createAdminClient();
  const [t, { shop }, { count: open }] = await Promise.all([
    getT(),
    loadPlatformSettings(),
    db
      .from("shop_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["payment_reported", "paid", "processing"]),
  ]);
  const link = "card hover:bg-tint-primary flex items-center gap-3";
  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.adminShopTitle}
      </h1>
      <Link href="/admin/shop/orders" className={link}>
        <ReceiptText className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminShopOrders}</span>
        {open ? (
          <span className="bg-coral text-on-accent ml-auto rounded-full px-2.5 py-1 text-xs font-semibold">
            {fmt(t.adminShopOrdersOpen, { n: open })}
          </span>
        ) : null}
      </Link>
      <Link href="/admin/shop/products" className={link}>
        <Package className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminShopProducts}</span>
      </Link>
      <Link href="/admin/shop/import" className={link}>
        <FileUp className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminShopImport}</span>
      </Link>
      <Link href="/admin/shop/partners" className={link}>
        <Truck className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminShopPartners}</span>
      </Link>
      <section className="card space-y-3" aria-labelledby="shop-set">
        <h2 id="shop-set" className="font-semibold">
          {t.adminShopSettings}
        </h2>
        <ShopSettingsForm current={shop} />
      </section>
    </div>
  );
}
