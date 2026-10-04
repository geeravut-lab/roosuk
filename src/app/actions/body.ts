"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAi } from "@/lib/ai/server";
import { AiError } from "@/lib/ai/types";
import { trackEvent } from "@/lib/analytics/server";
import { requireUser } from "@/lib/auth/server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import {
  BODY_SCHEMA,
  MAX_IMAGE_BYTES,
  adultStatus,
  assessBody,
  bodyPrompt,
  parseBodyAi,
  parseBodyForm,
  parseWeightInput,
  withMeasuredWeight,
  withoutMeasuredWeight,
} from "@/lib/body/body";
import { AppError } from "@/lib/errors";
import {
  canKeepFiles,
  removeSourceFile,
  sourceFileOf,
  storeSourceFile,
} from "@/lib/files/server";
import { assertFeature } from "@/lib/flags/server";
import { sniffImageType, type ImageType } from "@/lib/food/food";
import type { ErrorKey } from "@/lib/i18n/dict";
import { createAdminClient } from "@/lib/supabase/admin";

export interface BodyScanState {
  error?: ErrorKey;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toErrorKey = (e: unknown): ErrorKey =>
  e instanceof AppError ? e.code : "err_unknown";

type Photo = { bytes: Uint8Array; mediaType: ImageType };

/** An optional or required photo field → its bytes (type checked from the bytes), null when absent, or an error key. */
async function readPhoto(
  data: FormDataEntryValue | null,
  required: boolean,
): Promise<Photo | null | ErrorKey> {
  if (!(data instanceof File) || data.size === 0)
    return required ? "err_body_photo_required" : null;
  if (data.size > MAX_IMAGE_BYTES) return "err_photo_too_large";
  const bytes = new Uint8Array(await data.arrayBuffer());
  const mediaType = sniffImageType(bytes);
  return mediaType ? { bytes, mediaType } : "err_photo_type";
}

const isPhoto = (v: Photo | null | ErrorKey): v is Photo =>
  v !== null && typeof v === "object";

/**
 * Body photo(s) + height → a rough weight range and BMI. Same order as every AI
 * feature: switch → input checks (nothing costs anything yet) → quota gate →
 * model → code decides everything → row. A photo we cannot use refunds the use.
 * The model returns only numbers and fixed categories; nothing it could say
 * reaches the user as text.
 */
export async function scanBodyAction(
  _prev: BodyScanState,
  formData: FormData,
): Promise<BodyScanState> {
  let scanId: string;
  let fileFailed = false;
  try {
    const user = await requireUser();
    await assertFeature("body_scan");

    const keep = formData.get("keepFile");
    if (keep !== "keep" && keep !== "discard")
      return { error: "err_keep_choice" };
    if (keep === "keep" && !(await canKeepFiles(user.id)))
      return { error: "err_keep_unavailable" };

    const db = createAdminClient();
    const { data: profile } = await db
      .from("health_profiles")
      .select("birth_year, sex")
      .eq("user_id", user.id)
      .maybeSingle<{ birth_year: number | null; sex: string | null }>();
    const year = new Date().getFullYear();
    const status = adultStatus(profile?.birth_year ?? null, year);
    const form = parseBodyForm(formData, status);
    if (!form.ok) return { error: form.error };

    const body = await readPhoto(formData.get("photoBody"), true);
    if (!isPhoto(body))
      return { error: (body ?? "err_body_photo_required") as ErrorKey };
    const face = await readPhoto(formData.get("photoFace"), false);
    if (face !== null && !isPhoto(face)) return { error: face };
    const palm = await readPhoto(formData.get("photoPalm"), false);
    if (palm !== null && !isPhoto(palm)) return { error: palm };

    const decision = await checkAndConsume(user.id, "bodyScan");
    if (!decision.allowed) return { error: decision.error };

    const age = profile?.birth_year != null ? year - profile.birth_year : null;
    const { system, prompt } = bodyPrompt({
      heightCm: form.heightCm,
      sex: profile?.sex && profile.sex !== "unspecified" ? profile.sex : null,
      ageBand:
        age !== null
          ? `${Math.floor(age / 5) * 5}-${Math.floor(age / 5) * 5 + 4}`
          : null,
      hasFace: !!face,
      hasPalm: !!palm,
    });
    const media = [body, face, palm].filter(isPhoto).map((p) => ({
      mediaType: p.mediaType,
      data: Buffer.from(p.bytes).toString("base64"),
    }));

    let result;
    try {
      result = await runAi("body_scan", {
        system,
        prompt,
        images: media,
        jsonSchema: BODY_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 1024,
      });
    } catch (err) {
      await refundUsage(user.id, "bodyScan");
      console.error(
        "[body] AI call failed:",
        err instanceof AiError ? err.code : err,
      );
      return { error: "err_ai_unavailable" };
    }
    const ai = parseBodyAi(result.json);
    if (!ai) {
      await refundUsage(user.id, "bodyScan");
      return { error: "err_ai_unavailable" };
    }
    const assessed = assessBody({
      heightCm: form.heightCm,
      weightKg: form.weightKg,
      ai,
      hasFace: !!face,
      hasPalm: !!palm,
    });
    if (!assessed.ok) {
      await refundUsage(user.id, "bodyScan");
      return {
        error:
          assessed.reason === "minor" ? "err_body_minor" : "err_body_unusable",
      };
    }
    const r = assessed.result;

    // Only the full-body photo can be kept, and only if the person said so.
    const fileId =
      keep === "keep"
        ? await storeSourceFile({
            userId: user.id,
            kind: "body",
            bytes: body.bytes,
            mime: body.mediaType,
          })
        : null;
    fileFailed = keep === "keep" && !fileId;

    const { data, error } = await db
      .from("body_scans")
      .insert({
        user_id: user.id,
        height_cm: r.heightCm,
        weight_kg: r.weightKg,
        est_weight_low: r.estLow,
        est_weight_high: r.estHigh,
        bmi_low: r.bmiLow,
        bmi_high: r.bmiHigh,
        bmi_band: r.band,
        bmi_basis: r.basis,
        confidence: r.confidence,
        face_note: r.faceNote,
        palm_note: r.palmNote,
        source_file_id: fileId,
        model: `${result.provider}/${result.model}`.slice(0, 100),
      })
      .select("id");
    if (error || data?.length !== 1) {
      await removeSourceFile(user.id, fileId);
      return { error: "err_save_failed" };
    }
    scanId = data[0].id;
    await trackEvent("body_scanned", user.id);
  } catch (err) {
    return { error: toErrorKey(err) };
  }
  revalidatePath("/timeline");
  redirect(`/scan/body/${scanId}${fileFailed ? "?file=failed" : ""}`);
}

/** Enter, correct or clear the real weight on a scan: BMI and band are recomputed by code. */
export async function updateBodyWeightAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const id = formData.get("scanId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");
  const back = (error?: ErrorKey) =>
    redirect(`/scan/body/${id}${error ? `?error=${error}` : ""}`);

