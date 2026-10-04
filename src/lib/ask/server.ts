import "server-only";
import { computeHealthScore } from "@/lib/health/score";
import { addDays, bangkokDate } from "@/lib/health/dates";
import type { LabStatus } from "@/lib/lab/lab";
import {
  PROFILE_COLUMNS,
  EMPTY_PROFILE,
  profileForPrompt,
  type HealthProfile,
} from "@/lib/profile/profile";
import { ensureCatalog } from "@/lib/lab/catalog.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildContext, type ContextLab } from "./context";

/**
 * Everything the model may know about a user, gathered with the SERVICE role
 * after the caller has proven who they are (requireUser) — and reduced to a
 * plain-text context with no identifiers (see buildContext).
 */
export async function loadChatContext(userId: string): Promise<string> {
  await ensureCatalog();
  const db = createAdminClient();
  const today = bangkokDate(new Date());
  const [profile, checkins, labs] = await Promise.all([
    db
      .from("health_profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle<HealthProfile>(),
    loadCheckinsFor(userId, today),
    db
      .from("lab_results")
      .select("name, marker_key, value, unit, status, collected_on")
      .eq("user_id", userId)
      .order("collected_on", { ascending: false })
      .limit(60)
      .returns<(ContextLab & { status: LabStatus })[]>(),
  ]);
  return buildContext({
    profileText: profileForPrompt(
      profile.data ?? EMPTY_PROFILE,
      new Date().getFullYear(),
    ),
    score: computeHealthScore(checkins, today),
    labs: (labs.data ?? []).map((l) => ({ ...l, value: Number(l.value) })),
  });
}

async function loadCheckinsFor(userId: string, today: string) {
  const { data } = await createAdminClient()
    .from("daily_checkins")
    .select("checkin_date, sleep_band, activity_band, energy, mood, nutrition")
    .eq("user_id", userId)
    .gte("checkin_date", addDays(today, -14))
    .returns<
      {
        checkin_date: string;
        sleep_band: number;
        activity_band: number;
        energy: number;
        mood: number;
        nutrition: number;
      }[]
    >();
  return data ?? [];
}

export interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  flag: string | null;
  created_at: string;
}

/** The user's latest chat conversation (service role: caller has verified identity). */
export async function latestChatConversation(
  userId: string,
): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("ai_conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "chat")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function createConversation(
  userId: string,
  kind: "chat" | "lab_explain",
  reportId: string | null = null,
): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("ai_conversations")
    .insert({ user_id: userId, kind, report_id: reportId })
    .select("id");
  return error || data?.length !== 1 ? null : data[0].id;
}

export async function recentMessages(
  conversationId: string,
  limit: number,
): Promise<StoredMessage[]> {
  const { data } = await createAdminClient()
    .from("ai_messages")
    .select("id, role, content, flag, created_at")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(limit)
    .returns<StoredMessage[]>();
  return (data ?? []).reverse();
}

export async function appendMessages(
  conversationId: string,
  userId: string,
  messages: {
    role: "user" | "assistant";
    content: string;
    flag?: string | null;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
  }[],
): Promise<boolean> {
  const db = createAdminClient();
  const { error } = await db.from("ai_messages").insert(
    messages.map((m) => ({
      conversation_id: conversationId,
      user_id: userId,
      role: m.role,
      content: m.content.slice(0, 8000),
      flag: m.flag ?? null,
      model: m.model ?? null,
      input_tokens: m.inputTokens ?? null,
      output_tokens: m.outputTokens ?? null,
    })),
  );
  if (error) return false;
  await db
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  return true;
}
