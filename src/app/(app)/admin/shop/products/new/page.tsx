import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductForm } from "../ProductForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminShopProductNew };
}

export default async function NewProductPage() {
  const [t, { data }] = await Promise.all([
    getT(),
    createAdminClient()
      .from("shop_partners")
      .select("id, name, active")
      .order("name")
      .returns<{ id: string; name: string; active: boolean }[]>(),
  ]);
  return (
    <div className="space-y-5">
      <Link
        href="/admin/shop/products"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.adminShopProducts}
      </Link>
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.adminShopProductNew}
      </h1>
      {(data ?? []).length === 0 ? (
        <p className="card">
          {t.adminShopPartnersNone}{" "}
          <Link
            href="/admin/shop/partners"
            className="text-primary-strong underline"
          >
            {t.adminShopPartners}
          </Link>
        </p>
      ) : (
        <div className="card">
          <ProductForm partners={data ?? []} />
        </div>
      )}
    </div>
  );
}
