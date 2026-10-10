import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Circle } from "lucide-react";
import {
  endGoalAction,
  regenerateProgramAction,
  toggleTaskAction,
} from "@/app/actions/goals";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import { assertFeature } from "@/lib/flags/server";
import { addDays, bangkokDate, daysBetween } from "@/lib/health/dates";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { summarizeFood } from "@/lib/goals/foodsummary";
import { PROGRAM_DAYS, type WeightParams } from "@/lib/goals/kinds";
import {
  loadChecks,
  loadGoal,
  loadMeals,
  loadProgram,
  loadWeights,
} from "@/lib/goals/server";
import { weightTrend } from "@/lib/goals/weight";
import { GOAL_ICONS } from "../GoalIcon";
import { WeightCard } from "./WeightCard";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).goalsTitle };
}

export default async function GoalPage({ params }: PageProps<"/goals/[id]">) {
  await assertFeature("goals");
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const goal = await loadGoal(id);
  if (!goal) notFound();
  const t = await getT();
  const today = bangkokDate(new Date());
  const [program, checks, meals, weights] = await Promise.all([
    loadProgram(goal.id),
    loadChecks(goal.id, addDays(today, -6), today),
    loadMeals(today, 30),
    goal.kind === "weight" ? loadWeights(today, 45) : Promise.resolve([]),
  ]);
  const active = goal.status === "active";
  const plan = program?.plan ?? null;
  const targets = program?.targets ?? { showCalories: false };
  const doneToday = new Set(
    checks.filter((c) => c.task_date === today).map((c) => c.task_key),
  );
  const checkDays = new Set(checks.map((c) => c.task_date)).size;
  const food = summarizeFood(meals, today);
  const Icon = GOAL_ICONS[goal.kind];
  const cond = (goal.params as { condition?: string }).condition;
  const day = Math.min(
    PROGRAM_DAYS[goal.kind],
    Math.max(1, daysBetween(goal.started_on, today) + 1),
  );
  const trend = weights.length ? weightTrend(weights) : null;
  const wp = goal.params as WeightParams;
  const label = (k: string) => t[k as keyof Dict] as string;

  const targetRows: [string, string | number][] = [];
  if (targets.kcal !== undefined)
    targetRows.push([t.goalTarget_kcal, targets.kcal]);
  if (targets.proteinG != null)
    targetRows.push([t.goalTarget_protein, targets.proteinG]);
  if (targets.carbsG !== undefined)
    targetRows.push([t.goalTarget_carbs, targets.carbsG]);
  if (targets.fatG !== undefined)
    targetRows.push([t.goalTarget_fat, targets.fatG]);
  if (targets.waterMl != null)
    targetRows.push([t.goalTarget_water, targets.waterMl]);
  if (targets.activeMinutes !== undefined)
    targetRows.push([t.goalTarget_active, targets.activeMinutes]);
  if (targets.sleep) {
    targetRows.push([t.goalTarget_bed, targets.sleep.bedtime]);
    targetRows.push([t.goalTarget_wake, targets.sleep.wake]);
    targetRows.push([t.goalTarget_caffeine, targets.sleep.caffeineCutoff]);
  }
  if (targets.weeks != null)
    targetRows.push([t.goalTarget_weeks, targets.weeks]);
  if (targets.kgPerWeek)
    targetRows.push([t.goalTarget_rate, targets.kgPerWeek]);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <Icon
          className="text-primary-strong mt-1 size-7 shrink-0"
          aria-hidden
        />
        <div>
          <h1 className="text-primary-strong text-2xl font-bold">
            {label(`goalKind_${goal.kind}`)}
            {cond ? ` · ${label(`condition_${cond}`)}` : ""}
          </h1>
          <p className="text-muted text-sm">
            {fmt(t.goalDetailDays, { total: PROGRAM_DAYS[goal.kind], n: day })}
          </p>
        </div>
      </header>

      {plan ? (
        <>
          <section className="card space-y-3" aria-labelledby="g-today">
            <div>
              <h2 id="g-today" className="font-semibold">
                {t.goalToday}
              </h2>
              <p className="text-muted text-sm">{t.goalTodayHint}</p>
            </div>
            <ul className="space-y-2">
              {plan.tasks.map((task) => {
                const done = doneToday.has(task.key);
                return (
                  <li key={task.key}>
                    <form action={toggleTaskAction}>
                      <input type="hidden" name="goal" value={goal.id} />
                      <input type="hidden" name="task" value={task.key} />
                      <input
                        type="hidden"
                        name="done"
                        value={done ? "0" : "1"}
                      />
                      <button
                        type="submit"
                        disabled={!active}
                        aria-pressed={done}
                        aria-label={`${task.text} — ${done ? t.goalUntick : t.goalTick}`}
                        className={`flex min-h-11 w-full items-start gap-3 rounded-xl border px-3 py-2 text-left ${
                          done
                            ? "bg-tint-secondary border-transparent"
                            : "border-field-border bg-surface"
                        }`}
                      >
                        {done ? (
                          <Check
                            className="text-primary-strong mt-0.5 size-5 shrink-0"
                            aria-hidden
                          />
                        ) : (
                          <Circle
                            className="text-muted mt-0.5 size-5 shrink-0"
                            aria-hidden
                          />
                        )}
                        <span className={done ? "font-medium" : ""}>
                          {task.text}
                        </span>
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
            <p className="text-muted text-sm">
              {fmt(t.goalTasksDone, {
                done: doneToday.size,
                total: plan.tasks.length,
              })}
              {" · "}
              {fmt(t.goalWeekChecks, { n: checks.length, days: checkDays })}
            </p>
          </section>

          <section className="card space-y-2" aria-labelledby="g-summary">
            <p id="g-summary">{plan.summary}</p>
            <p className="text-muted text-xs">
              {program?.source === "ai" ? t.goalSourceAi : t.goalSourceTemplate}
            </p>
          </section>
        </>
      ) : null}

      {targetRows.length ? (
        <section className="card space-y-2" aria-labelledby="g-targets">
          <h2 id="g-targets" className="font-semibold">
            {t.goalTargets}
          </h2>
          <dl className="divide-line divide-y text-sm">
            {targetRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-1.5">
                <dt>{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted text-xs">{t.goalTargetsNote}</p>
        </section>
      ) : null}

      {goal.kind === "weight" ? (
        <WeightCard
          latest={
            weights.length
              ? {
                  kg: weights[weights.length - 1].kg,
                  date: weights[weights.length - 1].date,
                }
              : null
          }
          trend={trend?.kgPerWeek ?? null}
          targetKg={wp.targetKg}
        />
      ) : null}

      <section className="card space-y-2" aria-labelledby="g-food">
        <h2 id="g-food" className="font-semibold">
          {t.goalFood}
        </h2>
        {food.loggedDays === 0 ? (
          <p className="text-muted text-sm">{t.goalFoodNone}</p>
        ) : (
          <div className="space-y-1 text-sm">
            <p>{fmt(t.goalFoodDays, { n: food.loggedDays })}</p>
            <p className="font-semibold">
              {fmt(t.goalFoodAvg, { kcal: food.avgKcal ?? 0 })}
              {targets.kcal !== undefined
                ? ` · ${fmt(t.goalFoodVs, { target: targets.kcal })}`
                : ""}
            </p>
            {food.macroPct ? (
              <p>
                {fmt(t.goalFoodMacro, {
                  p: food.macroPct.protein,
                  c: food.macroPct.carbs,
                  f: food.macroPct.fat,
                })}
              </p>
            ) : null}
            {food.reliable ? null : (
              <p className="text-muted">{t.goalFoodLow}</p>
            )}
          </div>
        )}
        <Link href="/scan" className="btn btn-secondary">
          {t.goalFoodScan}
        </Link>
      </section>

      {plan?.mealIdeas.length ? (
        <section className="card space-y-2" aria-labelledby="g-meals">
          <h2 id="g-meals" className="font-semibold">
            {t.goalMeals}
          </h2>
          <dl className="space-y-2 text-sm">
            {plan.mealIdeas.map((m) => (
              <div key={m.slot}>
                <dt className="font-semibold">{label(`mealType_${m.slot}`)}</dt>
                <dd>
                  <ul className="list-disc pl-5">
                    {m.ideas.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {plan?.week.length ? (
        <section className="card space-y-2" aria-labelledby="g-week">
          <h2 id="g-week" className="font-semibold">
            {t.goalWeek}
          </h2>
          <ul className="divide-line divide-y text-sm">
            {plan.week.map((w) => (
              <li key={w.day} className="flex gap-3 py-1.5">
                <span className="w-24 shrink-0 font-semibold">
                  {label(`goalWeekday_${w.day}`)}
                </span>
                <span>{w.focus}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan && (plan.tips.length || plan.watchOuts.length) ? (
        <section className="card space-y-2 text-sm" aria-labelledby="g-tips">
          {plan.tips.length ? (
            <>
              <h2 id="g-tips" className="font-semibold">
                {t.goalTips}
              </h2>
              <ul className="list-disc pl-5">
                {plan.tips.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          ) : null}
          {plan.watchOuts.length ? (
            <>
              <h2 className="font-semibold">{t.goalWatchOuts}</h2>
              <ul className="list-disc pl-5">
                {plan.watchOuts.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {active ? (
        <section className="card space-y-3" aria-labelledby="g-manage">
          <h2 id="g-manage" className="font-semibold">
            {t.goalRegenerate}
          </h2>
          <p className="text-muted text-sm">{t.goalRegenerateHint}</p>
          <form action={regenerateProgramAction}>
            <input type="hidden" name="goal" value={goal.id} />
            <SubmitButton className="btn btn-secondary">
              {t.goalRegenerate}
            </SubmitButton>
          </form>
          <h2 className="font-semibold">{t.goalEnd}</h2>
          <div className="flex flex-wrap gap-3">
            {(["completed", "abandoned"] as const).map((s) => (
              <form key={s} action={endGoalAction}>
                <input type="hidden" name="goal" value={goal.id} />
                <input type="hidden" name="status" value={s} />
                <SubmitButton className="btn btn-ghost">
                  {s === "completed" ? t.goalEndDone : t.goalEndGiveUp}
                </SubmitButton>
              </form>
            ))}
          </div>
        </section>
      ) : null}
      <p className="text-muted text-xs">{t.goalDisclaimer}</p>
    </div>
  );
}
