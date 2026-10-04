import Link from "next/link";
import { Check, CircleCheck, Flame, HeartHandshake } from "lucide-react";
import { toggleActionAction } from "@/app/actions/habit";
import { SCORE_CATEGORIES, type HealthScore } from "@/lib/health/score";
import type { HabitView } from "@/lib/health/view";
import { fmt, type Dict, type Lang } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { SubmitButton } from "@/components/SubmitButton";

/** Cards of the daily habit loop. Server components: all numbers are computed by code from the check-ins. */

export function CheckinCard({ t, view }: { t: Dict; view: HabitView }) {
  if (view.todayRow) {
    return (
      <div className="card bg-tint-secondary flex items-center gap-3">
        <CircleCheck
          className="text-primary-strong size-6 shrink-0"
          aria-hidden
        />
        <p className="min-w-0 flex-1 font-semibold">{t.todayCheckinDone}</p>
        <Link
          href="/today/checkin"
          className="text-primary-strong shrink-0 text-sm font-semibold underline"
        >
          {t.todayCheckinEdit}
        </Link>
      </div>
    );
  }
  return (
    <Link
      href="/today/checkin"
      className="btn btn-primary h-auto w-full flex-col gap-0.5 py-3 text-lg"
    >
      <span>{t.todayCheckinCta}</span>
      <span className="text-sm font-medium">{t.todayCheckinHint}</span>
    </Link>
  );
}

export function LowMoodCard({ t }: { t: Dict }) {
  return (
    <section
      className="card border-primary flex items-start gap-3 border-2"
      aria-labelledby="lowmood-h"
    >
      <HeartHandshake
        className="text-primary-strong mt-0.5 size-6 shrink-0"
        aria-hidden
      />
      <div className="space-y-1">
        <h2 id="lowmood-h" className="font-semibold">
          {t.lowMoodTitle}
        </h2>
        <p className="text-sm">{t.lowMoodBody}</p>
      </div>
    </section>
  );
}

export function ScoreCard({ t, score }: { t: Dict; score: HealthScore }) {
  const trend =
    score.trend === null
      ? null
      : score.trend > 0
        ? fmt(t.scoreTrendUp, { n: score.trend })
        : score.trend < 0
          ? fmt(t.scoreTrendDown, { n: -score.trend })
          : t.scoreTrendFlat;

  return (
    <section className="card space-y-4" aria-labelledby="score-h">
      <h2 id="score-h" className="font-semibold">
        {t.scoreTitle}
      </h2>

      {score.overall === null ? (
        <p className="text-muted">{t.scoreEmpty}</p>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <span className="text-primary-strong text-5xl leading-none font-bold">
              {score.overall}
            </span>
            <span className="text-muted pb-1 text-sm">{t.scoreOutOf}</span>
          </div>
          <p className="text-muted -mt-2 text-sm">
            {fmt(t.scoreBasis, { n: score.daysUsed })}
            {trend ? ` · ${trend}` : ""}
          </p>

          <ul className="space-y-2.5">
            {SCORE_CATEGORIES.map((c) => {
              const value = score.categories[c];
              return (
                <li key={c} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span
                      className={
                        score.focus === c ? "font-bold" : "font-medium"
                      }
                    >
                      {t[`cat_${c}` as const]}
                    </span>
                    <span className="text-muted">
                      {value === null ? t.scoreCheckupWaiting : value}
                    </span>
                  </div>
                  <div
                    className="bg-tint-primary h-2 overflow-hidden rounded-full"
                    aria-hidden
                  >
                    <div
                      className={`h-full rounded-full ${score.focus === c ? "bg-coral" : "bg-primary"}`}
                      style={{ width: `${value ?? 0}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium">
            {score.focus
              ? fmt(t.scoreFocus, {
                  category: t[`cat_${score.focus}` as const],
                })
              : t.scoreAllGood}
          </p>
        </>
      )}
      <p className="text-muted text-xs">{t.scoreDisclaimer}</p>
    </section>
  );
}

export function ActionsCard({ t, view }: { t: Dict; view: HabitView }) {
  const total = view.actions.length;
  return (
    <section className="card space-y-3" aria-labelledby="actions-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="actions-h" className="font-semibold">
          {t.actionsTitle}
        </h2>
        <span className="text-muted text-sm">
          {fmt(t.actionsProgress, { done: view.doneCount, total })}
        </span>
      </div>
      <div
        className="bg-tint-primary h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={t.actionsTitle}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={view.doneCount}
      >
        <div
          className="bg-secondary h-full rounded-full transition-[width]"
          style={{ width: `${(view.doneCount / total) * 100}%` }}
        />
      </div>

      <ul className="divide-line divide-y">
        {view.actions.map((a) => {
          const label = t[`action_${a.key}` as keyof Dict];
          const isCheckin = a.key === "checkin";
          return (
            <li key={a.key} className="flex items-center gap-3 py-2.5">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  a.done
                    ? "border-primary-strong bg-primary-strong text-on-primary"
                    : "border-field-border"
                }`}
                aria-hidden
              >
                {a.done ? <Check className="size-4" /> : null}
              </span>
              <span
                className={`min-w-0 flex-1 ${a.done ? "text-muted line-through" : ""}`}
              >
                {label}
                {a.done ? (
                  <span className="sr-only"> — {t.actionDoneBadge}</span>
                ) : null}
              </span>
              {isCheckin ? (
                a.done ? null : (
                  <Link
                    href="/today/checkin"
                    className="btn btn-secondary shrink-0"
                  >
                    {t.todayCheckinCta}
                  </Link>
                )
              ) : (
                <form action={toggleActionAction} className="shrink-0">
                  <input type="hidden" name="actionKey" value={a.key} />
                  <input type="hidden" name="done" value={String(!a.done)} />
                  <SubmitButton
                    className="btn btn-secondary"
                    aria-label={`${a.done ? t.actionUnmark : t.actionMark}: ${label}`}
                  >
                    {a.done ? t.actionUnmark : t.actionMark}
                  </SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-muted text-xs">{t.actionsNote}</p>
    </section>
  );
}

export function StreakCard({
  t,
  lang,
  view,
}: {
  t: Dict;
  lang: Lang;
  view: HabitView;
}) {
  const { streak } = view;
  return (
    <section className="card space-y-3" aria-labelledby="streak-h">
      <h2 id="streak-h" className="font-semibold">
        {t.streakTitle}
      </h2>
      <div className="flex items-center gap-3">
        <span className="bg-tint-secondary flex size-11 shrink-0 items-center justify-center rounded-full">
          <Flame className="text-flame size-6" aria-hidden />
        </span>
        <div>
          <p className="text-xl font-bold">
            {streak.current > 0
              ? fmt(t.streakDays, { n: streak.current })
              : t.streakStart}
          </p>
          <p className="text-muted text-sm">
            {streak.current > 0 && !streak.checkedToday
              ? t.streakKeep
              : streak.best > 0
                ? fmt(t.streakBest, { n: streak.best })
                : ""}
          </p>
        </div>
      </div>
      <ul className="flex justify-between gap-1" aria-label={t.streakTitle}>
        {view.week.map((d) => (
          <li
            key={d.date}
            className={`flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold ${
              d.done
                ? "border-primary-strong bg-primary-strong text-on-primary"
                : "border-line text-muted"
            }`}
            aria-label={fmt(d.done ? t.streakDayDone : t.streakDayMissed, {
              date: formatDate(lang, d.date),
            })}
          >
            {d.done ? (
              <Check className="size-4" aria-hidden />
            ) : (
              Number(d.date.slice(8))
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted text-xs">{t.streakNote}</p>
    </section>
  );
}
