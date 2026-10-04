import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PartnerForm } from "./PartnerForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminShopPartners };
}

export default async function AdminPartnersPage() {
  const [t, { data }] = await Promise.all([
    getT(),
    createAdminClient()
      .from("shop_partners")
      .select("id, name, contact, note, active")
      .order("created_at", { ascending: true })
      .returns<
        {
          id: string;
          name: string;
          contact: string | null;
          note: string | null;
          active: boolean;
        }[]
      >(),
  ]);
  const partners = data ?? [];
  return (
    <div className="space-y-5">
      <Link
        href="/admin/shop"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.adminShopTitle}
      </Link>
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.adminShopPartners}
      </h1>
      {partners.length === 0 ? (
        <p className="card">{t.adminShopPartnersNone}</p>
      ) : null}
      <ul className="space-y-3" aria-label={t.adminShopPartners}>
        {partners.map((p) => (
          <li key={p.id} className="card">
            <PartnerForm partner={p} />
          </li>
        ))}
      </ul>
      <section className="card space-y-3" aria-labelledby="pn-add">
        <h2 id="pn-add" className="font-semibold">
          {t.adminShopPartnerAdd}
        </h2>
        <PartnerForm />
      </section>
    </div>
  );
}
