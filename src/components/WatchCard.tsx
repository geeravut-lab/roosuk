import Link from "next/link";
import { Eye } from "lucide-react";
import { fmt, type Dict } from "@/lib/i18n/dict";
import type { WatchAlert, WatchResult } from "@/lib/goals/watch";

/**
 * "Dishes worth a second look": gentle notes from the person's own logged food against the
 * conditions they declared. Never a diagnosis, never an order — see src/lib/goals/watch.ts.
 */
export function WatchCard({
  t,
  conditions,
  result,
  compact = false,
}: {
  t: Dict;
  conditions: string[];
  result: WatchResult;
  /** the Today page shows the strongest notes only and links to the full list */
  compact?: boolean;
}) {
  const label = (c: string) => t[`condition_${c}` as keyof Dict] as string;
  const alerts: WatchAlert[] = compact
    ? result.alerts.slice(0, 2)
    : result.alerts;

  return (
    <section className="card space-y-2" aria-labelledby="watch-title">
      <h2 id="watch-title" className="flex items-center gap-2 font-semibold">
        <Eye className="text-primary-strong size-5 shrink-0" aria-hidden />
        {t.watchTitle}
      </h2>
      {conditions.length === 0 ? (
        <>
          <p className="text-muted text-sm">{t.watchNoCondition}</p>
          <Link href="/profile" className="btn btn-secondary">
            {t.profileTitle}
          </Link>
        </>
      ) : result.lowData ? (
        <p className="text-muted text-sm">{t.watchLowData}</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm">
          {fmt(t.watchClear, { cond: conditions.map(label).join(", ") })}
        </p>
      ) : (
        <>
          {compact ? null : (
            <p className="text-muted text-sm">{t.watchIntro}</p>
          )}
          <ul className="space-y-3">
            {alerts.map((a) => (
              <li
                key={`${a.condition}-${a.tag}`}
                className="bg-tint-warn space-y-1 rounded-xl px-3 py-2"
              >
                <p className="text-sm font-semibold">
                  <span className="bg-surface mr-2 rounded-full px-2 py-0.5 text-xs">
                    {t[`watchLevel_${a.level}` as const]}
                  </span>
                  {fmt(t.watchAlert, {
                    cond: label(a.condition),
                    tag: t[`foodTag_${a.tag}` as const],
                    n: a.servings7,
                    m: a.servings30,
                  })}
                </p>
                {a.top.length ? (
                  <p className="text-sm">
                    {fmt(t.watchTop, {
                      names: a.top.map((x) => x.name).join(", "),
                    })}
                  </p>
                ) : null}
                {compact ? null : (
                  <p className="text-sm">
                    {t[`watchAdvice_${a.condition}` as keyof Dict] as string}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {compact ? (
            <Link
              href="/goals"
              className="text-primary-strong text-sm font-semibold underline"
            >
              {t.watchMore}
            </Link>
          ) : null}
          <p className="text-muted text-xs">{t.watchDisclaimer}</p>
        </>
      )}
    </section>
  );
}
