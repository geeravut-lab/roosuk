"use client";

import Link from "next/link";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import type { PlanDay, QuizLever, QuizResult } from "@/lib/quiz/quiz";

export interface QuizResultProps {
  result: QuizResult;
  plan: PlanDay[];
  planSource: "ai" | "template";
  /** How this page is being shown: after signing up or being denied the plan has a different next step. */
  mode: "saved" | "anonymous" | "quota";
  quotaMessage?: string;
}

/** The quiz result — one presentation for the saved page and the unsaved (anonymous / out of allowance) state. */
export function QuizResultView({
  result,
  plan,
  planSource,
  mode,
  quotaMessage,
}: QuizResultProps) {
  const { t } = useI18n();
  const delta =
    result.deltaYears < 0
      ? fmt(t.quizDeltaYounger, { n: -result.deltaYears })
      : result.deltaYears > 0
        ? fmt(t.quizDeltaOlder, { n: result.deltaYears })
        : t.quizDeltaSame;

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.quizResultTitle}
      </h1>

      <section className="card space-y-4" aria-label={t.quizResultTitle}>
        <div className="flex items-end gap-2">
          <span className="text-primary-strong text-5xl leading-none font-bold">
            {result.score}
          </span>
          <span className="text-muted pb-1 text-sm">
            {t.quizScoreLabel} · {t.scoreOutOf}
          </span>
        </div>
        <div>
          <p className="text-muted text-sm">{t.quizHealthAge}</p>
          <p className="text-xl font-bold">
            {fmt(t.quizHealthAgeLine, {
              health: result.healthAge,
              real: result.chronoAge,
            })}
          </p>
          <p className="text-sm">{delta}</p>
        </div>
      </section>

      <section className="card space-y-2" aria-labelledby="levers-h">
        <h2 id="levers-h" className="font-semibold">
          {t.quizLevers}
        </h2>
        {result.levers.length === 0 ? (
          <p>{t.quizNoLevers}</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5">
            {result.levers.map((l: QuizLever) => (
              <li key={l} className="font-medium">
                {t[`quizLever_${l}` as keyof Dict]}
              </li>
            ))}
          </ol>
        )}
      </section>

      {mode === "anonymous" ? (
        <section className="card bg-tint-secondary space-y-3">
          <p className="font-semibold">{t.quizSignupCta}</p>
          <p className="text-sm">{t.quizSignupHint}</p>
          <Link
            href="/auth?mode=signup&next=/quiz"
            className="btn btn-primary w-full"
          >
            {t.authTitleSignup}
          </Link>
        </section>
      ) : (
        <>
          {mode === "quota" ? (
            <section className="card space-y-2" role="status">
              <p className="font-medium">{quotaMessage ?? t.quizQuotaNote}</p>
              <p className="text-sm">{t.quizQuotaNote}</p>
              <Link href="/subscription" className="btn btn-secondary w-full">
                {t.quizUpgrade}
              </Link>
            </section>
          ) : (
            <section className="card space-y-3" aria-labelledby="plan-h">
              <div>
                <h2 id="plan-h" className="font-semibold">
                  {t.quizPlanTitle}
                </h2>
                <p className="text-muted text-sm">
                  {planSource === "ai"
                    ? t.quizPlanSourceAi
                    : t.quizPlanSourceTemplate}
                </p>
              </div>
              <ol className="divide-line divide-y">
                {plan.map((d) => (
                  <li key={d.day} className="space-y-0.5 py-2.5">
                    <p className="text-primary-strong text-sm font-semibold">
                      {fmt(t.quizPlanDay, { n: d.day })}
                    </p>
                    <p>{d.text ?? t[d.tipKey as keyof Dict]}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <p className="text-muted text-sm">{t.quizDisclaimer}</p>
      <Link href="/quiz" className="btn btn-secondary w-full">
        {t.quizRetake}
      </Link>
      {mode !== "anonymous" ? (
        <Link href="/today" className="btn btn-ghost w-full">
          {t.quizBackToday}
        </Link>
      ) : null}
      {mode !== "anonymous" ? (
        <Link
          href="/checkup-interest"
          className="card hover:bg-tint-primary block"
        >
          <span className="block font-semibold">{t.leadCta}</span>
          <span className="text-muted block text-sm">{t.leadCtaHint}</span>
        </Link>
      ) : null}
    </div>
  );
}
