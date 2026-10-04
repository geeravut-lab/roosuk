import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { explainInsightAction } from "@/app/actions/insights";
import { PendingButton } from "@/components/PendingButton";
import { biomarkerByKey } from "@/config/biomarkers";
import type { Insight } from "@/lib/insights/anomaly";
import type { InsightNote } from "@/lib/insights/explain";
import { fmt, type Dict, type Lang } from "@/lib/i18n/dict";

/**
 * One observation found by code, with one small next step — free. The AI
 * explanation is optional, paid with an allowance, and stored per observation.
 */
export function InsightCard({
  t,
  lang,
  insight,
  note,
}: {
  t: Dict;
  lang: Lang;
  insight: Insight;
  note: InsightNote | null;
}) {
  const k = insight.kind;
  const names =
    k === "lab_worse"
      ? String(insight.facts.markers)
          .split(",")
          .map((key) => {
            const m = biomarkerByKey(key);
            return m ? (lang === "th" ? m.th : m.en) : key;
          })
          .join(", ")
      : "";
  const body = fmt(t[`insight_${k}_body` as keyof Dict], {
    names,
    ...insight.facts,
  });
  return (
    <section
      id="insight"
      className="card border-primary space-y-3 border-2"
      aria-labelledby="insight-h"
    >
      <div className="flex items-start gap-3">
        <Lightbulb
          className="text-primary-strong mt-0.5 size-6 shrink-0"
          aria-hidden
        />
        <div className="space-y-1">
          <h2 id="insight-h" className="font-semibold">
            {t[`insight_${k}_title` as keyof Dict]}
          </h2>
          <p className="text-sm">{body}</p>
          <p className="text-sm font-medium">
            {t[`insight_${k}_next` as keyof Dict]}
          </p>
        </div>
      </div>
      <Link href={insight.href} className="btn btn-secondary w-full">
        {t[`insight_${k}_cta` as keyof Dict]}
      </Link>

      {note ? (
        <div className="bg-tint-primary space-y-2 rounded-xl p-3">
          <h3 className="text-sm font-semibold">{t.insightAiTitle}</h3>
          <p className="text-sm whitespace-pre-wrap">{note.summary}</p>
          {note.steps.length > 0 ? (
            <>
              <h4 className="text-sm font-semibold">{t.insightAiSteps}</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {note.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="text-muted text-xs">{t.insightAiDisclaimer}</p>
        </div>
      ) : (
        <form action={explainInsightAction} className="space-y-1">
          <input type="hidden" name="kind" value={k} />
          <p className="text-muted text-xs">{t.insightAiHint}</p>
          <PendingButton
            pendingLabel={t.insightAiBusy}
            className="btn btn-ghost w-full"
          >
            {t.insightAiCta}
          </PendingButton>
        </form>
      )}
      <p className="text-muted text-xs">{t.insightNote}</p>
    </section>
  );
}
