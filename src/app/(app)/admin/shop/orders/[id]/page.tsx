import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  adminCancelOrderAction,
  orderStepAction,
  saveOrderNoteAction,
} from "@/app/actions/shop-admin";
import { SubmitButton } from "@/components/SubmitButton";
import { errorText, fmt, isErrorKey, type Dict } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { ORDER_COLUMNS, loadItems, type OrderRow } from "@/lib/shop/server";
import { canAdminCancel, orderLabel, stepsFor } from "@/lib/shop/shop";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminShopOrdersTitle };
}

export default async function AdminOrderPage({
  params,
  searchParams,
}: PageProps<"/admin/shop/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = createAdminClient();
  const [t, lang, { data: o }] = await Promise.all([
    getT(),
    getLang(),
    db
      .from("shop_orders")
      .select(`${ORDER_COLUMNS}, admin_note, partner_sent_at`)
      .eq("id", id)
      .maybeSingle<
        OrderRow & { admin_note: string | null; partner_sent_at: string | null }
      >(),
  ]);
  if (!o) notFound();
  const items = await loadItems([id], true);
  const { data: partners } = await db.from("shop_partners").select("id, name");
  const pname = new Map((partners ?? []).map((p) => [p.id, p.name]));
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const steps = stepsFor(o.status);
  const baht = (n: number) => `฿${n.toLocaleString("en-US")}`;
  return (
    <div className="space-y-5">
      <Link
        href="/admin/shop/orders"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.adminShopOrdersTitle}
      </Link>
      <h1 className="text-primary-strong text-2xl font-bold">
        {fmt(t.shopOrderTitle, { no: orderLabel(o.order_no) })}
      </h1>
      <p className="font-semibold" role="status">
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

      <section className="card space-y-1" aria-labelledby="ao-ship">
        <h2 id="ao-ship" className="font-semibold">
          {t.shopShipTo}
        </h2>
        <p className="text-sm">
          {o.ship_name} · {o.ship_phone}
        </p>
        <p className="text-sm">
          {o.ship_address} {o.ship_province} {o.ship_postal}
        </p>
        {o.note ? <p className="text-muted text-sm">{o.note}</p> : null}
        <p className="text-muted text-sm">
          {formatDateTime(lang, o.created_at)}
        </p>
      </section>

      <section className="card space-y-2" aria-labelledby="ao-items">
        <h2 id="ao-items" className="font-semibold">
          {t.shopItems}
        </h2>
        <ul className="divide-line divide-y">
          {items.map((i) => (
            <li key={i.id} className="space-y-0.5 py-2 text-sm">
              <p className="flex justify-between gap-3">
                <span>
                  {i.name} × {i.qty}
                </span>
                <span>{baht(i.unit_price_thb * i.qty)}</span>
              </p>
              <p className="text-muted">
                {i.sku} ·{" "}
                {fmt(t.adminShopPartnerOf, {
                  name: (i.partner_id && pname.get(i.partner_id)) || "—",
                })}
              </p>
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
            <dd>{baht(o.shipping_thb)}</dd>
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
        {o.payer_ref ? (
          <p className="text-sm">
            {fmt(t.shopPayYourRef, { ref: o.payer_ref })}
          </p>
        ) : null}
        {o.tracking_no ? (
          <p className="text-sm">
            {o.carrier ? `${o.carrier} · ` : ""}
            {o.tracking_no}
          </p>
        ) : null}
      </section>

      {steps.length ? (
        <section className="card space-y-3" aria-label="steps">
          {steps.map((s) => (
            <form key={s} action={orderStepAction} className="space-y-2">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="step" value={s} />
              {s === "ship" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor="carrier" className="label">
                      {t.adminShopCarrier}
                    </label>
                    <input
                      id="carrier"
                      name="carrier"
                      maxLength={40}
                      className="field"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="tracking" className="label">
                      {t.adminShopTracking}
                    </label>
                    <input
                      id="tracking"
                      name="tracking"
                      maxLength={60}
                      className="field"
                      autoComplete="off"
                    />
                  </div>
                </div>
              ) : null}
              <SubmitButton
                className={
                  s === "reject_payment"
                    ? "btn btn-secondary"
                    : "btn btn-primary"
                }
              >
                {t[`adminShopStep_${s}` as keyof Dict]}
              </SubmitButton>
            </form>
          ))}
        </section>
      ) : null}

      {canAdminCancel(o.status) ? (
        <form action={adminCancelOrderAction} className="card space-y-2">
          <input type="hidden" name="id" value={o.id} />
          <label htmlFor="reason" className="label">
            {t.adminShopCancelReason}
          </label>
          <input
            id="reason"
            name="reason"
            maxLength={200}
            className="field"
            autoComplete="off"
          />
          <SubmitButton className="btn btn-secondary">
            {t.adminShopCancel}
          </SubmitButton>
        </form>
      ) : null}

      <form action={saveOrderNoteAction} className="card space-y-2">
        <input type="hidden" name="id" value={o.id} />
        <label htmlFor="note" className="label">
          {t.adminShopNote}
        </label>
        <input
          id="note"
          name="note"
          maxLength={500}
          defaultValue={o.admin_note ?? ""}
          className="field"
          autoComplete="off"
        />
        <SubmitButton className="btn btn-secondary">
          {t.adminShopSave}
        </SubmitButton>
      </form>
    </div>
  );
}