  const db = createAdminClient();
  const { data: scan } = await db
    .from("body_scans")
    .select("height_cm, est_weight_low, est_weight_high")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{
      height_cm: number;
      est_weight_low: number | null;
      est_weight_high: number | null;
    }>();
  if (!scan) throw new AppError("err_payment_state");
  const base = {
    heightCm: Number(scan.height_cm),
    estLow: scan.est_weight_low === null ? null : Number(scan.est_weight_low),
    estHigh:
      scan.est_weight_high === null ? null : Number(scan.est_weight_high),
  };

  const raw = String(formData.get("weight") ?? "").trim();
  const next =
    raw === ""
      ? withoutMeasuredWeight(base)
      : (() => {
          const w = parseWeightInput(raw);
          return w === null ? null : withMeasuredWeight(base, w);
        })();
  if (!next) return back("err_body_invalid");

  const { data, error } = await db
    .from("body_scans")
    .update({
      weight_kg: next.weightKg,
      bmi_low: next.bmiLow,
      bmi_high: next.bmiHigh,
      bmi_band: next.band,
      bmi_basis: next.basis,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  revalidatePath("/timeline");
  back();
}

export async function deleteBodyScanAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("scanId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");
  const fileId = await sourceFileOf("body_scans", id, user.id);
  const { error } = await createAdminClient()
    .from("body_scans")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new AppError("err_save_failed");
  await removeSourceFile(user.id, fileId);
  revalidatePath("/timeline");
  redirect("/timeline");
}

/** Remove just the kept body photo; the result stays. */
export async function deleteBodyFileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("scanId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");
  const fileId = await sourceFileOf("body_scans", id, user.id);
  if (!(await removeSourceFile(user.id, fileId)))
    throw new AppError("err_save_failed");
  revalidatePath(`/scan/body/${id}`);
  redirect(`/scan/body/${id}`);
}
