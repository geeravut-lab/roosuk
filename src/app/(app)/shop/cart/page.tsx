import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setCartQtyAction } from "@/app/actions/shop";
import { Thumb } from "@/components/shop/Photos";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { errorText, isErrorKey } from "@/lib/i18n/dict";
import { getLang, getT } from "@/lib/i18n/server";
import { loadBalance } from "@/lib/rewards/server";
import { loadPlatformSettings } from "@/lib/settings/server";
import { loadCart } from "@/lib/shop/server";
import { CheckoutForm } from "./CheckoutForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).shopCart };
}

export default async function CartPage({
  searchParams,
}: PageProps<"/shop/cart">) {
  if (!(await featureEnabled("marketplace"))) notFound();
  const user = await requireUser();
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const [t, lang, settings, balance] = await Promise.all([
    getT(),
    getLang(),
    loadPlatformSettings(),
    loadBalance(user.id),
  ]);
  const lines = await loadCart(user.id, lang);

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">{t.shopCart}</h1>
      {sp.added ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.shopCartAdded}
        </p>
      ) : null}
      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      {lines.length === 0 ? (
        <div className="card space-y-3">
          <p>{t.shopCartEmpty}</p>
          <Link href="/shop" className="btn btn-primary">
            {t.shopBack}
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3" aria-label={t.shopCart}>
            {lines.map(({ product: p, qty }) => (
              <li key={p.id} className="card flex gap-3">
                <div className="w-20 shrink-0">
                  <Thumb t={t} name={p.name} id={p.cover} />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Link href={`/shop/${p.id}`} className="font-semibold">
                    {p.name}
                  </Link>
                  <p className="text-sm">
                    ฿{p.price_thb.toLocaleString("en-US")}
                  </p>
                  <form
                    action={setCartQtyAction}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="productId" value={p.id} />
                    <label htmlFor={`q-${p.id}`} className="sr-only">
                      {t.shopQty}
                    </label>
                    <input
                      id={`q-${p.id}`}
                      name="qty"
                      type="number"
                      min={0}
                      max={10}
                      defaultValue={qty}
                      className="field w-20"
                    />
                    <SubmitButton className="btn btn-secondary">
                      {t.shopCartUpdate}
                    </SubmitButton>
                    {p.availability === "out" ? (
                      <span className="bg-tint-warn rounded-full px-2.5 py-0.5 text-xs font-semibold">
                        {t.shopOut}
                      </span>
                    ) : null}
                  </form>
                  <form action={setCartQtyAction}>
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="qty" value="0" />
                    <SubmitButton
                      className="text-primary-strong text-sm font-medium underline"
                      aria-label={`${t.shopCartRemove}: ${p.name}`}
                    >
                      {t.shopCartRemove}
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <CheckoutForm
            lines={lines.map((l) => ({
              price: l.product.price_thb,
              qty: l.qty,
            }))}
            settings={settings.shop}
            balance={balance}
            maxPerUse={settings.rewards.redeemMaxOtherThb}
          />
          <p className="text-muted text-xs">{t.shopDisclaimer}</p>
        </>
      )}
    </div>
  );
}
