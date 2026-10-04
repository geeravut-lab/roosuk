import "server-only";
import { bangkokDate } from "@/lib/health/dates";
import { rewardEarnedNotice } from "@/lib/notify/messages";
import { dictFor, notifyUser } from "@/lib/notify/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { type ChallengeTemplate, phaseOf, type Phase } from "./challenges";

export interface ChallengeView {
  id: string;
  template: ChallengeTemplate;
  mode: "solo" | "friend";
  metric: "checkin_days" | "meal_days";
  startsOn: string;
  endsOn: string;
  target: number;
  inviteCode: string | null;
  completedAt: string | null;
  phase: Phase;
  mine: number;
  friend: { name: string | null; have: number; completed: boolean } | null;
}

/** Days that count for a person inside a window (their own rows; service role because it also reads the friend's). */
async function countDays(
  userId: string,
  metric: "checkin_days" | "meal_days",
  from: string,
  to: string,
): Promise<number> {
  const db = createAdminClient();
  if (metric === "checkin_days") {
    const { count } = await db
      .from("daily_checkins")
      .select("checkin_date", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("checkin_date", from)
      .lte("checkin_date", to);
    return count ?? 0;
  }
  const { data } = await db
    .from("meal_logs")
    .select("meal_date")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("meal_date", from)
    .lte("meal_date", to)
    .limit(500)
    .returns<{ meal_date: string }[]>();
  return new Set((data ?? []).map((r) => r.meal_date)).size;
}

/**
 * Complete any challenge whose target was reached (in SQL, once, with the
 * reward cap) and tell the person about the reward. Quiet on failure: a
 * reward arriving a visit later is fine, a broken page is not.
 */
export async function evaluateChallenges(
  userId: string,
  today: string,
): Promise<void> {
  try {
    const { data, error } = await createAdminClient().rpc(
      "evaluate_challenges",
      {
        p_user: userId,
        p_today: today,
      },
    );
    if (error) throw error;
    const done = (data ?? []) as { challenge: string; amount: number }[];
    for (const d of done) {
      if (d.amount > 0) {
        const { t } = await dictFor(userId);
        await notifyUser(
          userId,
          rewardEarnedNotice(t, "challenge", d.amount, d.challenge),
        );
      }
    }
  } catch (err) {
    console.error("[challenges] evaluate failed:", err);
  }
}

/** The person's challenges with progress, newest first; a friend's progress comes from the same window. */
export async function loadChallenges(
  userId: string,
  today: string,
): Promise<ChallengeView[]> {
  await evaluateChallenges(userId, today);
  const supabase = await createClient();
  const [{ data: mine }, { data: challenges }] = await Promise.all([
    supabase
      .from("challenge_participants")
      .select("challenge_id, completed_at")
      .returns<{ challenge_id: string; completed_at: string | null }[]>(),
    supabase
      .from("challenges")
      .select(
        "id, template, mode, metric, starts_on, ends_on, target, invite_code, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<
        {
          id: string;
          template: ChallengeTemplate;
          mode: "solo" | "friend";
          metric: "checkin_days" | "meal_days";
          starts_on: string;
          ends_on: string;
          target: number;
          invite_code: string | null;
        }[]
      >(),
  ]);
  const completed = new Map(
    (mine ?? []).map((p) => [p.challenge_id, p.completed_at]),
  );
  const db = createAdminClient();
  const out: ChallengeView[] = [];
  for (const c of challenges ?? []) {
    const completedAt = completed.get(c.id) ?? null;
    let friend: ChallengeView["friend"] = null;
    if (c.mode === "friend") {
      const { data: others } = await db
        .from("challenge_participants")
        .select("user_id, completed_at")
        .eq("challenge_id", c.id)
        .neq("user_id", userId)
        .returns<{ user_id: string; completed_at: string | null }[]>();
      const other = others?.[0];
      if (other) {
        const [{ data: prof }, have] = await Promise.all([
          db
            .from("profiles")
            .select("display_name")
            .eq("id", other.user_id)
            .maybeSingle<{ display_name: string | null }>(),
          countDays(other.user_id, c.metric, c.starts_on, c.ends_on),
        ]);
        friend = {
          name: prof?.display_name ?? null,
          have,
          completed: !!other.completed_at,
        };
      }
    }
    out.push({
      id: c.id,
      template: c.template,
      mode: c.mode,
      metric: c.metric,
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      target: c.target,
      inviteCode: c.invite_code,
      completedAt,
      phase: phaseOf({ completedAt, endsOn: c.ends_on, today }),
      mine: await countDays(userId, c.metric, c.starts_on, c.ends_on),
      friend,
    });
  }
  return out;
}

export const bangkokToday = () => bangkokDate(new Date());
