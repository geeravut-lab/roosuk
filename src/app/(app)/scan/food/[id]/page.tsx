import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";
import {
  confirmMealAction,
  deleteMealAction,
  deleteMealFileAction,
} from "@/app/actions/food";
import {
  SourceFileCard,
  type SourceFileRef,
} from "@/components/SourceFileCard";
import { ShareCard } from "@/components/ShareCard";
import { requireUser } from "@/lib/auth/server";
import { SERVING_CHOICES, mealTotals, parseStoredItems } from "@/lib/food/food";
import { fmt } from "@/lib/i18n/dict";
import { getLang, getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).foodReviewTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MealPage({
  params,
  searchParams,
}: PageProps<"/scan/food/[id]">) {
  const { id } = await params;
  const { file: fileNote } = await searchParams;
  const user = await requireUser();
  if (!UUID.test(id)) notFound();

  // The user's own client: RLS only returns their rows.
  const supabase = await createClient();
  const [t, lang, { data: meal }] = await Promise.all([
    getT(),
    getLang(),
    supabase
      .from("meal_logs")
      .select("id, status, items, source_file:source_files(id, mime)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<{
        id: string;
        status: "draft" | "confirmed";
        items: unknown;
        source_file: SourceFileRef | null;
      }>(),
  ]);
  if (!meal) notFound();

  const items = parseStoredItems(meal.items);
  const totals = mealTotals(items);
  const draft = meal.status === "draft";

  const sourceFile = (
    <>
      {fileNote === "failed" ? (
        <p role="status" className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
          {t.sourceFileFailed}
        </p>
      ) : null}
      <SourceFileCard t={t} file={meal.source_file}>
        <form action={deleteMealFileAction}>
          <input type="hidden" name="mealId" value={meal.id} />
          <button type="submit" className="btn btn-ghost w-full">
            {t.sourceFileDelete}
          </button>
        </form>
      </SourceFileCard>
    </>
  );

  const summary = (
    <div className="card space-y-1">
      <p className="text-muted text-sm">{t.foodTotals}</p>
      <p className="text-primary-strong text-3xl font-bold">
        {fmt(t.foodKcal, { kcal: totals.kcal })}
      </p>
      <p className="text-sm">
        {fmt(t.foodMacros, {
          p: totals.protein_g,
          c: totals.carbs_g,
          f: totals.fat_g,
        })}
      </p>
    </div>
  );

  if (!draft) {
    return (
      <div className="space-y-4">
        <h1 className="text-primary-strong inline-flex items-center gap-2 text-2xl font-bold">
          <CircleCheck className="size-7" aria-hidden />
          {t.foodSavedTitle}
        </h1>
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="card flex items-baseline justify-between gap-3"
            >
              <span className="font-medium">{it.name}</span>
              <span className="text-muted text-sm">× {it.servings}</span>
            </li>
          ))}
        </ul>
        {sourceFile}
        {summary}
        <ShareCard
          src={`/api/share/food/${meal.id}?lang=${lang}`}
          text={fmt(t.shareTextFood, { url: "{url}" })}
          filename="roosuk-meal.png"
        />
        <p className="text-muted text-sm">{t.foodEstimateNote}</p>
        <Link href="/scan/food" className="btn btn-primary w-full">
          {t.foodScanAnother}
        </Link>
        <Link href="/timeline" className="btn btn-secondary w-full">
          {t.foodGoTimeline}
        </Link>
        <form action={deleteMealAction}>
          <input type="hidden" name="mealId" value={meal.id} />
          <button type="submit" className="btn btn-ghost w-full">
            {t.foodDelete}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.foodReviewTitle}
        </h1>
        <p className="text-muted">{t.foodReviewHint}</p>
      </div>

      <form action={confirmMealAction} className="space-y-4">
        <input type="hidden" name="mealId" value={meal.id} />
        <ul className="space-y-3">
          {items.map((it, i) => (
            <li key={i} className="card space-y-3">
              <div>
                <p className="text-lg font-semibold">{it.name}</p>
                <p className="text-muted text-sm">
                  {fmt(t.foodKcal, { kcal: it.per_serving.kcal })} ·{" "}
                  {it.source === "catalog"
                    ? t.foodSourceCatalog
                    : t.foodSourceAi}
                </p>
                {it.confidence < 0.5 ? (
                  <p className="text-sm font-medium">{t.foodLowConfidence}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor={`servings-${i}`} className="label">
                  {t.foodServings}
                </label>
                <select
                  id={`servings-${i}`}
                  name={`servings.${i}`}
                  defaultValue={String(it.servings)}
                  className="field"
                >
                  {[...new Set([...SERVING_CHOICES, it.servings])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option
                        key={n}
                        value={n}
                        disabled={
                          !(SERVING_CHOICES as readonly number[]).includes(n)
                        }
                      >
                        {n}
                      </option>
                    ))}
                </select>
              </div>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name={`remove.${i}`}
                  className="size-5 shrink-0"
                />
                <span>{t.foodRemove}</span>
              </label>
            </li>
          ))}
        </ul>
        {sourceFile}
        {summary}
        <p className="text-muted text-sm">{t.foodEstimateNote}</p>
        <button type="submit" className="btn btn-primary w-full">
          {t.foodConfirm}
        </button>
      </form>

      <form action={deleteMealAction}>
        <input type="hidden" name="mealId" value={meal.id} />
        <button type="submit" className="btn btn-ghost w-full">
          {t.foodDiscard}
        </button>
      </form>
    </div>
  );
}
