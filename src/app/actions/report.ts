"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAi } from "@/lib/ai/server";
import { AiError } from "@/lib/ai/types";
import { trackEvent } from "@/lib/analytics/server";
import { appendMessages, createConversation } from "@/lib/ask/server";
import { requireUser } from "@/lib/auth/server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { getLang } from "@/lib/i18n/server";
import {
  MIN_CHECKIN_DAYS,
  REPORT_SCHEMA,
  normalizeNarrative,
  parseMonth,
  reportPrompt,
  reportSystemPrompt,
  type ReportNarrative,
} from "@/lib/report/monthly";
import {
  allowedMonths,
  loadMonthlyStats,
  loadNarrative,
} from "@/lib/report/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Write the AI recap for one month. The figures it uses are computed here from the person's own data. */
export async function generateReportAction(formData: FormData): Promise<void> {
  await assertFeature("monthly_report");
  const user = await requireUser();
  const now = new Date();
  const today = bangkokDate(now);
  const month = parseMonth(formData.get("month"), today);
  if (!month) throw new AppError("err_invalid_input");
  const back = (error?: ErrorKey) =>
    redirect(`/report?month=${month}${error ? `&error=${error}` : ""}`);
  if (!(await allowedMonths(user.id, now)).includes(month)) redirect("/report");

  if (await loadNarrative(month)) back(); // already written: nothing to charge

  const lang = await getLang();
  const stats = await loadMonthlyStats(month, today, lang);
  if (stats.checkinDays < MIN_CHECKIN_DAYS) back("err_report_quiet");

  const decision = await checkAndConsume(user.id, "aiChat");
  if (!decision.allowed) back(decision.error);

  let narrative: ReportNarrative | null = null;
  let model = "";
  try {
    const ai = await runAi("monthly_report", {
      system: reportSystemPrompt(lang),
      prompt: reportPrompt(stats),
      jsonSchema: REPORT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1024,
    });
    narrative = normalizeNarrative(ai.json);
    model = `${ai.provider}/${ai.model}`.slice(0, 100);
  } catch (err) {
    console.error(
      "[report] recap failed:",
      err instanceof AiError ? err.code : err,
    );
  }
  if (!narrative) {
    await refundUsage(user.id, "aiChat");
    back("err_ai_unavailable");
    return;
  }

  const { data: saved, error } = await createAdminClient()
    .from("monthly_reports")
    .upsert(
      {
        user_id: user.id,
        month: `${month}-01`,
        summary: narrative.summary,
        highlights: narrative.highlights,
        next_steps: narrative.nextSteps,
        model,
      },
      { onConflict: "user_id,month", ignoreDuplicates: true },
    )
    .select("month");
  if (error) {
    await refundUsage(user.id, "aiChat");
    back("err_save_failed");
    return;
  }
  // an empty result means a parallel request wrote it first: one recap, one charge
  if (saved?.length !== 1) await refundUsage(user.id, "aiChat");

  const conversation = await createConversation(user.id, "monthly_report");
  if (conversation)
    await appendMessages(conversation, user.id, [
      { role: "user", content: reportPrompt(stats) },
      { role: "assistant", content: narrative.summary, model },
    ]);
  await trackEvent("report_generated", user.id);
  revalidatePath("/report");
  back();
}

/** Delete the stored recap (so it can be written again). */
export async function deleteReportAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const month = parseMonth(formData.get("month"), bangkokDate(new Date()));
  if (!month) throw new AppError("err_invalid_input");
  const { error } = await createAdminClient()
    .from("monthly_reports")
    .delete()
    .eq("user_id", user.id)
    .eq("month", `${month}-01`);
  if (error) throw new AppError("err_save_failed");
  revalidatePath("/report");
  redirect(`/report?month=${month}`);
}
