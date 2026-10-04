import type { Metadata } from "next";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import {
  MIN_VIEWERS,
  rate,
  tally,
  type PaywallVariant,
} from "@/lib/paywall/paywall";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaywallForm } from "./PaywallForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminPaywallTitle };
}

export default async function AdminPaywallPage() {
  invalidatePlatformSettingsCache(); // admins see the truth, not a cached copy
  const [t, { paywallMode }, events] = await Promise.all([
    getT(),
    loadPlatformSettings(),
    createAdminClient()
      .from("product_events")
      .select("user_id, event, detail")
      .in("event", [
        "paywall_viewed",
        "order_created",
        "payment_reported",
        "subscribed",
      ])
      .in("detail", ["pw_a", "pw_b"])
      .limit(100_000)
      .returns<
        { user_id: string | null; event: string; detail: string | null }[]
      >(),
  ]);
  const stats = tally(events.data ?? []);
  const tooFew = stats.a.viewed < MIN_VIEWERS || stats.b.viewed < MIN_VIEWERS;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminPaywallTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminPaywallHint}</p>
      </div>
      <div className="card">
        <PaywallForm current={paywallMode} />
      </div>
      <section className="space-y-3" aria-labelledby="pw-res">
        <h2 id="pw-res" className="font-semibold">
          {t.adminPaywallResults}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as PaywallVariant[]).map((v) => {
            const s = stats[v];
            const r = rate(s.subscribed, s.viewed);
            return (
              <li key={v} className="card space-y-1">
                <h3 className="font-semibold">
                  {fmt(t.adminPaywallVersion, { v: v.toUpperCase() })}
                </h3>
                <dl className="text-sm">
                  <div className="flex justify-between">
                    <dt>{t.adminPaywallViewed}</dt>
                    <dd className="font-semibold">{s.viewed}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t.adminPaywallOrdered}</dt>
                    <dd className="font-semibold">{s.ordered}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t.adminPaywallReported}</dt>
                    <dd className="font-semibold">{s.reported}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t.adminPaywallSubscribed}</dt>
                    <dd className="font-semibold">{s.subscribed}</dd>
                  </div>
                </dl>
                <p className="text-primary-strong text-sm font-semibold">
                  {r === null ? "–" : fmt(t.adminPaywallRate, { n: r })}
                </p>
              </li>
            );
          })}
        </ul>
        {tooFew ? (
          <p className="card bg-tint-warn text-sm">
            {fmt(t.adminPaywallTooFew, { n: MIN_VIEWERS })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
