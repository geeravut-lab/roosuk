import { LabStatusChip } from "@/components/LabStatusChip";
import { TrendChart } from "@/components/charts/TrendChart";
import { biomarkerByKey } from "@/config/biomarkers";
import { fmt, type Dict, type Lang } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { chartFrom, type LiverBrief } from "@/lib/liver/brief";
import { markerName, buildResultView } from "@/lib/liver/view";
import { ResultCard } from "./ResultCard";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/**
 * "Prepare for my liver check-up": what a doctor reads. Server component with
 * no client state, shared by /liver/brief (own preview and print) and the
 * `liver` section of a Health Passport, so both show exactly the same page.
 * It lists what was recorded and never says what the person "has".
 */
export function BriefView({
  t,
  lang,
  brief,
  today,
}: {
  t: Dict;
  lang: Lang;
  brief: LiverBrief;
  /** the last day drawn on the charts: the day the brief was made */
  today: string;
}) {
  const dash = "—";
  const a = brief.answers;
  const view = brief.result ? buildResultView(brief.result, t, lang) : null;
  return (
    <div className="space-y-4">
      {view ? (
        <section className="space-y-2" aria-labelledby="lb-assess">
          <h2 id="lb-assess" className="font-semibold">
            {t.liverBriefAssessment}
            {brief.assessedOn ? (
              <span className="text-muted ml-2 text-sm font-normal">
                {fmt(t.liverStatusOn, {
                  date: formatDate(lang, brief.assessedOn),
                })}
              </span>
            ) : null}
          </h2>
          <ResultCard t={t} view={view} />
        </section>
      ) : (
        <p className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
          {t.liverBriefNoAssessment}
        </p>
      )}

      <section className="card space-y-2" aria-labelledby="lb-labs">
        <h2 id="lb-labs" className="font-semibold">
          {t.liverBriefLabs}
        </h2>
        {brief.labs.length === 0 ? (
          <p className="text-muted text-sm">{t.liverLabsNone}</p>
        ) : (
          <ul className="divide-line divide-y">
            {brief.labs.map((l) => (
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
          </ul>
        )}
        <p className="text-muted text-xs">{t.liverDraftNote}</p>
      </section>

      {brief.trends.length > 0 || brief.fib4Trend.length > 0 ? (
        <section className="card space-y-4" aria-labelledby="lb-trend">
          <h2 id="lb-trend" className="font-semibold">
            {t.liverBriefTrends}
          </h2>
          {brief.trendNotes.length ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">{t.liverTrendNote}</p>
              <ul className="list-disc pl-5 text-sm">
                {brief.trendNotes.map((n) => (
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
          {brief.trends.map((tr) => {
            const m = biomarkerByKey(tr.marker);
            return (
              <div key={tr.marker} className="space-y-1">
                <h3 className="text-sm font-semibold">
                  {markerName(tr.marker, lang)}
                </h3>
                <TrendChart
                  t={t}
                  lang={lang}
                  title={markerName(tr.marker, lang)}
                  unit={m?.unit ?? ""}
                  points={tr.points}
                  from={chartFrom(tr.points, today)}
                  to={today}
                  band={m?.normal}
                  joinGaps
                />
              </div>
            );
          })}
          {brief.fib4Trend.length >= 2 ? (
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">{t.liverFib4TrendTitle}</h3>
              <TrendChart
                t={t}
                lang={lang}
                title={t.liverFib4TrendTitle}
                unit=""
                points={brief.fib4Trend}
                from={chartFrom(brief.fib4Trend, today)}
                to={today}
                joinGaps
              />
              <p className="text-muted text-xs">{t.liverFib4TrendHint}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {a ? (
        <section className="card" aria-labelledby="lb-told">
          <h2 id="lb-told" className="mb-1 font-semibold">
            {t.liverBriefReported}
          </h2>
          <dl className="divide-line divide-y">
            <Line
              label={t.liverBriefSymptoms}
              value={
                a.symptoms
                  .map((s) => t[`liverSymptom_${s}` as keyof Dict])
                  .join(", ") || t.liverBriefNone
              }
            />
            <Line
              label={t.liverBriefMeds}
              value={t[`liverTri_${a.meds}` as keyof Dict]}
            />
            <Line
              label={t.liverBriefAlcohol}
              value={a.alcohol ? t[`alcohol_${a.alcohol}` as keyof Dict] : dash}
            />
            <Line
              label={t.liverBriefHistory}
              value={
                a.history
                  .map((h) => t[`liverHistory_${h}` as keyof Dict])
                  .join(", ") || t.liverBriefNone
              }
            />
            <Line
              label={t.liverBriefFamily}
              value={t[`liverTri_${a.familyLiver}` as keyof Dict]}
            />
            <Line
              label={t.liverBriefHep}
              value={`B: ${t[`liverHepB_${a.hepB}` as keyof Dict]} · C: ${t[`liverHepC_${a.hepC}` as keyof Dict]}`}
            />
          </dl>
        </section>
      ) : null}

      {brief.questions.length ? (
        <section className="card space-y-2" aria-labelledby="lb-q">
          <h2 id="lb-q" className="font-semibold">
            {t.liverQuestionsTitle}
          </h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {brief.questions.map((q) => (
              <li key={q}>{t[`liverQ_${q}` as keyof Dict]}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="bg-tint-secondary rounded-xl px-3 py-2 text-sm">
        {t.liverBriefDisclaimerShort}. {t.liverDisclaimer}
      </p>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
