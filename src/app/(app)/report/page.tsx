import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteReportAction, generateReportAction } from "@/app/actions/report";
import { PendingButton } from "@/components/PendingButton";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { errorText, fmt } from "@/lib/i18n/dict";
import { getLang, getT } from "@/lib/i18n/server";
import {
  MIN_CHECKIN_DAYS,
  currentMonth,
  parseMonth,
} from "@/lib/report/monthly";
import {
  allowedMonths,
  loadMonthlyStats,
  loadNarrative,
} from "@/lib/report/server";
import { SubmitButton } from "@/components/SubmitButton";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reportTitle };
}

const monthName = (month: string, lang: "th" | "en") =>
  new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00Z`));

export default async function ReportPage({
  searchParams,
}: PageProps<"/report">) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!(await featureEnabled("monthly_report"))) notFound();
  const now = new Date();
  const today = bangkokDate(now);
  const [t, lang, months] = await Promise.all([
    getT(),
    getLang(),
    allowedMonths(user.id, now),
  ]);
  if (months.length === 0)
    return (
      <div className="space-y-4">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.reportTitle}
        </h1>
        <p className="card">{t.reportEmpty}</p>
      </div>
    );
  const asked = parseMonth(sp.month, today);
  const month = asked && months.includes(asked) ? asked : months[0];
  const [stats, narrative] = await Promise.all([
    loadMonthlyStats(month, today, lang),
    loadNarrative(month),
  ]);
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border-2 px-3.5 text-sm font-semibold ${
      active
        ? "border-primary-strong bg-tint-primary text-primary-strong"
        : "border-line bg-surface"
    }`;
  const quiet = stats.checkinDays < MIN_CHECKIN_DAYS;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.reportTitle}
        </h1>
        <p className="text-muted text-sm">{t.reportIntro}</p>
      </div>

      <nav aria-label={t.reportMonthLabel}>
        <ul className="flex flex-wrap gap-2">
          {months.map((m) => (
            <li key={m}>
              <Link
                href={`/report?month=${m}`}
                className={chip(m === month)}
                aria-current={m === month ? "page" : undefined}
              >
                {monthName(m, lang)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      <section className="card space-y-2" aria-labelledby="fig-h">
        <h2 id="fig-h" className="font-semibold">
          {monthName(month, lang)}
        </h2>
        {month === currentMonth(today) ? (
          <p className="text-muted text-sm">{t.reportMonthOpen}</p>
        ) : null}
        <ul className="space-y-2">
          <li>
            <span className="font-semibold">
              {fmt(t.reportCheckins, {
                n: stats.checkinDays,
                total: stats.daysElapsed,
              })}
            </span>
            <span className="text-muted block text-sm">
              {fmt(t.reportCheckinsPrev, { n: stats.prevCheckinDays })}
            </span>
          </li>
          <li>
            {stats.avgScore === null
              ? t.reportScoreNone
              : fmt(t.reportScore, { n: stats.avgScore })}
          </li>
          <li>{fmt(t.reportStreak, { n: stats.bestStreak })}</li>
          <li>
            {fmt(t.reportMeals, { n: stats.mealsLogged, days: stats.mealDays })}
          </li>
          <li>{fmt(t.reportLabs, { n: stats.labReports })}</li>
          {stats.labReports > 0 ? (
            <li className="text-sm">
              {stats.outOfRange.length > 0
                ? fmt(t.reportOut, {
                    names: stats.outOfRange.map((o) => o.name).join(", "),
                  })
                : t.reportOutNone}
            </li>
          ) : null}
          <li>{fmt(t.reportBadges, { n: stats.badges.length })}</li>
        </ul>
      </section>

      <section className="card space-y-3" aria-labelledby="ai-h">
        <h2 id="ai-h" className="font-semibold">
          {t.reportAiTitle}
        </h2>
        {narrative ? (
          <>
            <p className="whitespace-pre-wrap">{narrative.summary}</p>
            {narrative.highlights.length > 0 ? (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{t.reportHighlights}</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {narrative.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {narrative.nextSteps.length > 0 ? (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{t.reportNext}</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {narrative.nextSteps.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-muted text-xs">{t.reportDisclaimer}</p>
            <form action={deleteReportAction}>
              <input type="hidden" name="month" value={month} />
              <SubmitButton className="btn btn-ghost w-full">
                {t.reportAiDelete}
              </SubmitButton>
            </form>
          </>
        ) : quiet ? (
          <p className="text-sm">
            {fmt(t.reportQuiet, { n: MIN_CHECKIN_DAYS })}
          </p>
        ) : (
          <form action={generateReportAction} className="space-y-2">
            <input type="hidden" name="month" value={month} />
            <p className="text-muted text-sm">{t.reportAiHint}</p>
            <PendingButton
              pendingLabel={t.reportAiBusy}
              className="btn btn-secondary w-full"
            >
              {t.reportAiCta}
            </PendingButton>
          </form>
        )}
      </section>

      <p className="text-muted text-xs">{t.reportWindow}</p>
    </div>
  );
}
