"use server";

import { revalidatePath } from "next/cache";
import { AiError } from "@/lib/ai/types";
import { runAi } from "@/lib/ai/server";
import { requireUser } from "@/lib/auth/server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import {
  ANSWER_SCHEMA,
  finalizeAnswer,
  parseModelAnswer,
} from "@/lib/ask/answer";
import { chatSystemPrompt } from "@/lib/ask/context";
import { HISTORY_TURNS, MAX_MESSAGE_CHARS } from "@/lib/ask/limits";
import { screenMessage } from "@/lib/ask/safety";
import {
  appendMessages,
  createConversation,
  latestChatConversation,
  loadChatContext,
  recentMessages,
} from "@/lib/ask/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getLang, getT } from "@/lib/i18n/server";

export interface AskState {
  error?: ErrorKey;
  /** Handed back on failure so the text box can be refilled — a failed answer must not eat the question. */
  message?: string;
  ok?: boolean;
  /** Changes with every successful exchange, so the form can remount and clear its box. */
  sent?: number;
}

/**
 * One question to Ask My Health. The order is the safety design:
 *   1. emergency / self-harm words → a FIXED message, no model, no quota;
 *   2. quota gate (fails closed);
 *   3. the model answers with a self-assessed urgency and confidence;
 *   4. OUR code checks the answer (no doses, no "stop your medicine", no
 *      diagnosis) and replaces or flags it before the user sees it.
 * Both sides of every exchange are stored for audit and for the user's history.
 */
export async function askAction(
  _prev: AskState,
  formData: FormData,
): Promise<AskState> {
  const user = await requireUser();
  const message = String(formData.get("message") ?? "").trim();
  if (message.length === 0 || message.length > MAX_MESSAGE_CHARS)
    return { error: "err_ask_invalid", message };

  const [t, lang] = await Promise.all([getT(), getLang()]);
  const conversation =
    (await latestChatConversation(user.id)) ??
    (await createConversation(user.id, "chat"));
  if (!conversation) return { error: "err_save_failed", message };

  // 1 ── emergency words never reach a model
  const escalation = screenMessage(message);
  if (escalation) {
    const text = escalation === "self_harm" ? t.askSelfHarm : t.askEmergency;
    const saved = await appendMessages(conversation, user.id, [
      { role: "user", content: message, flag: escalation },
      { role: "assistant", content: text, flag: escalation },
    ]);
    if (!saved) return { error: "err_save_failed", message };
    revalidatePath("/ask");
    return { ok: true, sent: Date.now() };
  }

  // 2 ── quota
  const decision = await checkAndConsume(user.id, "aiChat");
  if (!decision.allowed) return { error: decision.error, message };

  // 3 ── the model
  try {
    const [context, history] = await Promise.all([
      loadChatContext(user.id),
      recentMessages(conversation, HISTORY_TURNS),
    ]);
    const ai = await runAi("chat", {
      system: chatSystemPrompt(lang),
      history: history.map((h) => ({ role: h.role, text: h.content })),
      prompt: `Context about the user:\n${context}\n\nUser message:\n${message}`,
      jsonSchema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1024,
    });

    const parsed = parseModelAnswer(ai.json);
    if (!parsed) throw new AiError("bad_output");

    // 4 ── our checks on the answer
    const final = finalizeAnswer(parsed);
    const text =
      final.replace === "emergency"
        ? t.askEmergency
        : final.replace === "guardrail"
          ? t.askGuardrail
          : final.text;
    const saved = await appendMessages(conversation, user.id, [
      { role: "user", content: message },
      {
        role: "assistant",
        content: text,
        flag: final.flag,
        model: `${ai.provider}/${ai.model}`,
        inputTokens: ai.usage.inputTokens,
        outputTokens: ai.usage.outputTokens,
      },
    ]);
    if (!saved) {
      await refundUsage(user.id, "aiChat");
      return { error: "err_save_failed", message };
    }
  } catch (err) {
    // Our side failed (provider down, unusable output): the user keeps their use and their question.
    await refundUsage(user.id, "aiChat");
    console.error(
      "[ask] AI call failed:",
      err instanceof AiError ? err.code : err,
    );
    return { error: "err_ai_unavailable", message };
  }

  revalidatePath("/ask");
  return { ok: true, sent: Date.now() };
}

/** Start a fresh conversation (the old one stays in the user's history). */
export async function newConversationAction(): Promise<void> {
  const user = await requireUser();
  await createConversation(user.id, "chat");
  revalidatePath("/ask");
}
