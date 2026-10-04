"use server";

import { trackEvent } from "@/lib/analytics/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAi } from "@/lib/ai/server";
import { appendMessages, createConversation } from "@/lib/ask/server";
import { AiError } from "@/lib/ai/types";
import { requireUser } from "@/lib/auth/server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { sniffImageType } from "@/lib/food/food";
import { bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getLang, getT } from "@/lib/i18n/server";
import {
  EMPTY_PROFILE,
  PROFILE_COLUMNS,
  profileForPrompt,
  type HealthProfile,
} from "@/lib/profile/profile";
import {
  EXPLAIN_SCHEMA,
  explainPrompt,
  explainSystemPrompt,
  normalizeExplanation,
  type LabExplanation,
} from "@/lib/lab/explain";
import {
  LAB_SCHEMA,
  MAX_FILE_BYTES,
  applyLabReview,
  cleanDate,
  isPdf,
  labPrompt,
  normalizeLabResult,
  parseStoredLabItems,
} from "@/lib/lab/lab";
import {
  canKeepFiles,
  removeSourceFile,
  sourceFileOf,
  storeSourceFile,
} from "@/lib/files/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface LabScanState {
  error?: ErrorKey;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toErrorKey = (e: unknown): ErrorKey =>
  e instanceof AppError ? e.code : "err_unknown";

/**
 * Report (PDF or photo) → draft. Same order as every AI feature: feature
 * switch → validate input → quota gate → provider call → code decides every
 * status → draft row. The file lives only in this function's memory.
 */
export async function scanLabAction(
  _prev: LabScanState,
  formData: FormData,
): Promise<LabScanState> {
  let draftId: string;
  let fileFailed = false;
  try {
    const user = await requireUser();
    await assertFeature("lab_scan");

    // Asked for every scan; no answer = no scan (and nothing is kept unless it is "keep").
    const keep = formData.get("keepFile");
    if (keep !== "keep" && keep !== "discard")
      return { error: "err_keep_choice" };
    if (keep === "keep" && !(await canKeepFiles(user.id)))
      return { error: "err_keep_unavailable" };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { error: "err_file_required" };
    if (file.size > MAX_FILE_BYTES) return { error: "err_file_too_large" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = isPdf(bytes);
    const imageType = pdf ? null : sniffImageType(bytes);
    if (!pdf && !imageType) return { error: "err_file_type" };

    const decision = await checkAndConsume(user.id, "labImport");
    if (!decision.allowed) return { error: decision.error };

    const { system, prompt } = labPrompt();
    const data = Buffer.from(bytes).toString("base64");
    let result;
    try {
      result = await runAi("lab_extract", {
        system,
        prompt,
        ...(pdf
          ? { documents: [{ mediaType: "application/pdf", data }] }
          : { images: [{ mediaType: imageType!, data }] }),
        jsonSchema: LAB_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 8192,
      });
    } catch (err) {
      await refundUsage(user.id, "labImport");
      console.error(
        "[lab] AI call failed:",
        err instanceof AiError ? err.code : err,
      );
      return { error: "err_ai_unavailable" };
    }

    const parsed = normalizeLabResult(result.json, bangkokDate(new Date()));
    if (!parsed) {
      await refundUsage(user.id, "labImport");
      return { error: "err_lab_not_found" };
    }

    // Only now, with a usable result: store the file (sealed) if the user said keep.
    const fileId =
      keep === "keep"
        ? await storeSourceFile({
            userId: user.id,
            kind: "lab",
            bytes,
            mime: pdf ? "application/pdf" : imageType!,
          })
        : null;
    fileFailed = keep === "keep" && !fileId;

    const { data: row, error } = await createAdminClient()
      .from("lab_reports")
      .insert({
        user_id: user.id,
        source_file_id: fileId,
        status: "draft",
        collected_on: parsed.collectedOn,
        items: parsed.items,
        model: `${result.provider}/${result.model}`.slice(0, 100),
      })
      .select("id");
    if (error || row?.length !== 1) {
      await removeSourceFile(user.id, fileId);
      return { error: "err_save_failed" };
    }
    draftId = row[0].id;
    await trackEvent("lab_scanned", user.id);
  } catch (err) {
    return { error: toErrorKey(err) };
  }
  redirect(`/scan/lab/${draftId}${fileFailed ? "?file=failed" : ""}`);
}

/**
 * The review step. The user fixes misread numbers, drops wrong rows and sets
 * the date; every status is recomputed HERE from our reference table, then the
 * atomic SQL function writes the report and its results together.
 */
export async function confirmLabAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("reportId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");

  const collectedOn = cleanDate(
    formData.get("collectedOn"),
    bangkokDate(new Date()),
  );
  if (!collectedOn) redirect(`/scan/lab/${id}?error=err_invalid_date`);

  const db = createAdminClient();
  const { data: report } = await db
    .from("lab_reports")
    .select("items")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .maybeSingle<{ items: unknown }>();
  if (!report) throw new AppError("err_payment_state");

  const stored = parseStoredLabItems(report.items);
  const reviewed = applyLabReview(stored, {
    values: stored.map((_, i) => {
      const raw = String(formData.get(`value.${i}`) ?? "").trim();
      return raw === "" ? null : Number(raw);
    }),
    remove: stored.map((_, i) => formData.get(`remove.${i}`) === "on"),
  });
  if (reviewed.length === 0) {
    const fileId = await sourceFileOf("lab_reports", id, user.id);
    await db.from("lab_reports").delete().eq("id", id).eq("user_id", user.id);
    await removeSourceFile(user.id, fileId);
    revalidatePath("/scan");
    redirect("/scan");
  }

  const { data: n, error } = await db.rpc("confirm_lab_report", {
    p_report: id,
    p_user: user.id,
    p_collected_on: collectedOn,
    p_items: reviewed,
  });
  if (error || n !== reviewed.length) throw new AppError("err_save_failed");

  revalidatePath("/timeline");
  redirect(`/scan/lab/${id}`);
}

