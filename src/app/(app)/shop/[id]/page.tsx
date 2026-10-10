import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { addToCartAction } from "@/app/actions/shop";
import { Gallery } from "@/components/shop/Photos";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import { isKycVerified } from "@/lib/ekyc/server";
import { featureEnabled } from "@/lib/flags/server";
import { errorText, fmt, isErrorKey, type Dict } from "@/lib/i18n/dict";
import { getLang, getT } from "@/lib/i18n/server";
import { loadProduct, localized } from "@/lib/shop/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: PageProps<"/shop/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = UUID.test(id) ? await loadProduct(id, await getLang()) : null;
  return { title: p?.name ?? (await getT()).navShop };
}

export default async function ProductPage({
  params,
  searchParams,
}: PageProps<"/shop/[id]">) {
  if (!(await featureEnabled("marketplace"))) notFound();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const [t, lang, askPharmacist, kycOk] = await Promise.all([
    getT(),
    getLang(),
    featureEnabled("telepharmacy"),
    isKycVerified(user.id),
  ]);
  const p = await loadProduct(id, lang);
  if (!p) notFound();
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const { description } = localized(p, lang);
  const section = (title: string, body: string | null) =>
    body ? (
      <section className="space-y-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm whitespace-pre-wrap">{body}</p>
      </section>
    ) : null;

  return (
    <div className="space-y-5">
      <Link
        href="/shop"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.shopBack}
      </Link>
      <Gallery t={t} name={p.name} images={p.images} />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{p.name}</h1>
        {p.brand ? (
          <p className="text-muted text-sm">
            {fmt(t.shopBrand, { b: p.brand })}
          </p>
        ) : null}
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-primary-strong text-3xl font-bold">
            ฿{p.price_thb.toLocaleString("en-US")}
          </span>
          {p.compare_at_thb ? (
            <span className="text-muted line-through">
              {fmt(t.shopSale, { n: p.compare_at_thb })}
            </span>
          ) : null}
        </p>
        {p.focus_tags.length ? (
          <ul className="flex flex-wrap gap-2 pt-1">
            {p.focus_tags.map((tag) => (
              <li
                key={tag}
                className="bg-tint-primary rounded-full px-2.5 py-0.5 text-xs font-semibold"
              >
                {t[`shopTag_${tag}` as keyof Dict]}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      {p.requires_kyc ? (
        <p className="bg-tint-primary rounded-xl px-3 py-2 text-sm">
          {kycOk ? t.shopKycOk : t.shopKycNeeded}{" "}
          {kycOk ? null : (
            <Link
              href={`/verify?next=/shop/${p.id}`}
              className="text-primary-strong font-semibold underline"
            >
              {t.kycGoVerify}
            </Link>
          )}
        </p>
      ) : null}

      {p.availability === "out" ? (
        <p className="bg-tint-warn rounded-xl px-3 py-2 font-semibold">
          {t.shopOut}
        </p>
      ) : (
        <form
          action={addToCartAction}
          className="card flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="productId" value={p.id} />
          <div>
            <label htmlFor="qty" className="label">
              {t.shopQty}
            </label>
            <input
              id="qty"
              name="qty"
              type="number"
              min={1}
              max={10}
              defaultValue={1}
              className="field w-24"
            />
          </div>
          <SubmitButton className="btn btn-primary flex-1">
            {t.shopAdd}
          </SubmitButton>
          {p.availability === "low" ? (
            <p className="text-sm font-medium">{t.shopLow}</p>
          ) : null}
        </form>
      )}

      <section className="space-y-4" aria-labelledby="shop-details">
        <h2 id="shop-details" className="sr-only">
          {t.shopDetails}
        </h2>
        {section(t.shopDetails, description ?? p.summary)}
        {section(t.shopIngredients, p.ingredients)}
        {section(t.shopUsage, p.usage_note)}
        {section(t.shopCaution, p.caution)}
        <p className="text-muted text-sm">
          {[
            p.fda_no ? fmt(t.shopFda, { no: p.fda_no }) : null,
            p.serving ? fmt(t.shopServing, { s: p.serving }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>
      {askPharmacist ? (
        <Link
          href={`/telepharmacy?product=${p.id}`}
          className="btn btn-secondary w-full"
        >
          <Stethoscope className="size-5" aria-hidden />
          {t.shopAskPharmacist}
        </Link>
      ) : null}
      <p className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
        {t.shopDisclaimer}
      </p>
    </div>
  );
}
