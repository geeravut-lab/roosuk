import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { WatchCard } from "@/components/WatchCard";
import { requireUser } from "@/lib/auth/server";
import { assertFeature, featureEnabled } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { daysBetween } from "@/lib/health/dates";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { GOAL_KINDS, MAX_ACTIVE_GOALS, PROGRAM_DAYS } from "@/lib/goals/kinds";
import { loadGoalProgress, loadWatch } from "@/lib/goals/server";
import { GOAL_ICONS } from "./GoalIcon";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).goalsTitle };
}

export default async function GoalsPage() {
  await assertFeature("goals");
  await requireUser();
  const t = await getT();
  const today = bangkokDate(new Date());
  const rows = await loadGoalProgress(today);
  const goals = rows.map((r) => r.goal);
  const watch = (await featureEnabled("diet_watch"))
    ? await loadWatch(today)
    : null;
  const full = goals.length >= MAX_ACTIVE_GOALS;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.goalsTitle}
        </h1>
        <p className="text-muted">{t.goalsIntro}</p>
      </div>

      <section className="space-y-3" aria-labelledby="goals-active">
        <h2 id="goals-active" className="font-semibold">
          {t.goalsActiveTitle}
        </h2>
        {rows.length === 0 ? (
          <p className="card text-muted">{t.goalsNone}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ goal: g, total, done }) => {
              const Icon = GOAL_ICONS[g.kind];
              const cond = (g.params as { condition?: string }).condition;
              const day = Math.min(
                PROGRAM_DAYS[g.kind],
                Math.max(1, daysBetween(g.started_on, today) + 1),
              );
              return (
                <li key={g.id}>
                  <Link
                    href={`/goals/${g.id}`}
                    className="card hover:bg-tint-primary flex items-center gap-3"
                  >
                    <Icon
                      className="text-primary-strong size-6 shrink-0"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {t[`goalKind_${g.kind}` as keyof Dict] as string}
                        {cond
                          ? ` · ${t[`condition_${cond}` as keyof Dict] as string}`
                          : ""}
                      </span>
                      <span className="text-muted block text-sm">
                        {fmt(t.goalDay, {
                          n: day,
                          total: PROGRAM_DAYS[g.kind],
                        })}
                        {total
                          ? ` · ${fmt(t.goalTasksDone, { done, total })}`
                          : ""}
                      </span>
                    </span>
                    <ChevronRight
                      className="text-muted size-5 shrink-0"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="goals-choose">
        <h2 id="goals-choose" className="font-semibold">
          {t.goalsChooseTitle}
        </h2>
        {full ? <p className="text-muted text-sm">{t.err_goal_limit}</p> : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {GOAL_KINDS.map((k) => {
            const Icon = GOAL_ICONS[k];
            const body = (
              <>
                <Icon
                  className="text-primary-strong size-7 shrink-0"
                  aria-hidden
                />
                <span className="block font-semibold">
                  {t[`goalKind_${k}` as keyof Dict] as string}
                </span>
                <span className="text-muted block text-sm">
                  {t[`goalKindHint_${k}` as keyof Dict] as string}
                </span>
              </>
            );
            return (
              <li key={k}>
                {full ? (
                  <div className="card h-full space-y-1 opacity-60">{body}</div>
                ) : (
                  <Link
                    href={`/goals/new/${k}`}
                    className="card hover:bg-tint-primary h-full space-y-1"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {watch ? (
        <WatchCard t={t} conditions={watch.conditions} result={watch.result} />
      ) : null}
      <p className="text-muted text-xs">{t.goalDisclaimer}</p>
    </div>
  );
}
