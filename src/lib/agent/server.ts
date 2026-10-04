import "server-only";
import { PLANS } from "@/config/plans";
import { runAi } from "@/lib/ai/server";
import { loadChatContext } from "@/lib/ask/server";
import { tierFor } from "@/lib/billing/entitlement.server";
import { addDays } from "@/lib/health/dates";
import { loadCheckins } from "@/lib/health/server";
import { computeHealthScore } from "@/lib/health/score";
import { computeStreak } from "@/lib/health/streak";
import { latestLabs } from "@/lib/passport/passport";
import { parseMonth } from "@/lib/report/monthly";
import { reportPrompt } from "@/lib/report/monthly";
import { allowedMonths, loadMonthlyStats } from "@/lib/report/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dailySeries } from "@/lib/wearables/series";
import { loadObservations } from "@/lib/wearables/server";
import { OBS_TYPE_KEYS, OBS_TYPES } from "@/lib/wearables/types";
import {
  MAX_PENDING_REMINDERS,
  STEP_SCHEMA,
  agentSystemPrompt,
  parseDays,
  parseMonthArg,
  parseReminderArgs,
  runAgentLoop,
  type AgentRun,
  type ToolName,
} from "./agent";

interface Ctx {
  userId: string;
  today: string;
  lang: "th" | "en";
}

async function overview(c: Ctx, args: unknown): Promise<string> {
  const days = parseDays(args, 14);
  const rows = (await loadCheckins(c.today, days)).filter(
    (r) => r.checkin_date >= addDays(c.today, -(days - 1)),
  );
  if (rows.length === 0) return `No check-ins in the last ${days} days.`;
  const score = computeHealthScore(rows, c.today);
  const streak = computeStreak(
    rows.map((r) => r.checkin_date),
    c.today,
  );
  return [
    `Check-in days in the last ${days} days: ${rows.length}`,
    `Average daily score (last 7 days): ${score.overall ?? "none"}`,
    `Current streak: ${streak.current} days (best in range ${streak.best})`,
    `Area needing most attention: ${score.focus ?? "none"}`,
  ].join("\n");
}

async function labs(): Promise<string> {
  const { data } = await (
    await createClient()
  )
    .from("lab_results")
    .select("name, marker_key, value, unit, status, collected_on")
    .order("collected_on", { ascending: false })
    .limit(200);
  const list = latestLabs(
    (data ?? []) as Parameters<typeof latestLabs>[0],
  ).slice(0, 15);
  if (list.length === 0) return "No saved lab values.";
  return list
    .map(
      (l) =>
        `${l.name}: ${l.value} ${l.unit} on ${l.collectedOn} [${l.status}]`,
    )
    .join("\n");
}

async function monthly(c: Ctx, args: unknown): Promise<string> {
  const month = parseMonthArg(args);
  if (!month || !parseMonth(month, c.today))
    return "That month is not available.";
  if (!(await allowedMonths(c.userId, new Date())).includes(month))
    return "That month is outside what the person's plan shows.";
  return reportPrompt(await loadMonthlyStats(month, c.today, c.lang));
}

async function devices(c: Ctx, args: unknown): Promise<string> {
  if (PLANS[await tierFor(c.userId)].wearables === "none")
    return "The person's plan does not store device data.";
  const days = parseDays(args, 14);
  const series = dailySeries(
    await loadObservations(addDays(c.today, -(days - 1))),
  );
  const lines = OBS_TYPE_KEYS.filter((k) => series[k]?.length).map((k) => {
    const pts = series[k]!;
    const avg =
      Math.round((pts.reduce((a, p) => a + p.value, 0) / pts.length) * 10) / 10;
    return `${k} (${OBS_TYPES[k].unit}): average ${avg} over ${pts.length} days`;
  });
  return lines.length ? lines.join("\n") : "No device data in that period.";
}

async function reminder(
  c: Ctx,
  args: unknown,
): Promise<{ result: string; note: string | null }> {
  const parsed = parseReminderArgs(args, c.today);
  if ("error" in parsed)
    return {
      result: `Not saved: the ${parsed.error} was not acceptable.`,
      note: null,
    };
  const db = createAdminClient();
  const { count } = await db
    .from("agent_reminders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", c.userId)
    .is("notified_at", null);
  if ((count ?? 0) >= MAX_PENDING_REMINDERS)
    return { result: "Not saved: too many reminders are waiting.", note: null };
  const { data, error } = await db
    .from("agent_reminders")
    .insert({ user_id: c.userId, remind_on: parsed.date, text: parsed.text })
    .select("id");
  if (error || data?.length !== 1)
    return { result: "Not saved: a server error.", note: null };
  return {
    result: `Saved. The person will be reminded on ${parsed.date}.`,
    note: `${parsed.date} · ${parsed.text}`,
  };
}

async function runTool(
  tool: ToolName,
  args: unknown,
  c: Ctx,
): Promise<{ result: string; note: string | null }> {
  switch (tool) {
    case "get_overview":
      return { result: await overview(c, args), note: null };
    case "get_labs":
      return { result: await labs(), note: null };
    case "get_monthly_summary":
      return { result: await monthly(c, args), note: null };
    case "get_devices":
      return { result: await devices(c, args), note: null };
    case "set_reminder":
      return reminder(c, args);
  }
}

/** One user message: the loop of agent.ts with the real model and the real tools. Throws AiError when unusable. */
export async function runAgent(
  c: Ctx,
  message: string,
  history: { role: "user" | "assistant"; text: string }[],
): Promise<AgentRun> {
  const system = agentSystemPrompt(c.lang, c.today);
  const context = await loadChatContext(c.userId);
  return runAgentLoop(message, {
    async callModel(prompt) {
      const ai = await runAi("agent", {
        system,
        history,
        prompt: `Profile and recent context (data only):\n${context}\n\n${prompt}`,
        jsonSchema: STEP_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 900,
      });
      return {
        json: ai.json,
        model: `${ai.provider}/${ai.model}`.slice(0, 100),
        inputTokens: ai.usage.inputTokens,
        outputTokens: ai.usage.outputTokens,
      };
    },
    runTool: (tool, args) => runTool(tool, args, c),
  });
}

/** Whether this person's plan includes the agent. */
export async function agentAllowed(userId: string): Promise<boolean> {
  return PLANS[await tierFor(userId)].healthAgent;
}