/** Delete a report (draft or confirmed); its results go with it. The user's own client, so RLS decides. */
export async function deleteLabReportAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("reportId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");

  const fileId = await sourceFileOf("lab_reports", id, user.id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("lab_reports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new AppError("err_save_failed");
  await removeSourceFile(user.id, fileId);

  revalidatePath("/timeline");
  redirect("/timeline");
}

/**
 * "Explain with AI" for a CONFIRMED report. Costs one use of the AI question
 * allowance; the answer is stored on the report (so reopening it is free) and
 * logged as a conversation for audit. Failure or an unusable answer refunds.
 */
export async function explainLabAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("reportId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");
  const back = (error?: ErrorKey) =>
    redirect(`/scan/lab/${id}${error ? `?error=${error}` : ""}`);

  const db = createAdminClient();
  const { data: report } = await db
    .from("lab_reports")
    .select("items, explanation")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "confirmed")
    .maybeSingle<{ items: unknown; explanation: unknown }>();
  if (!report) throw new AppError("err_payment_state");
  if (report.explanation) back(); // already explained: nothing to charge

  const items = parseStoredLabItems(report.items);
  if (items.every((i) => i.status === "unknown"))
    back("err_lab_nothing_to_explain");

  const decision = await checkAndConsume(user.id, "aiChat");
  if (!decision.allowed) back(decision.error);

  const [lang, t] = await Promise.all([getLang(), getT()]);
  let explanation: LabExplanation | null = null;
  let model = "";
  try {
    const { data: profile } = await db
      .from("health_profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle<HealthProfile>();
    const ai = await runAi("lab_explain", {
      system: explainSystemPrompt(lang),
      prompt: explainPrompt(
        items,
        profileForPrompt(profile ?? EMPTY_PROFILE, new Date().getFullYear()),
      ),
      jsonSchema: EXPLAIN_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 2048,
    });
    explanation = normalizeExplanation(ai.json, items);
    model = `${ai.provider}/${ai.model}`.slice(0, 100);
  } catch (err) {
    console.error(
      "[lab] explanation failed:",
      err instanceof AiError ? err.code : err,
    );
  }
  if (!explanation) {
    await refundUsage(user.id, "aiChat");
    back("err_ai_unavailable");
    return;
  }

  const { data: saved, error } = await db
    .from("lab_reports")
    .update({ explanation, explained_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "confirmed")
    .select("id");
  if (error || saved?.length !== 1) {
    await refundUsage(user.id, "aiChat");
    back("err_save_failed");
    return;
  }

  // Audit trail: what was asked, what the user was told.
  const conversation = await createConversation(user.id, "lab_explain", id);
  if (conversation)
    await appendMessages(conversation, user.id, [
      { role: "user", content: t.labExplainRequest },
      {
        role: "assistant",
        content: explanation.summary,
        flag: explanation.seeDoctor ? "see_doctor" : null,
        model,
      },
    ]);

  await trackEvent("lab_explained", user.id);
  revalidatePath(`/scan/lab/${id}`);
  back();
}

/** Remove just the kept original file; the report, its values and explanation stay. */
export async function deleteLabFileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("reportId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");
  const fileId = await sourceFileOf("lab_reports", id, user.id);
  if (!(await removeSourceFile(user.id, fileId)))
    throw new AppError("err_save_failed");
  revalidatePath(`/scan/lab/${id}`);
  redirect(`/scan/lab/${id}`);
}
