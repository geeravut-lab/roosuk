import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShoppingCart, Sparkles } from "lucide-react";
import { Thumb } from "@/components/shop/Photos";
import { requireUser } from "@/lib/auth/server";
import { tierFor } from "@/lib/billing/entitlement.server";
import { featureEnabled } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { loadCheckins } from "@/lib/health/server";
import { computeHealthScore } from "@/lib/health/score";
import { errorText, fmt, isErrorKey, type Dict } from "@/lib/i18n/dict";
import { getLang, getT } from "@/lib/i18n/server";
import { PROFILE_COLUMNS, type HealthProfile } from "@/lib/profile/profile";
import { loadBalance } from "@/lib/rewards/server";
import { loadPlatformSettings } from "@/lib/settings/server";
import { FOCUS_TAGS, isFocusTag } from "@/lib/shop/product";
import { recommend, wantedTags } from "@/lib/shop/recommend";
import { loadCatalog, type CatalogItem } from "@/lib/shop/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navShop };
}

function Card({ t, p }: { t: Dict; p: CatalogItem }) {
  return (
    <Link
      href={`/shop/${p.id}`}
      className="card hover:bg-tint-primary block space-y-2"
    >
      <Thumb t={t} name={p.name} id={p.cover} />
      <p className="font-semibold">{p.name}</p>
      {p.summary ? (
        <p className="text-muted line-clamp-2 text-sm">{p.summary}</p>
      ) : null}
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-primary-strong text-lg font-bold">
          ฿{p.price_thb.toLocaleString("en-US")}
        </span>
        {p.compare_at_thb ? (
          <span className="text-muted text-sm line-through">
            {fmt(t.shopSale, { n: p.compare_at_thb })}
          </span>
        ) : null}
      </p>
      {p.availability !== "in" ? (
        <p className="bg-tint-warn inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold">
          {p.availability === "out" ? t.shopOut : t.shopLow}
        </p>
      ) : null}
    </Link>
  );
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  if (!(await featureEnabled("marketplace"))) notFound();
  const user = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const tagParam = one(sp.tag);
  const tag = isFocusTag(tagParam) ? tagParam : null;
  const error = one(sp.error);
  const [t, lang, tier, settings, balance] = await Promise.all([
    getT(),
    getLang(),
    tierFor(user.id),
    loadPlatformSettings(),
    loadBalance(user.id),
  ]);
  const all = await loadCatalog(lang);
  const shown = tag ? all.filter((p) => p.focus_tags.includes(tag)) : all;

  // "Picked for you" — Gold and up, from goals + the area the check-ins say needs most attention.
  const picks = await (async () => {
    if (tier === "free") return null;
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("health_profiles")
      .select(PROFILE_COLUMNS)
      .maybeSingle<HealthProfile>();
    const today = bangkokDate(new Date());
    const score = computeHealthScore(await loadCheckins(today, 14), today);
    const wants = wantedTags(profile?.goals ?? [], score.focus);
    return { wants, items: recommend(all, wants) };
  })();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-primary-strong text-2xl font-bold">
            {t.shopTitle}
          </h1>
          <p className="text-muted">{t.shopIntro}</p>
        </div>
        <Link
          href="/shop/cart"
          className="btn btn-secondary shrink-0"
          aria-label={t.shopCart}
        >
          <ShoppingCart className="size-5" aria-hidden />
        </Link>
      </div>
      <p className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
        {t.shopDisclaimer}
      </p>
      <p className="text-sm font-medium">
        {fmt(t.shopCredit, {
          balance,
          max: settings.rewards.redeemMaxOtherThb,
        })}
      </p>
      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      {picks === null ? (
        <p className="text-muted text-sm">{t.shopForYouPlan}</p>
      ) : picks.items.length > 0 ? (
        <section className="space-y-3" aria-labelledby="shop-picks">
          <h2
            id="shop-picks"
            className="inline-flex items-center gap-2 font-semibold"
          >
            <Sparkles className="text-primary-strong size-5" aria-hidden />
            {t.shopForYou}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {picks.items.map(({ product, matched }) => (
              <li key={product.id} className="space-y-1">
                <Card t={t} p={product} />
                <p className="text-muted px-1 text-xs">
                  {fmt(
                    picks.wants.because[matched[0]] === "goal"
                      ? t.shopForYouWhy_goal
                      : t.shopForYouWhy_checkin,
                    {
                      tags: matched
                        .map((m) => t[`shopTag_${m}` as keyof Dict])
                        .join(", "),
                    },
                  )}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-muted text-xs">{t.shopForYouNote}</p>
        </section>
      ) : null}

      <nav aria-label={t.shopFilterLabel}>
        <ul className="flex flex-wrap gap-2">
          {[null, ...FOCUS_TAGS].map((f) => (
            <li key={f ?? "all"}>
              <Link
                href={f ? `/shop?tag=${f}` : "/shop"}
                aria-current={f === tag ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border-2 px-3.5 text-sm font-semibold ${
                  f === tag
                    ? "border-primary-strong bg-tint-primary text-primary-strong"
                    : "border-line bg-surface"
                }`}
              >
                {f ? t[`shopTag_${f}` as keyof Dict] : t.shopFilterAll}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <p className="card">{t.shopEmpty}</p>
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          aria-label={t.shopTitle}
        >
          {shown.map((p) => (
            <li key={p.id}>
              <Card t={t} p={p} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-center">
        <Link
          href="/shop/orders"
          className="text-primary-strong font-medium underline"
        >
          {t.shopOrders}
        </Link>
      </p>
    </div>
  );
}
