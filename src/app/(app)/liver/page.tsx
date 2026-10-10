import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CircleCheck,
  Eye,
  FileText,
  TriangleAlert,
  Activity,
} from "lucide-react";
import { LabStatusChip } from "@/components/LabStatusChip";
import { TrendChart } from "@/components/charts/TrendChart";
import { EmergencyCard } from "@/components/liver/EmergencyCard";
import { biomarkerByKey } from "@/config/biomarkers";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { errorText, fmt, isErrorKey, type Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import {
  loadAssessments,
  loadHepatitis,
  loadLiverDefaults,
  loadLiverLabRows,
} from "@/lib/liver/server";
import {
  latestFib4,
  latestLabs,
  liverSeries,
  toPanels,
  trendNotes,
  trendableLiver,
} from "@/lib/liver/trend";
import { buildResultView, markerName } from "@/lib/liver/view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).liverTitle };
}

const ICON = { 0: CircleCheck, 1: Eye, 2: Eye, 3: TriangleAlert } as const;
const STYLE = {
  0: "border-secondary bg-tint-secondary",
  1: "border-warn bg-tint-warn",
  2: "border-warn bg-tint-warn",
  3: "border-danger bg-tint-danger",
} as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Liver health home: where the person stands (4 levels), the latest liver
 * blood tests with FIB-4, their trend over time, the hepatitis note, and the
 * doctor summary. Screening and navigation only — see docs/LIVER-MODULE.md.
 */
