"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAi } from "@/lib/ai/server";
import { AiError } from "@/lib/ai/types";
import { trackEvent } from "@/lib/analytics/server";
import { appendMessages, createConversation } from "@/lib/ask/server";
import { requireUser } from "@/lib/auth/server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import { assertFeature } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { loadCheckins } from "@/lib/health/server";
import { getLang } from "@/lib/i18n/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import {
  INSIGHT_SCHEMA,
  insightPrompt,
  insightSystemPrompt,
  normalizeInsightNote,
  type InsightNote,
} from "@/lib/insights/explain";
import { loadInsightNote, loadInsights } from "@/lib/insights/server";
import { createAdminClient } from "@/lib/supabase/admin";

const KINDS = ["lab_worse", "score_drop", "sleep_short", "comeback"];

/** Ask the AI to explain ONE current insight. The insight is re-found here from the person's data; the client only says which kind. */
export async function explainInsightAction(formData: FormData): Promise<void> {
  await assertFeature("insights");
  const user = await requireUser();
  const kind = String(formData.get("kind") ?? "");
  const back = (error?: ErrorKey) =>
    redirect(`/today${error ? `?error=${error}` : ""}#insight`);
  if (!KINDS.includes(kind)) back("err_invalid_input");

  const today = bangkokDate(new Date());
  const insight = (await loadInsights(today, await loadCheckins(today))).find(
    (i) => i.kind === kind,
  );
  if (!insight) back("err_insight_gone");
  else {
    if (await loadInsightNote(insight)) back(); // already explained: nothing to charge

    const decision = await checkAndConsume(user.id, "aiChat");
    if (!decision.allowed) back(decision.error);

    const lang = await getLang();
    let note: InsightNote | null = null;
    let model = "";
    try {
      const ai = await runAi("quick", {
        system: insightSystemPrompt(lang),
        prompt: insightPrompt(insight, lang),
        jsonSchema: INSIGHT_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 800,
      });
      note = normalizeInsightNote(ai.json);
      model = `${ai.provider}/${ai.model}`.slice(0, 100);
    } catch (err) {
      console.error(
        "[insight] explanation failed:",
        err instanceof AiError ? err.code : err,
      );
    }
    if (!note) {
      await refundUsage(user.id, "aiChat");
      back("err_ai_unavailable");
    } else {
      const { data: saved, error } = await createAdminClient()
        .from("insight_notes")
        .upsert(
          {
            user_id: user.id,
            kind: insight.kind,
            anchor: insight.anchor,
            summary: note.summary,
            steps: note.steps,
            model,
          },
          { onConflict: "user_id,kind,anchor", ignoreDuplicates: true },
        )
        .select("kind");
      if (error) {
        await refundUsage(user.id, "aiChat");
        back("err_save_failed");
      } else {
        // an empty result means a parallel request wrote it first: one note, one charge
        if (saved?.length !== 1) await refundUsage(user.id, "aiChat");
        const conversation = await createConversation(user.id, "insight");
        if (conversation)
          await appendMessages(conversation, user.id, [
            { role: "user", content: insightPrompt(insight, lang) },
            { role: "assistant", content: note.summary, model },
          ]);
        await trackEvent("insight_explained", user.id);
        revalidatePath("/today");
        back();
      }
    }
  }
}
