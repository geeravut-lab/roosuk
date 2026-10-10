import { CircleAlert, CircleCheck, Eye, TriangleAlert } from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import type { ResultView } from "@/lib/liver/view";
import { EmergencyCard } from "./EmergencyCard";

const STYLE = {
  0: "border-secondary bg-tint-secondary",
  1: "border-warn bg-tint-warn",
  2: "border-warn bg-tint-warn",
  3: "border-danger bg-tint-danger",
} as const;
const ICON = {
  0: CircleCheck,
  1: Eye,
  2: CircleAlert,
  3: TriangleAlert,
} as const;

/**
 * One assessment, in words. Always: the level and what to do next, why, the
 * indices with what they mean (or what is missing), questions for the doctor,
 * "finding nothing is not proof", and the mandatory not-a-diagnosis notice.
 * Server component: it is also what the Health Passport and the print view show.
 */
export function ResultCard({ t, view }: { t: Dict; view: ResultView }) {
  const Icon = ICON[view.level];
  return (
    <div className="space-y-4">
      {view.emergency ? (
        <EmergencyCard
          title={view.title}
          body={view.body}
          cta={view.cta}
          callLabel={t.liverCall1669}
        />
      ) : (
        <section
          className={`space-y-2 rounded-2xl border-2 p-4 ${STYLE[view.level]}`}
          aria-labelledby="liver-level"
        >
          <p className="inline-flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-5 shrink-0" aria-hidden />
            {view.levelShort}
          </p>
          <h2 id="liver-level" className="text-xl font-bold">
            {view.title}
          </h2>
          <p>{view.body}</p>
          <p className="font-semibold">{view.cta}</p>
        </section>
      )}

      {view.reasons.length ? (
        <section className="card space-y-2" aria-labelledby="liver-why">
          <h3 id="liver-why" className="font-semibold">
            {t.liverReasonsTitle}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {view.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.factors.length ? (
        <section className="card space-y-2" aria-labelledby="liver-factors">
          <h3 id="liver-factors" className="font-semibold">
            {t.liverFactorsTitle}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {view.factors.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card space-y-3" aria-labelledby="liver-scores">
        <h3 id="liver-scores" className="font-semibold">
          {t.liverScoresTitle}
        </h3>
        <ul className="divide-line divide-y">
          {view.scores.map((s) => (
            <li key={s.name} className="space-y-0.5 py-2">
              <p className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{s.title}</span>
                {s.valueText ? (
                  <span className="text-lg font-bold">{s.valueText}</span>
                ) : null}
              </p>
              <p className="text-muted text-sm">{s.what}</p>
              <p className="text-sm font-medium">{s.meaning}</p>
              {s.notes.map((n) => (
                <p key={n} className="text-muted text-xs">
                  {n}
                </p>
              ))}
            </li>
          ))}
        </ul>
        <p className="text-muted text-xs">{t.liverScoresHint}</p>
      </section>

      {view.gaps.length ? (
        <section className="card space-y-2" aria-labelledby="liver-gaps">
          <h3 id="liver-gaps" className="font-semibold">
            {t.liverGapsTitle}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {view.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.questions.length ? (
        <section className="card space-y-2" aria-labelledby="liver-q">
          <h3 id="liver-q" className="font-semibold">
            {t.liverQuestionsTitle}
          </h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {view.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="text-sm">{view.notRuledOut}</p>
      <p className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium">
        {view.disclaimer}
      </p>
    </div>
  );
}