export default async function LiverPage({ searchParams }: PageProps<"/liver">) {
  if (!(await featureEnabled("liver_check"))) notFound();
  await requireUser();
  const sp = await searchParams;
  const today = bangkokDate(new Date());
  const [t, lang, rows, assessments, hep, defaults] = await Promise.all([
    getT(),
    getLang(),
    loadLiverLabRows(),
    loadAssessments(10),
    loadHepatitis(),
    loadLiverDefaults(),
  ]);
  const panels = toPanels(rows);
  const labs = latestLabs(panels);
  const fib = latestFib4(panels, defaults.birthYear);
  const latest = assessments[0];
  const view = latest ? buildResultView(latest.result, t, lang) : null;
  const Icon = latest ? ICON[latest.result.level] : Activity;

  const trendable = trendableLiver(rows);
  const marker = trendable.find((m) => m === sp.marker) ?? trendable[0];
  const m = marker ? biomarkerByKey(marker) : undefined;
  const series = marker ? liverSeries(rows, marker) : [];
  const notes = trendNotes(rows);
  const from = series.length ? series[0].date : today;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border-2 px-3.5 text-sm font-semibold ${
      active
        ? "border-primary-strong bg-tint-primary text-primary-strong"
        : "border-line bg-surface"
    }`;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.liverTitle}
        </h1>
        <p className="text-muted">{t.liverIntro}</p>
      </div>

      {typeof sp.error === "string" && isErrorKey(sp.error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(sp.error, t)}
        </p>
      ) : null}

      {view && latest?.result.urgency === "emergency" ? (
        <EmergencyCard
          title={view.title}
          body={view.body}
          cta={view.cta}
          callLabel={t.liverCall1669}
        />
      ) : (
        <section
          className={`space-y-2 rounded-2xl border-2 p-4 ${
            latest ? STYLE[latest.result.level] : "border-line bg-surface"
          }`}
          aria-labelledby="lv-status"
        >
          <h2
            id="lv-status"
            className="inline-flex items-center gap-2 text-sm font-semibold"
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {t.liverStatusTitle}
          </h2>
          {view && latest ? (
            <>
              <p className="text-lg font-bold">{view.title}</p>
              <p className="text-sm font-medium">{view.levelShort}</p>
              <p>{view.cta}</p>
              <p className="text-muted text-sm">
                {fmt(t.liverStatusOn, {
                  date: formatDate(lang, latest.created_at),
                })}
              </p>
              <Link
                href={`/liver/result/${latest.id}`}
                className="text-primary-strong text-sm font-semibold underline"
              >
                {t.liverSeeResult}
              </Link>
            </>
          ) : (
            <p>{t.liverStatusNone}</p>
          )}
        </section>
      )}

      <Link href="/liver/check" className="btn btn-primary w-full">
        {latest ? t.liverCheckAgain : t.liverCheckCta}
      </Link>

      <section className="card space-y-2" aria-labelledby="lv-labs">
        <h2 id="lv-labs" className="font-semibold">
          {t.liverLabsTitle}
        </h2>
        {labs.length === 0 ? (
          <>
            <p className="text-muted text-sm">{t.liverLabsNone}</p>
            <Link href="/scan/lab" className="btn btn-secondary">
              {t.liverLabsScan}
            </Link>
          </>
        ) : (
          <ul className="divide-line divide-y">
            {labs.map((l) => (
              <li
                key={l.marker}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="font-medium">{markerName(l.marker, lang)}</p>
                  <p className="text-muted text-sm">
                    {fmt(t.liverLabsOn, { date: formatDate(lang, l.date) })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">
                    {l.value} {l.unit}
                  </span>
                  <LabStatusChip t={t} status={l.status} />
                </div>
              </li>
            ))}
            {fib ? (
              <li className="space-y-0.5 py-2">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{t.liverFib4Row}</span>
                  {fib.score.status === "ok" ? (
                    <span className="font-semibold">{fib.score.value}</span>
                  ) : null}
                </p>
                <p className="text-sm">
                  {fib.score.status === "ok"
                    ? t[`liverBand_fib4_${fib.score.band}` as keyof Dict]
                    : fib.score.status === "insufficient"
                      ? fmt(t.liverScoreInsufficient, {
                          missing: fib.score.missing
                            .map((x) => t[`liverInput_${x}` as keyof Dict] ?? x)
                            .join(", "),
                        })
                      : fmt(t.liverScoreInvalid, {
                          fields: fib.score.fields.join(", "),
                        })}
                </p>
                <p className="text-muted text-xs">
                  {fmt(t.liverLabsOn, { date: formatDate(lang, fib.date) })}
                </p>
              </li>
            ) : null}
          </ul>
        )}
        <p className="text-muted text-xs">{t.liverDraftNote}</p>
      </section>

      <section className="card space-y-3" aria-labelledby="lv-trend">
        <h2 id="lv-trend" className="font-semibold">
          {t.liverTrendTitle}
        </h2>
        {marker && m ? (
          <>
            {notes.length ? (
              <div className="bg-tint-warn space-y-1 rounded-xl px-3 py-2">
                <p className="text-sm font-medium">{t.liverTrendNote}</p>
                <ul className="list-disc pl-5 text-sm">
                  {notes.map((n) => (
                    <li key={n.marker}>
                      {fmt(
                        t[`liverTrend${cap(n.kind)}` as keyof Dict] as string,
                        { marker: markerName(n.marker, lang) },
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="flex flex-wrap gap-2" aria-label={t.liverTrendPick}>
              {trendable.map((k) => (
                <li key={k}>
                  <Link
                    href={`/liver?marker=${k}`}
                    className={chip(k === marker)}
                    aria-current={k === marker ? "page" : undefined}
                  >
                    {markerName(k, lang)}
                  </Link>
                </li>
              ))}
            </ul>
            <TrendChart
              t={t}
              lang={lang}
              title={markerName(marker, lang)}
              unit={m.unit}
              points={series}
              from={from}
              to={today}
              band={m.normal}
              joinGaps
            />
          </>
        ) : (
          <p className="text-muted text-sm">{t.liverTrendNone}</p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="card space-y-2" aria-labelledby="lv-brief">
          <h2
            id="lv-brief"
            className="inline-flex items-center gap-2 font-semibold"
          >
            <FileText className="text-primary-strong size-5" aria-hidden />
            {t.liverBriefCardTitle}
          </h2>
          <p className="text-sm">{t.liverBriefCardBody}</p>
          <Link href="/liver/brief" className="btn btn-secondary w-full">
            {t.liverBriefCardCta}
          </Link>
        </section>
        <section className="card space-y-2" aria-labelledby="lv-hep">
          <h2 id="lv-hep" className="font-semibold">
            {t.liverHepCardTitle}
          </h2>
          <p className="text-sm">
            {hep
              ? `B: ${t[`liverHepB_${hep.hep_b}` as keyof Dict]} · C: ${t[`liverHepC_${hep.hep_c}` as keyof Dict]}`
              : t.liverHepCardBody}
          </p>
          <Link href="/liver/hepatitis" className="btn btn-secondary w-full">
            {t.liverHepCardCta}
          </Link>
        </section>
      </div>

      {assessments.length ? (
        <section className="space-y-2" aria-labelledby="lv-history">
          <h2 id="lv-history" className="font-semibold">
            {t.liverHistoryTitle}
          </h2>
          <ul className="space-y-2">
            {assessments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/liver/result/${a.id}`}
                  className="card hover:bg-tint-primary block text-sm font-medium"
                >
                  {fmt(t.liverHistoryRow, {
                    date: formatDate(lang, a.created_at),
                    level: t[`liverLevelShort_${a.result.level}` as keyof Dict],
                  })}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-muted text-xs">{t.liverHistoryNote}</p>
        </section>
      ) : null}

      <p className="bg-tint-secondary rounded-xl px-3 py-2 text-sm">
        {t.liverDisclaimer}
      </p>
    </div>
  );
}
