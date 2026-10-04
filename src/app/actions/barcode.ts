"use server";

import { redirect } from "next/navigation";
import { trackEvent } from "@/lib/analytics/server";
import { requireUser } from "@/lib/auth/server";
import { barcodeMealItem, parseBarcode } from "@/lib/barcode/barcode";
import { lookupBarcode } from "@/lib/barcode/server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { mealTotals } from "@/lib/food/food";
import { bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import { createAdminClient } from "@/lib/supabase/admin";

export interface BarcodeState {
  error?: ErrorKey;
}

const toErrorKey = (e: unknown): ErrorKey =>
  e instanceof AppError ? e.code : "err_unknown";

/**
 * A barcode → a draft meal with the label's numbers, to review like any other
 * scan. No AI is involved (so no AI allowance is used); the number must be a
 * valid GS1 barcode before anything is looked up.
 */
export async function lookupBarcodeAction(
  _prev: BarcodeState,
  formData: FormData,
): Promise<BarcodeState> {
  let draftId: string;
  try {
    await assertFeature("barcode_scan");
    const user = await requireUser();
    const code = parseBarcode(formData.get("barcode"));
    if (!code) return { error: "err_barcode_invalid" };

    const found = await lookupBarcode(code);
    if (!found.ok)
      return {
        error:
          found.reason === "not_found"
            ? "err_barcode_not_found"
            : found.reason === "no_nutrition"
              ? "err_barcode_no_nutrition"
              : "err_barcode_unavailable",
      };

    const items = [barcodeMealItem(code, found.product)];
    const totals = mealTotals(items);
    const { data, error } = await createAdminClient()
      .from("meal_logs")
      .insert({
        user_id: user.id,
        meal_date: bangkokDate(new Date()),
        status: "draft",
        items,
        kcal: totals.kcal,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        model: "barcode/openfoodfacts",
      })
      .select("id");
    if (error || data?.length !== 1) return { error: "err_save_failed" };
    draftId = data[0].id;
    await trackEvent("barcode_scanned", user.id);
  } catch (err) {
    return { error: toErrorKey(err) };
  }
  redirect(`/scan/food/${draftId}${"?src=barcode"}`);
}
