"use server";

import { revalidatePath } from "next/cache";
import { AiError } from "@/lib/ai/types";
import { runAgent, agentAllowed } from "@/lib/agent/server";
import { trackEvent } from "@/lib/analytics/server";
import { finalizeAnswer } from "@/lib/ask/answer";
import { HISTORY_TURNS, MAX_MESSAGE_CHARS } from "@/lib/ask/limits";
import { screenMessage } from "@/lib/ask/safety";
import {
  appendMessages,
  createConversation,
  latestConversation,
  recentMessages,
} from "@/lib/ask/server";
import { requireUser } from "@/lib/auth/server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getLang, getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AgentState {
  error?: ErrorKey;
  message?: string;
  ok?: boolean;
  sent?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One message to the agent. Same safety order as Ask My Health — emergency words
 * never reach a model; the quota gate fails closed; the answer passes OUR checks
 * before it is shown — plus the tools it may use, each noted in the log.
 */
export async function agentAction(
  _prev: AgentState,
  formData: FormData,
): Promise<AgentState> {
  await assertFeature("health_agent");
  const user = await requireUser();
  if (!(await agentAllowed(user.id))) return { error: "err_agent_plan" };
  const message = String(formData.get("message") ?? "").trim();
  if (message.length === 0 || message.length > MAX_MESSAGE_CHARS)
    return { error: "err_ask_invalid", message };

  const [t, lang] = await Promise.all([getT(), getLang()]);
  const conversation =
    (await latestConversation(user.id, "agent")) ??
    (await createConversation(user.id, "agent"));
  if (!conversation) return { error: "err_save_failed", message };

  const escalation = screenMessage(message);
  if (escalation) {
    const text = escalation === "self_harm" ? t.askSelfHarm : t.askEmergency;
    const saved = await appendMessages(conversation, user.id, [
      { role: "user", content: message, flag: escalation },
      { role: "assistant", content: text, flag: escalation },
    ]);
    if (!saved) return { error: "err_save_failed", message };
    revalidatePath("/agent");
    return { ok: true, sent: Date.now() };
  }

  const decision = await checkAndConsume(user.id, "aiChat");
  if (!decision.allowed) return { error: decision.error, message };

  try {
    const history = (await recentMessages(conversation, HISTORY_TURNS * 2))
      .filter((m) => m.flag !== "tool")
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.content }));
    const run = await runAgent(
      { userId: user.id, today: bangkokDate(new Date()), lang },
      message,
      history,
    );
    const final = finalizeAnswer(run.answer);
    const text =
      final.replace === "emergency"
        ? t.askEmergency
        : final.replace === "guardrail"
          ? t.askGuardrail
          : final.text;
    const saved = await appendMessages(conversation, user.id, [
      { role: "user", content: message },
      // what the agent DID (a reminder it saved, a record it read) is part of the audit trail and of the chat
      ...run.notes.map((n) => ({
        role: "assistant" as const,
        content: `${n.tool}${n.note ? `: ${n.note}` : ""}`,
        flag: "tool",
      })),
      {
        role: "assistant",
        content: text,
        flag: final.flag,
        model: run.model,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
      },
    ]);
    if (!saved) {
      await refundUsage(user.id, "aiChat");
      return { error: "err_save_failed", message };
    }
  } catch (err) {
    await refundUsage(user.id, "aiChat");
    console.error("[agent] failed:", err instanceof AiError ? err.code : err);
    return { error: "err_ai_unavailable", message };
  }

  await trackEvent("agent_used", user.id);
  revalidatePath("/agent");
  return { ok: true, sent: Date.now() };
}

export async function newAgentConversationAction(): Promise<void> {
  await assertFeature("health_agent");
  const user = await requireUser();
  await createConversation(user.id, "agent");
  revalidatePath("/agent");
}

/** Cancel a reminder the agent saved. */
export async function cancelReminderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const { error } = await createAdminClient()
    .from("agent_reminders")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new AppError("err_save_failed");
  revalidatePath("/agent");
}
