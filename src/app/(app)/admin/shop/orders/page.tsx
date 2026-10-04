import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { type Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { ORDER_COLUMNS, type OrderRow } from "@/lib/shop/server";
import { isOrderStatus, orderLabel, type OrderStatus } from "@/lib/shop/shop";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminShopOrdersTitle };
}

const OPEN: OrderStatus[] = ["payment_reported", "paid", "processing"];

export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/shop/orders">) {
  const sp = await searchParams;
  const view =
    (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "all" ? "all" : "open";
  const status = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const db = createAdminClient();
  let q = db
    .from("shop_orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (isOrderStatus(status)) q = q.eq("status", status);
  else if (view === "open") q = q.in("status", OPEN);
  const [t, lang, { data }, { data: partners }] = await Promise.all([
    getT(),
    getLang(),
    q.returns<OrderRow[]>(),
    db.from("shop_partners").select("id, name").order("name"),
  ]);
  const rows = data ?? [];
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border-2 px-3.5 text-sm font-semibold ${active ? "border-primary-strong bg-tint-primary text-primary-strong" : "border-line bg-surface"}`;
  return (
    <div className="space-y-5">
      <Link
        href="/admin/shop"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.adminShopTitle}
      </Link>
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.adminShopOrdersTitle}
      </h1>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href="/admin/shop/orders"
            className={chip(view === "open" && !status)}
          >
            {t.adminShopOrderFilter_open}
          </Link>
        </li>
        <li>
          <Link
            href="/admin/shop/orders?view=all"
            className={chip(view === "all" && !status)}
          >
            {t.adminShopOrderFilter_all}
          </Link>
        </li>
      </ul>
      {(partners ?? []).length ? (
        <section className="card space-y-2" aria-labelledby="exp-h">
          <h2 id="exp-h" className="text-sm font-semibold">
            {t.adminShopExport}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {(partners ?? []).map((p) => (
              <li key={p.id}>
                <a
                  href={`/admin/shop/orders/export?partner=${p.id}`}
                  className="btn btn-secondary"
                >
                  <Download className="size-4" aria-hidden />
                  {fmt(t.adminShopExportFor, { name: p.name })}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rows.length === 0 ? (
        <p className="card">{t.adminShopOrdersNone}</p>
      ) : null}
      <ul className="space-y-3" aria-label={t.adminShopOrdersTitle}>
        {rows.map((o) => (
          <li key={o.id}>
            <Link
              href={`/admin/shop/orders/${o.id}`}
              className="card hover:bg-tint-primary block space-y-1"
            >
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{orderLabel(o.order_no)}</span>
                <span className="bg-tint-primary rounded-full px-2.5 py-0.5 text-sm font-semibold">
                  {t[`shopStatus_${o.status}` as keyof Dict]}
                </span>
              </p>
              <p className="text-muted text-sm">
                {formatDateTime(lang, o.created_at)} · ฿
                {o.total_thb.toLocaleString("en-US")}
              </p>
              <p className="text-sm">
                {fmt(t.adminShopOrderBuyer, {
                  name: o.ship_name,
                  phone: o.ship_phone,
                })}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
