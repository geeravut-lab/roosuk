import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Clock, Truck } from "lucide-react";
import { cancelShopOrderAction } from "@/app/actions/shop";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import { promptpayQrUrl } from "@/lib/billing/promptpay";
import { featureEnabled } from "@/lib/flags/server";
import { errorText, fmt, isErrorKey, type Dict } from "@/lib/i18n/dict";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { ORDER_COLUMNS, loadItems, type OrderRow } from "@/lib/shop/server";
import { canReportPayment, canUserCancel, orderLabel } from "@/lib/shop/shop";
import { createClient } from "@/lib/supabase/server";
import { ReportForm } from "./ReportForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).shopOrders };
}

export default async function OrderPage({
  params,
  searchParams,
}: PageProps<"/shop/orders/[id]">) {
  if (!(await featureEnabled("marketplace"))) notFound();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const [t, lang, { data: o }] = await Promise.all([
    getT(),
    getLang(),
    (await createClient())
      .from("shop_orders")
      .select(ORDER_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<OrderRow>(),
  ]);
  if (!o) notFound();
  const items = await loadItems([id]);
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const qr =
    o.status === "pending_payment"
      ? promptpayQrUrl(o.promptpay_id ?? "", o.total_thb)
      : null;
  const baht = (n: number) => `฿${n.toLocaleString("en-US")}`;

  return (
    <div className="space-y-5">
      <Link
        href="/shop/orders"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.shopOrders}
      </Link>
      <h1 className="text-primary-strong text-2xl font-bold">
        {fmt(t.shopOrderTitle, { no: orderLabel(o.order_no) })}
      </h1>
      <p className="inline-flex items-center gap-2 font-semibold" role="status">
        {o.status === "shipped" || o.status === "delivered" ? (
          <Truck className="size-5" aria-hidden />
        ) : o.status === "paid" || o.status === "processing" ? (
          <CircleCheck className="size-5" aria-hidden />
        ) : (
          <Clock className="size-5" aria-hidden />
        )}
        {t[`shopStatus_${o.status}` as keyof Dict]}
      </p>
      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      {o.status === "cancelled" ? (
        <p className="card">{fmt(t.shopCancelledNote, { reason: "" })}</p>
      ) : null}

      {o.status === "pending_payment" ? (
        <section className="card space-y-4" aria-labelledby="pay-h">
          <h2 id="pay-h" className="font-semibold">
            {t.shopPayTitle}
          </h2>
          <p className="text-primary-strong text-3xl font-bold">
            {baht(o.total_thb)}
          </p>
          {qr ? (
            <div className="space-y-2 text-center">
              {/* promptpay.io draws the QR from the id + amount in the URL */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt={fmt(t.payQrAlt, { amount: o.total_thb })}
                width={256}
                height={256}
                className="mx-auto size-64 rounded-xl bg-white p-2"
              />
              <p className="text-sm">
                {fmt(t.shopPayScan, { n: o.total_thb })}
              </p>
            </div>
          ) : (
            <p role="alert">{t.err_payment_not_ready}</p>
          )}
          {canReportPayment(o.status) ? <ReportForm orderId={o.id} /> : null}
        </section>
      ) : null}

      {o.status === "payment_reported" ? (
        <p className="card" role="status">
          {t.shopPayReported}
          {o.payer_ref ? (
            <span className="text-muted mt-1 block text-sm">
              {fmt(t.shopPayYourRef, { ref: o.payer_ref })}
            </span>
          ) : null}
        </p>
      ) : null}

      {o.tracking_no ? (
        <section className="card space-y-1" aria-labelledby="trk-h">
          <h2 id="trk-h" className="font-semibold">
            {t.shopTrackingTitle}
          </h2>
          {o.carrier ? (
            <p className="text-sm">
              {t.shopCarrier}: {o.carrier}
            </p>
          ) : null}
          <p className="text-sm">
            {t.shopTracking}:{" "}
            <strong data-testid="tracking">{o.tracking_no}</strong>
          </p>
          {o.shipped_at ? (
            <p className="text-muted text-sm">
              {formatDateTime(lang, o.shipped_at)}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="card space-y-2" aria-labelledby="items-h">
        <h2 id="items-h" className="font-semibold">
          {t.shopItems}
        </h2>
        <ul className="divide-line divide-y">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
              <span>
                {i.name} × {i.qty}
              </span>
              <span>{baht(i.unit_price_thb * i.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>{t.shopSubtotal}</dt>
            <dd>{baht(o.subtotal_thb)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t.shopShipping}</dt>
            <dd>
              {o.shipping_thb === 0 ? t.shopShippingFree : baht(o.shipping_thb)}
            </dd>
          </div>
          {o.credit_thb > 0 ? (
            <div className="flex justify-between">
              <dt>{t.shopCreditUsed}</dt>
              <dd>−{baht(o.credit_thb)}</dd>
            </div>
          ) : null}
          <div className="border-line flex justify-between border-t pt-2 font-bold">
            <dt>{t.shopTotal}</dt>
            <dd>{baht(o.total_thb)}</dd>
          </div>
        </dl>
        <p className="text-muted text-xs">{formatDate(lang, o.created_at)}</p>
      </section>

      <section className="card space-y-1" aria-labelledby="ship-h">
        <h2 id="ship-h" className="font-semibold">
          {t.shopShipTo}
        </h2>
        <p className="text-sm">
          {o.ship_name} · {o.ship_phone}
        </p>
        <p className="text-sm">
          {o.ship_address} {o.ship_province} {o.ship_postal}
        </p>
      </section>

      {canUserCancel(o.status) ? (
        <form action={cancelShopOrderAction} className="space-y-2">
          <input type="hidden" name="orderId" value={o.id} />
          <SubmitButton className="btn btn-secondary">
            {t.shopCancel}
          </SubmitButton>
          <p className="text-muted text-sm">{t.shopCancelNote}</p>
        </form>
      ) : null}
      <p className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
        {t.shopDisclaimer}
      </p>
    </div>
  );
}
