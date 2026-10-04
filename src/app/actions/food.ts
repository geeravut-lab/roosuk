"use server";

import { trackEvent } from "@/lib/analytics/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiError } from "@/lib/ai/types";
import { runAi } from "@/lib/ai/server";
import { requireUser } from "@/lib/auth/server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import {
  FOOD_SCHEMA,
  MAX_IMAGE_BYTES,
  SERVING_CHOICES,
  applyReview,
  foodPrompt,
  mealTotals,
  normalizeFoodResult,
  parseStoredItems,
  sniffImageType,
} from "@/lib/food/food";
import { bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import {
  canKeepFiles,
  removeSourceFile,
  sourceFileOf,
  storeSourceFile,
} from "@/lib/files/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface ScanState {
  error?: ErrorKey;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toErrorKey = (e: unknown): ErrorKey =>
  e instanceof AppError ? e.code : "err_unknown";

/**
 * Photo → draft meal. Order matters and is the same for every AI feature:
 * feature switch → validate input → quota gate → provider call → code decides
 * the numbers → draft row. The photo lives only in this function's memory.
 */
export async function scanFoodAction(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  let draftId: string;
  let fileFailed = false;
  try {
    const user = await requireUser();
    await assertFeature("food_scan");

    // Asked for every scan; no answer = no scan (and nothing is kept unless it is "keep").
    const keep = formData.get("keepFile");
    if (keep !== "keep" && keep !== "discard")
      return { error: "err_keep_choice" };
    if (keep === "keep" && !(await canKeepFiles(user.id)))
      return { error: "err_keep_unavailable" };

    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0)
      return { error: "err_photo_required" };
    if (file.size > MAX_IMAGE_BYTES) return { error: "err_photo_too_large" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffImageType(bytes);
    if (!mediaType) return { error: "err_photo_type" };

    const decision = await checkAndConsume(user.id, "foodSnap");
    if (!decision.allowed) return { error: decision.error };

    const { system, prompt } = foodPrompt();
    let result;
    try {
      result = await runAi("food_scan", {
        system,
        prompt,
        images: [{ mediaType, data: Buffer.from(bytes).toString("base64") }],
        jsonSchema: FOOD_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 2048,
      });
    } catch (err) {
      // Our side failed (provider down, key, bad output): the user keeps their use.
      await refundUsage(user.id, "foodSnap");
      console.error(
        "[food] AI call failed:",
        err instanceof AiError ? err.code : err,
      );
      return { error: "err_ai_unavailable" };
    }

    const items = normalizeFoodResult(result.json);
    if (!items) {
      await refundUsage(user.id, "foodSnap");
      return { error: "err_food_not_found" };
    }

    // Only now, with a usable result: store the photo (sealed) if the user said keep.
    const fileId =
      keep === "keep"
        ? await storeSourceFile({
            userId: user.id,
            kind: "food",
            bytes,
            mime: mediaType,
          })
        : null;
    fileFailed = keep === "keep" && !fileId;

    const totals = mealTotals(items);
    const { data, error } = await createAdminClient()
      .from("meal_logs")
      .insert({
        user_id: user.id,
        source_file_id: fileId,
        meal_date: bangkokDate(new Date()),
        status: "draft",
        items,
        kcal: totals.kcal,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        model: `${result.provider}/${result.model}`.slice(0, 100),
      })
      .select("id");
    if (error || data?.length !== 1) {
      await removeSourceFile(user.id, fileId);
      return { error: "err_save_failed" };
    }
    draftId = data[0].id;
    await trackEvent("food_scanned", user.id);
  } catch (err) {
    return { error: toErrorKey(err) };
  }
  redirect(`/scan/food/${draftId}${fileFailed ? "?file=failed" : ""}`);
}

/**
 * The review step: the user adjusts portions and drops wrong items; totals are
 * recomputed HERE from the stored per-serving numbers, so the form can change
 * how much was eaten but never what a serving contains.
 */
export async function confirmMealAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("mealId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");

  const db = createAdminClient();
  const { data: meal } = await db
    .from("meal_logs")
    .select("items")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .maybeSingle<{ items: unknown }>();
  if (!meal) throw new AppError("err_payment_state");

  const stored = parseStoredItems(meal.items);
  const reviewed = applyReview(stored, {
    servings: stored.map((_, i) => {
      const n = Number(formData.get(`servings.${i}`));
      return (SERVING_CHOICES as readonly number[]).includes(n) ? n : null;
    }),
    remove: stored.map((_, i) => formData.get(`remove.${i}`) === "on"),
  });
  // Dropping every item = discarding the scan.
  if (reviewed.length === 0) {
    const fileId = await sourceFileOf("meal_logs", id, user.id);
    await db.from("meal_logs").delete().eq("id", id).eq("user_id", user.id);
    await removeSourceFile(user.id, fileId);
    revalidatePath("/scan");
    redirect("/scan");
  }

  const totals = mealTotals(reviewed);
  const { data, error } = await db
    .from("meal_logs")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      items: reviewed,
      kcal: totals.kcal,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .select("id");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");

  revalidatePath("/timeline");
  revalidatePath(`/scan/food/${id}`);
  redirect(`/scan/food/${id}`);
}

/** Delete a meal (draft or confirmed) — the user's own row, through their own RLS-limited client. */
export async function deleteMealAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("mealId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");

  const fileId = await sourceFileOf("meal_logs", id, user.id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new AppError("err_save_failed");
  await removeSourceFile(user.id, fileId);

  revalidatePath("/timeline");
  redirect("/timeline");
}

/** Remove just the kept original file; the meal and its numbers stay. */
export async function deleteMealFileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("mealId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");
  const fileId = await sourceFileOf("meal_logs", id, user.id);
  if (!(await removeSourceFile(user.id, fileId)))
    throw new AppError("err_save_failed");
  revalidatePath(`/scan/food/${id}`);
  redirect(`/scan/food/${id}`);
}
