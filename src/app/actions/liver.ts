"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import { inputsDigest } from "@/lib/liver/digest";
import { assessLiver } from "@/lib/liver/engine";
import {
  HEP_B,
  HEP_C,
  parseLiverForm,
  type HepB,
  type HepC,
} from "@/lib/liver/questionnaire";
import { loadLiverDefaults, loadLiverPanels } from "@/lib/liver/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LiverState {
  error?: ErrorKey;
  saved?: boolean;
}

const toErrorKey = (e: unknown): ErrorKey =>
  e instanceof AppError ? e.code : "err_unknown";

/**
 * Questionnaire → rule engine → stored result. The browser only sends answers;
 * the engine runs here, on the person's own lab rows read with THEIR client, and
 * the result is written with the service role through record_liver_assessment()
 * (assessment + audit entry + hepatitis note, one transaction). No AI is called.
 */
export async function submitLiverCheckAction(
  _prev: LiverState,
  formData: FormData,
): Promise<LiverState> {
  let id: string;
  try {
    await assertFeature("liver_check");
    const user = await requireUser();

    const known = await loadLiverDefaults();
    const parsed = parseLiverForm(formData, known);
    if (!parsed.ok) return { error: "err_liver_invalid" };

    const today = bangkokDate(new Date());
    const panels = await loadLiverPanels();
    const result = assessLiver({ today, answers: parsed.answers, panels });
    const fib = result.scores.fib4;
    const apri = result.scores.apri;

    const { data, error } = await createAdminClient().rpc(
      "record_liver_assessment",
      {
        p_user: user.id,
        p_level: result.level,
        p_urgency: result.urgency,
        p_fib4: fib.status === "ok" ? fib.value : null,
        p_apri: apri.status === "ok" ? apri.value : null,
        p_engine: result.engine,
        p_answers: parsed.answers,
        p_result: result,
        p_digest: inputsDigest({ today, answers: parsed.answers, panels }),
        p_hep_b: parsed.answers.hepB,
        p_hep_c: parsed.answers.hepC,
      },
    );
    if (error) {
      console.error("[liver] record failed:", error.message);
      return { error: "err_save_failed" };
    }
    // null = the 24-hour limit; anything but a uuid is a failure, never "success"
    if (data === null) return { error: "err_liver_limit" };
    if (typeof data !== "string") return { error: "err_save_failed" };
    id = data;
  } catch (err) {
    console.error("[liver] check failed:", err);
    return { error: toErrorKey(err) };
  }
  revalidatePath("/liver");
  redirect(`/liver/result/${id}`);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function testedOn(
  form: FormData,
  name: string,
  today: string,
): string | null | undefined {
  const raw = String(form.get(name) ?? "").trim();
  if (raw === "") return null;
  if (!DATE.test(raw) || raw > today || raw < "1950-01-01") return undefined;
  return raw;
}

/** The hepatitis B/C note: the person's own words about testing, never a diagnosis. */
export async function saveHepatitisAction(
  _prev: LiverState,
  formData: FormData,
): Promise<LiverState> {
  try {
    await assertFeature("liver_check");
    const user = await requireUser();
    const b = String(formData.get("hepB") ?? "");
    const c = String(formData.get("hepC") ?? "");
    const today = bangkokDate(new Date());
    const bOn = testedOn(formData, "hepBOn", today);
    const cOn = testedOn(formData, "hepCOn", today);
    if (
      !(HEP_B as readonly string[]).includes(b) ||
      !(HEP_C as readonly string[]).includes(c) ||
      bOn === undefined ||
      cOn === undefined
    )
      return { error: "err_liver_invalid" };
    // a test date only makes sense for a test that was done
    const tested = (v: string) => v === "negative" || v === "positive";
    const { data, error } = await createAdminClient()
      .from("liver_hepatitis_status")
      .upsert(
        {
          user_id: user.id,
          hep_b: b as HepB,
          hep_c: c as HepC,
          hep_b_tested_on: tested(b) || b === "vaccinated" ? bOn : null,
          hep_c_tested_on: tested(c) ? cOn : null,
        },
        { onConflict: "user_id" },
      )
      .select("user_id");
    if (error || data?.length !== 1) return { error: "err_save_failed" };
    revalidatePath("/liver");
    revalidatePath("/liver/hepatitis");
    return { saved: true };
  } catch (err) {
    console.error("[liver] hepatitis save failed:", err);
    return { error: toErrorKey(err) };
  }
}
