import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown } from "lucide-react";
import {
  deleteAllWearableDataAction,
  enableSourceAction,
  revokeIngestTokenAction,
  revokeSourceAction,
} from "@/app/actions/wearables";
import { TrendChart } from "@/components/charts/TrendChart";
import { SubmitButton } from "@/components/SubmitButton";
import { PLANS } from "@/config/plans";
import { requireUser } from "@/lib/auth/server";
import { tierFor } from "@/lib/billing/entitlement.server";
import { featureEnabled } from "@/lib/flags/server";
import { addDays, bangkokDate } from "@/lib/health/dates";
import { errorText, fmt, isErrorKey, type Dict } from "@/lib/i18n/dict";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { dailySeries } from "@/lib/wearables/series";
import { loadObservations } from "@/lib/wearables/server";
import {
  CONSENT_SOURCES,
  OBS_TYPE_KEYS,
  OBS_TYPES,
  type ConsentSource,
} from "@/lib/wearables/types";
import { ImportPanel } from "./ImportPanel";
import { ManualForm } from "./ManualForm";
import { TokenForm } from "./TokenForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).wearTitle };
}

const WINDOW_DAYS = 30;

export default async function WearablesPage({
  searchParams,
}: PageProps<"/wearables">) {
  if (!(await featureEnabled("wearables"))) notFound();
  const user = await requireUser();
  const { error } = await searchParams;
  const today = bangkokDate(new Date());
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const supabase = await createClient();
  const [t, lang, tierId, sources, tokens, rows] = await Promise.all([
    getT(),
    getLang(),
    tierFor(user.id),
    supabase
      .from("wearable_sources")
      .select("source, consented_at, revoked_at")
      .returns<
        {
          source: ConsentSource;
          consented_at: string;
          revoked_at: string | null;
        }[]
      >(),
    supabase
      .from("ingest_tokens")
      .select("id, label, last_used_at, revoked_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<
        {
          id: string;
          label: string;
          last_used_at: string | null;
          revoked_at: string | null;
          created_at: string;
        }[]
      >(),
    loadObservations(from),
  ]);
  const tier = PLANS[tierId].wearables;
  const on = new Map(
    (sources.data ?? []).filter((s) => !s.revoked_at).map((s) => [s.source, s]),
  );
  const series = dailySeries(rows);

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">{t.wearTitle}</h1>
      <p>{t.wearIntro}</p>

      {typeof error === "string" && isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      {tier === "none" ? (
        <section className="card space-y-2" aria-labelledby="wear-plan">
          <h2
            id="wear-plan"
            className="inline-flex items-center gap-2 font-semibold"
          >
            <Crown className="text-primary-strong size-5" aria-hidden />
            {t.wearPlanTitle}
          </h2>
          <p>{t.wearPlanBody}</p>
          <Link href="/subscription" className="btn btn-primary">
            {t.passportUpgrade}
          </Link>
        </section>
      ) : (
        <>
          <p className="text-muted text-sm">
            {tier === "full" ? t.wearTierFull : t.wearTierBasic}
          </p>

          <section className="card space-y-3" aria-labelledby="wear-over">
            <h2 id="wear-over" className="font-semibold">
              {fmt(t.wearOverviewTitle, { n: WINDOW_DAYS })}
            </h2>
            {OBS_TYPE_KEYS.filter((k) => series[k]?.length).length === 0 ? (
              <p className="text-muted">{t.wearNoData}</p>
            ) : (
              OBS_TYPE_KEYS.filter((k) => series[k]?.length).map((k) => {
                const pts = series[k]!;
                const avg =
                  Math.round(
                    (pts.reduce((a, p) => a + p.value, 0) / pts.length) * 10,
                  ) / 10;
                return (
                  <div key={k} className="space-y-1">
                    <h3 className="text-sm font-semibold">
                      {t[`wearType_${k}` as keyof Dict]}
                    </h3>
                    <p className="text-muted text-sm">
                      {fmt(t.wearAvgOf, { avg, days: pts.length })}
                    </p>
                    <TrendChart
                      t={t}
                      lang={lang}
                      title={t[`wearType_${k}` as keyof Dict]}
                      unit={OBS_TYPES[k].unit}
                      points={pts}
                      from={from}
                      to={today}
                      joinGaps
                      formatValue={(v) => String(Math.round(v * 10) / 10)}
                    />
                  </div>
                );
              })
            )}
            <p className="text-muted text-xs">{t.wearNote}</p>
          </section>

          <section className="card space-y-4" aria-labelledby="wear-src">
            <h2 id="wear-src" className="font-semibold">
              {t.wearSourcesTitle}
            </h2>
            <ul className="divide-line divide-y">
              {CONSENT_SOURCES.map((s) => {
                const row = on.get(s);
                return (
                  <li key={s} className="space-y-2 py-3">
                    <p className="font-medium">
                      {t[`wearSource_${s}` as keyof Dict]}
                    </p>
                    {row ? (
                      <>
                        <p className="text-sm">
                          {fmt(t.wearSourceOn, {
                            date: formatDate(lang, row.consented_at),
                          })}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <form action={revokeSourceAction}>
                            <input type="hidden" name="source" value={s} />
                            <SubmitButton className="btn btn-secondary">
                              {t.wearWithdraw}
                            </SubmitButton>
                          </form>
                          <form action={revokeSourceAction}>
                            <input type="hidden" name="source" value={s} />
                            <input type="hidden" name="erase" value="1" />
                            <SubmitButton className="btn btn-secondary">
                              {t.wearWithdrawErase}
                            </SubmitButton>
                          </form>
                        </div>
                      </>
                    ) : (
                      <form action={enableSourceAction} className="space-y-2">
                        <input type="hidden" name="source" value={s} />
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            name="ack"
                            required
                            className="mt-1 size-5"
                          />
                          <span className="text-sm">{t.wearAck}</span>
                        </label>
                        <SubmitButton className="btn btn-secondary">
                          {t.wearEnable}
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card space-y-4" aria-labelledby="wear-imp">
            <h2 id="wear-imp" className="font-semibold">
              {t.wearImportTitle}
            </h2>
            <ImportPanel
              today={today}
              appleOn={on.has("apple_health")}
              csvOn={on.has("csv")}
            />
          </section>

          <section className="card space-y-3" aria-labelledby="wear-man">
            <h2 id="wear-man" className="font-semibold">
              {t.wearManualTitle}
            </h2>
            <ManualForm today={today} tier={tier} />
          </section>

          <section className="card space-y-3" aria-labelledby="wear-tok">
            <h2 id="wear-tok" className="font-semibold">
              {t.wearTokensTitle}
            </h2>
            <p className="text-muted text-sm">{t.wearTokensHint}</p>
            <ul className="divide-line divide-y">
              {(tokens.data ?? []).map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="font-medium">{k.label}</p>
                    <p className="text-muted text-sm">
                      {k.revoked_at
                        ? t.wearTokenRevoked
                        : k.last_used_at
                          ? fmt(t.wearTokenLastUsed, {
                              date: formatDateTime(lang, k.last_used_at),
                            })
                          : t.wearTokenNeverUsed}
                    </p>
                  </div>
                  {k.revoked_at ? null : (
                    <form action={revokeIngestTokenAction}>
                      <input type="hidden" name="id" value={k.id} />
                      <SubmitButton className="btn btn-secondary">
                        {t.wearTokenRevoke}
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <TokenForm />
          </section>
        </>
      )}

      <section className="card space-y-2" aria-labelledby="wear-erase">
        <h2 id="wear-erase" className="font-semibold">
          {t.wearEraseAll}
        </h2>
        <p className="text-muted text-sm">{t.wearEraseHint}</p>
        <form action={deleteAllWearableDataAction}>
          <SubmitButton className="btn btn-secondary">
            {t.wearEraseAll}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
