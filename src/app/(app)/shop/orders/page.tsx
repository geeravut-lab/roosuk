import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { type Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { ORDER_COLUMNS, type OrderRow } from "@/lib/shop/server";
import { orderLabel } from "@/lib/shop/shop";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).shopOrders };
}

export default async function OrdersPage() {
  if (!(await featureEnabled("marketplace"))) notFound();
  await requireUser();
  const [t, lang, { data }] = await Promise.all([
    getT(),
    getLang(),
    (await createClient())
      .from("shop_orders")
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<OrderRow[]>(),
  ]);
  const rows = data ?? [];
  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">{t.shopOrders}</h1>
      {rows.length === 0 ? (
        <div className="card space-y-3">
          <p>{t.shopOrdersNone}</p>
          <Link href="/shop" className="btn btn-primary">
            {t.shopBack}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3" aria-label={t.shopOrders}>
          {rows.map((o) => (
            <li key={o.id}>
              <Link
                href={`/shop/orders/${o.id}`}
                className="card hover:bg-tint-primary block space-y-1"
              >
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {orderLabel(o.order_no)}
                  </span>
                  <span className="bg-tint-primary rounded-full px-2.5 py-0.5 text-sm font-semibold">
                    {t[`shopStatus_${o.status}` as keyof Dict]}
                  </span>
                </p>
                <p className="text-muted text-sm">
                  {formatDate(lang, o.created_at)} · ฿
                  {o.total_thb.toLocaleString("en-US")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
