import { fmt, type Dict, type Lang } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import type { PassportSnapshot } from "@/lib/passport/passport";
import { BriefView } from "./liver/BriefView";
import { LabStatusChip } from "./LabStatusChip";

const minutesToHours = (m: number) =>
  `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/**
 * What a doctor reads. Server component, no client state: the same markup serves the
 * public link and the owner's own preview, and it prints cleanly (the app shell is hidden in print).
 */
export function PassportView({
  t,
  lang,
  snapshot: s,
  label,
  holderName,
}: {
  t: Dict;
  lang: Lang;
  snapshot: PassportSnapshot;
  label: string;
  holderName: string | null;
}) {
  const dash = "—";
  return (
    <article className="space-y-5" aria-labelledby="passport-h">
      <header className="space-y-1">
        <h1 id="passport-h" className="text-primary-strong text-2xl font-bold">
          {t.passportViewTitle}
        </h1>
        <p className="font-semibold">{label}</p>
        {holderName ? (
          <p className="text-sm">
            {fmt(t.passportViewFor, { name: holderName })}
          </p>
        ) : null}
        <p className="text-muted text-sm">
          {fmt(t.passportGeneratedOn, {
            date: formatDate(lang, s.generatedOn),
          })}
        </p>
      </header>

      <p className="bg-tint-secondary rounded-xl px-3 py-2 text-sm">
        {t.passportDisclaimer}
      </p>

      {s.brief ? (
        <section className="card space-y-3" aria-labelledby="pp-brief">
          <h2 id="pp-brief" className="font-semibold">
            {t.passportBriefTitle}
          </h2>
          <p>{s.brief.summary}</p>
          {s.brief.changes.length ? (
            <div>
              <h3 className="text-sm font-semibold">
                {t.passportBriefChanges}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {s.brief.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {s.brief.questions.length ? (
            <div>
              <h3 className="text-sm font-semibold">
                {t.passportBriefQuestions}
              </h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {s.brief.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className="text-muted text-xs">{t.passportBriefNote}</p>
        </section>
      ) : null}

      {s.profile ? (
        <section className="card" aria-labelledby="pp-profile">
          <h2 id="pp-profile" className="mb-1 font-semibold">
            {t.passportSection_profile}
          </h2>
          <dl className="divide-line divide-y">
            <Row
              label={t.passportAge}
              value={s.profile.age === null ? dash : String(s.profile.age)}
            />
            <Row
              label={t.profileSex}
              value={
                s.profile.sex ? t[`sex_${s.profile.sex}` as keyof Dict] : dash
              }
            />
            <Row
              label={t.profileSmoking}
              value={
                s.profile.smoking
                  ? t[`smoking_${s.profile.smoking}` as keyof Dict]
                  : dash
              }
            />
            <Row
              label={t.profileAlcohol}
              value={
                s.profile.alcohol
                  ? t[`alcohol_${s.profile.alcohol}` as keyof Dict]
                  : dash
              }
            />
            <Row
              label={t.passportExerciseDays}
              value={
                s.profile.exerciseDays === null
                  ? dash
                  : String(s.profile.exerciseDays)
              }
            />
            <Row
              label={t.passportConditions}
              value={
                s.profile.conditions
                  .map((c) => t[`condition_${c}` as keyof Dict] ?? c)
                  .join(", ") || dash
              }
            />
            <Row
              label={t.passportGoals}
              value={
                s.profile.goals
                  .map((g) => t[`goal_${g}` as keyof Dict] ?? g)
                  .join(", ") || dash
              }
            />
          </dl>
        </section>
      ) : null}

      {s.labs ? (
        <section className="card space-y-2" aria-labelledby="pp-labs">
          <h2 id="pp-labs" className="font-semibold">
            {t.passportSection_labs}
          </h2>
          {s.labs.length === 0 ? (
            <p className="text-muted text-sm">{t.passportNone}</p>
          ) : (
            <ul className="divide-line divide-y">
              {s.labs.map((l) => (
                <li
                  key={`${l.name}-${l.collectedOn}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-muted text-sm">
                      {formatDate(lang, l.collectedOn)}
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
        </section>
      ) : null}

      {s.checkins ? (
        <section className="card" aria-labelledby="pp-checkins">
          <h2 id="pp-checkins" className="mb-1 font-semibold">
            {t.passportSection_checkins}
          </h2>
          <dl className="divide-line divide-y">
            <Row
              label={fmt(t.passportCheckinDays, { n: s.checkins.windowDays })}
              value={String(s.checkins.days)}
            />
            <Row
              label={t.passportAvgScore}
              value={
                s.checkins.avgScore === null
                  ? dash
                  : String(s.checkins.avgScore)
              }
            />
            <Row
              label={t.passportStreak}
              value={String(s.checkins.currentStreak)}
            />
            <Row
              label={t.passportWeakest}
              value={
                s.checkins.weakestCategory
                  ? t[`cat_${s.checkins.weakestCategory}` as keyof Dict]
                  : dash
              }
            />
          </dl>
        </section>
      ) : null}

      {s.wearables ? (
        <section className="card" aria-labelledby="pp-wear">
          <h2 id="pp-wear" className="mb-1 font-semibold">
            {t.passportSection_wearables}
          </h2>
          <dl className="divide-line divide-y">
            <Row
              label={fmt(t.passportWearDays, { n: s.wearables.windowDays })}
              value={String(s.wearables.days)}
            />
            <Row
              label={t.passportAvgSteps}
              value={
                s.wearables.avgSteps === null
                  ? dash
                  : s.wearables.avgSteps.toLocaleString("en-US")
              }
            />
            <Row
              label={t.passportAvgRhr}
              value={
                s.wearables.avgRestingHr === null
                  ? dash
                  : String(s.wearables.avgRestingHr)
              }
            />
            <Row
              label={t.passportAvgSleep}
              value={
                s.wearables.avgSleepMinutes === null
                  ? dash
                  : minutesToHours(s.wearables.avgSleepMinutes)
              }
            />
          </dl>
        </section>
      ) : null}

      {s.liver ? (
        <section className="space-y-2" aria-labelledby="pp-liver">
          <h2 id="pp-liver" className="font-semibold">
            {t.passportSection_liver}
          </h2>
          <BriefView t={t} lang={lang} brief={s.liver} today={s.generatedOn} />
        </section>
      ) : null}

      {s.documents ? (
        <section className="card space-y-2" aria-labelledby="pp-docs">
          <h2 id="pp-docs" className="font-semibold">
            {t.passportSection_documents}
          </h2>
          {s.documents.length === 0 ? (
            <p className="text-muted text-sm">{t.passportNone}</p>
          ) : (
            <ul className="divide-line divide-y text-sm">
              {s.documents.map((d) => (
                <li
                  key={`${d.title}-${d.docDate}`}
                  className="flex justify-between gap-3 py-1.5"
                >
                  <span className="font-medium">{d.title}</span>
                  <span className="text-muted">
                    {t[`vaultCat_${d.category}` as keyof Dict]}
                    {d.docDate ? ` · ${formatDate(lang, d.docDate)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted text-xs">{t.passportDocsNote}</p>
        </section>
      ) : null}
    </article>
  );
}
