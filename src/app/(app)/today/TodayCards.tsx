import Link from "next/link";
import { ChevronRight, Plus, Target } from "lucide-react";
import { GOAL_ICONS } from "@/app/(app)/goals/GoalIcon";
import { addDays } from "@/lib/health/dates";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { MEAL_TYPES, defaultMealType, type MealType } from "@/lib/goals/meals";
import type { GoalProgress } from "@/lib/goals/server";

/** The last seven days, today last: a filled dot where the person checked in. */
export function WeekStrip({
  today,
  lang,
  checkedDates,
}: {
  today: string;
  lang: "th" | "en";
  checkedDates: ReadonlySet<string>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const weekday = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en", {
    weekday: "narrow",
    timeZone: "UTC",
  });
  return (
    <ol className="flex justify-between" aria-hidden>
      {days.map((d) => {
        const done = checkedDates.has(d);
        const isToday = d === today;
        return (
          <li key={d} className="flex flex-col items-center gap-1 text-xs">
            <span className="text-muted">
              {weekday.format(new Date(`${d}T12:00:00Z`))}
            </span>
            <span
              className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold ${
                done
                  ? "bg-coral text-on-accent"
                  : isToday
                    ? "border-active border-2"
                    : "bg-tint-primary"
              }`}
            >
              {Number(d.slice(8))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface DiaryMeal {
  id: string;
  meal_type?: MealType | null;
  confirmed_at: string | null;
  kcal: number;
  items: { name: string }[];
}

/** Today's food by meal slot, with a quick way to add to each. */
export function DiaryCard({
  t,
  meals,
  targetKcal,
}: {
  t: Dict;
  meals: DiaryMeal[];
  /** a calorie target from a weight goal, when there is one */
  targetKcal: number | null;
}) {
  const slotOf = (m: DiaryMeal): MealType =>
    m.meal_type ??
    defaultMealType(m.confirmed_at ? new Date(m.confirmed_at) : new Date());
  const total = Math.round(meals.reduce((s, m) => s + m.kcal, 0));
  return (
    <section className="card space-y-3" aria-labelledby="diary-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="diary-title" className="font-semibold">
          {t.diaryTitle}
        </h2>
        <p className="text-sm font-semibold">
          {fmt(t.diaryTotal, { kcal: total })}
        </p>
      </div>
      {targetKcal !== null ? (
        <p className="text-muted text-sm">
          {total <= targetKcal
            ? fmt(t.diaryTarget, {
                target: targetKcal,
                left: targetKcal - total,
              })
            : fmt(t.diaryOver, {
                target: targetKcal,
                over: total - targetKcal,
              })}
        </p>
      ) : null}
      <ul className="divide-line divide-y">
        {MEAL_TYPES.map((slot) => {
          const mine = meals.filter((m) => slotOf(m) === slot);
          const kcal = Math.round(mine.reduce((s, m) => s + m.kcal, 0));
          return (
            <li key={slot} className="space-y-1 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{t[`mealType_${slot}` as const]}</p>
                <p className="text-muted text-sm">
                  {mine.length ? fmt(t.foodKcal, { kcal }) : t.diaryEmpty}
                </p>
              </div>
              {mine.map((m) => (
                <Link
                  key={m.id}
                  href={`/scan/food/${m.id}?from=today`}
                  className="text-primary-strong block truncate text-sm underline"
                >
                  {m.items.map((i) => i.name).join(", ")}
                </Link>
              ))}
              <Link
                href={`/scan/food?meal=${slot}`}
                className="text-primary-strong inline-flex min-h-11 items-center gap-1 text-sm font-semibold"
              >
                <Plus className="size-4" aria-hidden />
                {t.diaryAdd.replace(/^\+\s*/, "")}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What is running today, or an invitation to pick a goal. */
export function GoalsTodayCard({
  t,
  progress,
}: {
  t: Dict;
  progress: GoalProgress[];
}) {
  if (progress.length === 0)
    return (
      <Link
        href="/goals"
        className="card bg-tint-secondary hover:bg-tint-primary flex items-center gap-3"
      >
        <Target className="text-primary-strong size-6 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t.todayGoalsCta}</span>
          <span className="text-muted block text-sm">
            {t.todayGoalsCtaHint}
          </span>
        </span>
        <ChevronRight className="text-muted size-5 shrink-0" aria-hidden />
      </Link>
    );
  return (
    <section className="card space-y-2" aria-labelledby="today-goals">
      <h2 id="today-goals" className="font-semibold">
        {t.todayGoalsTitle}
      </h2>
      <ul className="divide-line divide-y">
        {progress.map(({ goal, total, done }) => {
          const Icon = GOAL_ICONS[goal.kind];
          const cond = (goal.params as { condition?: string }).condition;
          return (
            <li key={goal.id}>
              <Link
                href={`/goals/${goal.id}`}
                className="hover:bg-tint-primary flex min-h-11 items-center gap-3 py-2"
              >
                <Icon
                  className="text-primary-strong size-5 shrink-0"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {t[`goalKind_${goal.kind}` as keyof Dict] as string}
                    {cond
                      ? ` · ${t[`condition_${cond}` as keyof Dict] as string}`
                      : ""}
                  </span>
                  {total ? (
                    <span className="text-muted block text-sm">
                      {fmt(t.goalTasksDone, { done, total })}
                    </span>
                  ) : null}
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
    </section>
  );
}
