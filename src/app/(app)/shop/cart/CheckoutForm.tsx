"use client";

import { useState } from "react";
import { checkoutAction, type CheckoutState } from "@/app/actions/shop";
import { Spinner } from "@/components/Spinner";
import { errorText, fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { orderTotals, type ShopSettings } from "@/lib/shop/shop";
import { useFormAction } from "@/lib/use-form-action";

const initial: CheckoutState = {};

/** The address and the credit switch; the totals shown here use the same rules the database applies at checkout. */
export function CheckoutForm({
  lines,
  settings,
  balance,
  maxPerUse,
}: {
  lines: { price: number; qty: number }[];
  settings: ShopSettings;
  balance: number;
  maxPerUse: number;
}) {
  const { t } = useI18n();
  const [useCredit, setUseCredit] = useState(false);
  const [state, onSubmit, pending] = useFormAction(checkoutAction, initial);
  const totals = orderTotals(lines, settings, {
    use: useCredit,
    balance,
    maxPerUse,
  });
  const bad = (f: string) => state.fields?.includes(f as never);
  const field = (
    name: string,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label htmlFor={`co-${name}`} className="label">
        {label}
      </label>
      <input
        id={`co-${name}`}
        name={name}
        required={name !== "note"}
        aria-invalid={bad(name) || undefined}
        className={`field ${bad(name) ? "border-danger" : ""}`}
        autoComplete="off"
        {...props}
      />
    </div>
  );
  const baht = (n: number) => `฿${n.toLocaleString("en-US")}`;

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <section className="card space-y-1" aria-label={t.shopTotal}>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>{t.shopSubtotal}</dt>
            <dd>{baht(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t.shopShipping}</dt>
            <dd>
              {totals.shipping === 0
                ? t.shopShippingFree
                : baht(totals.shipping)}
            </dd>
          </div>
          {useCredit && totals.credit > 0 ? (
            <div className="flex justify-between">
              <dt>{t.shopCreditUsed}</dt>
              <dd>−{baht(totals.credit)}</dd>
            </div>
          ) : null}
          <div className="border-line flex justify-between border-t pt-2 text-base font-bold">
            <dt>{t.shopTotal}</dt>
            <dd data-testid="co-total">{baht(totals.total)}</dd>
          </div>
        </dl>
        {settings.freeShippingFromThb > 0 && totals.shipping > 0 ? (
          <p className="text-muted text-xs">
            {fmt(t.shopFreeFrom, { n: settings.freeShippingFromThb })}
          </p>
        ) : null}
      </section>

      {balance > 0 && maxPerUse > 0 ? (
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            name="useCredit"
            className="mt-1 size-5"
            checked={useCredit}
            onChange={(e) => setUseCredit(e.target.checked)}
          />
          <span className="text-sm">
            {fmt(t.shopUseCredit, { max: maxPerUse, balance })}
          </span>
        </label>
      ) : null}

      <section className="card space-y-3" aria-labelledby="co-addr">
        <h2 id="co-addr" className="font-semibold">
          {t.shopAddressTitle}
        </h2>
        {field("name", t.shopFieldName, {
          autoComplete: "name",
          maxLength: 80,
        })}
        {field("phone", t.shopFieldPhone, {
          type: "tel",
          inputMode: "tel",
          autoComplete: "tel",
          maxLength: 20,
        })}
        {field("address", t.shopFieldAddress, {
          autoComplete: "street-address",
          maxLength: 300,
        })}
        <div className="grid grid-cols-2 gap-3">
          {field("province", t.shopFieldProvince, {
            autoComplete: "address-level1",
            maxLength: 60,
          })}
          {field("postal", t.shopFieldPostal, {
            inputMode: "numeric",
            autoComplete: "postal-code",
            maxLength: 5,
          })}
        </div>
        {field("note", t.shopFieldNote, { maxLength: 300 })}
        <p className="text-muted text-xs">{t.shopDeliveryNote}</p>
      </section>

      {state.error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {pending ? t.shopCheckoutPending : t.shopCheckout}
      </button>
    </form>
  );
}
