import type { Metadata } from "next";
import Link from "next/link";
import {
  EVENTS,
  buildFunnel,
  parseAnalytics,
  retentionRate,
} from "@/lib/analytics/events";
import type { Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminAnalyticsTitle };
}

const WINDOWS = [7, 30, 90] as const;

export default async function AnalyticsPage({
  searchParams,
}: PageProps<"/admin/analytics">) {
  const { days: raw } = await searchParams;
  const days = WINDOWS.find((d) => String(d) === raw) ?? 30;
  const t = await getT();
  const { data } = await createAdminClient().rpc("admin_analytics", {
    p_days: days,
  });
  const a = parseAnalytics(data);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminAnalyticsTitle}
        </h1>
        <p className="text-muted text-sm">{t.analyticsPrivacy}</p>
      </div>

      <nav aria-label={t.analyticsWindow} className="flex flex-wrap gap-2">
        {WINDOWS.map((d) => (
          <Link
            key={d}
            href={`/admin/analytics?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={`btn ${d === days ? "btn-primary" : "btn-secondary"}`}
          >
            {fmt(t.analyticsDays, { n: d })}
          </Link>
        ))}
      </nav>

      {!a ? (
        <p role="alert" className="card">
          {t.analyticsEmpty}
        </p>
      ) : (
        <>
          <section aria-labelledby="active-h" className="space-y-2">
            <h2 id="active-h" className="font-semibold">
              {t.analyticsActive}
            </h2>
            <dl className="grid grid-cols-3 gap-2">
              {(
                [
                  ["analyticsDau", a.dau],
                  ["analyticsWau", a.wau],
                  ["analyticsMau", a.mau],
                ] as const
              ).map(([key, n]) => (
                <div key={key} className="card flex flex-col-reverse">
                  <dt className="text-muted text-sm">{t[key]}</dt>
                  <dd className="text-primary-strong text-3xl font-bold">
                    {n}
                  </dd>
                </div>
              ))}
            </dl>
            <DailyBars t={t} daily={a.daily} />
          </section>

          <section aria-labelledby="funnel-h" className="space-y-2">
            <h2 id="funnel-h" className="font-semibold">
              {t.analyticsFunnel}
            </h2>
            <p className="text-muted text-sm">{t.analyticsFunnelNote}</p>
            <ol className="space-y-2">
              {buildFunnel(a.funnel).map((row) => (
                <li key={row.step} className="card space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      {t[`funnelStep_${row.step}` as keyof Dict]}
                    </span>
                    <span className="text-lg font-bold">{row.count}</span>
                  </div>
                  <div
                    aria-hidden
                    className="bg-tint-primary h-2 overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${row.ofFirst}%` }}
                    />
                  </div>
                  {row.ofPrevious !== null ? (
                    <p className="text-muted text-sm">
                      {fmt(t.analyticsOfPrevious, { pct: row.ofPrevious })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="ret-h" className="space-y-2">
            <h2 id="ret-h" className="font-semibold">
              {t.analyticsRetention}
            </h2>
            <dl className="grid grid-cols-2 gap-2">
              {(
                [
                  ["analyticsD1", a.retention.d1_back, a.retention.d1_cohort],
                  ["analyticsD7", a.retention.d7_back, a.retention.d7_cohort],
                ] as const
              ).map(([key, back, cohort]) => {
                const rate = retentionRate(back, cohort);
                return (
                  <div key={key} className="card">
                    <dt className="text-muted text-sm">{t[key]}</dt>
                    <dd>
                      <span className="text-primary-strong block text-2xl font-bold">
                        {rate === null
                          ? "—"
                          : fmt(t.analyticsRetentionValue, { pct: rate })}
                      </span>
                      <span className="text-muted block text-xs">
                        {cohort
                          ? fmt(t.analyticsCohort, { back, cohort })
                          : t.analyticsNoCohort}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section aria-labelledby="ev-h" className="space-y-2">
            <h2 id="ev-h" className="font-semibold">
              {t.analyticsEvents}
            </h2>
            {a.events.length === 0 ? (
              <p className="card">{t.analyticsEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {a.events.map((e) => (
                  <li
                    key={e.event}
                    className="card flex items-baseline justify-between gap-3"
                  >
                    <span className="font-medium">
                      {(EVENTS as readonly string[]).includes(e.event)
                        ? t[`eventName_${e.event}` as keyof Dict]
                        : e.event}
                    </span>
                    <span className="text-muted text-sm">
                      {fmt(t.analyticsEventRow, {
                        total: e.total,
                        users: e.users,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function DailyBars({
  t,
  daily,
}: {
  t: Dict;
  daily: { day: string; active: number }[];
}) {
  const max = Math.max(1, ...daily.map((d) => d.active));
  const total = daily.reduce((n, d) => n + d.active, 0);
  return (
    <div className="card space-y-2">
      <p className="text-muted text-sm">{t.analyticsDaily}</p>
      <div
        role="img"
        aria-label={fmt(t.analyticsDailySummary, { max, total })}
        className="flex h-24 items-end gap-0.5"
      >
        {daily.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.active}`}
            className="bg-primary min-h-px flex-1 rounded-t"
            style={{
              height: `${Math.max(2, Math.round((d.active / max) * 100))}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
