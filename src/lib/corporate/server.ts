import "server-only";
import { addDays, bangkokDate } from "@/lib/health/dates";
import type { CheckinRow } from "@/lib/health/checkin";
import { createAdminClient } from "@/lib/supabase/admin";
import { companyStats, type GroupStats } from "./corporate";

export interface Membership {
  company: {
    id: string;
    name: string;
    tier: "gold" | "premium";
    validUntil: string;
    active: boolean;
  };
  shareStats: boolean;
  /** the company's plan is in force right now */
  live: boolean;
}

export async function loadMembership(
  userId: string,
): Promise<Membership | null> {
  const db = createAdminClient();
  const { data: m } = await db
    .from("company_members")
    .select("company_id, share_stats")
    .eq("user_id", userId)
    .maybeSingle<{ company_id: string; share_stats: boolean }>();
  if (!m) return null;
  const { data: c } = await db
    .from("companies")
    .select("id, name, tier, valid_until, active")
    .eq("id", m.company_id)
    .maybeSingle<{
      id: string;
      name: string;
      tier: "gold" | "premium";
      valid_until: string;
      active: boolean;
    }>();
  if (!c) return null;
  return {
    company: {
      id: c.id,
      name: c.name,
      tier: c.tier,
      validUntil: c.valid_until,
      active: c.active,
    },
    shareStats: m.share_stats,
    live: c.active && c.valid_until >= bangkokDate(new Date()),
  };
}

/** Group figures from the people who opted in — null while too few did (nothing about anyone is shown). */
export async function loadGroupStats(
  companyId: string,
): Promise<{ used: number; opted: number; stats: GroupStats | null }> {
  const db = createAdminClient();
  const { data: members } = await db
    .from("company_members")
    .select("user_id, share_stats")
    .eq("company_id", companyId)
    .limit(100_000);
  const all = members ?? [];
  const opted = all.filter((m) => m.share_stats).map((m) => m.user_id);
  if (opted.length < 5)
    return { used: all.length, opted: opted.length, stats: null };
  const today = bangkokDate(new Date());
  const since = addDays(today, -45);
  const byUser = new Map<string, CheckinRow[]>(opted.map((u) => [u, []]));
  for (let i = 0; i < opted.length; i += 500) {
    const { data } = await db
      .from("daily_checkins")
      .select(
        "user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition",
      )
      .in("user_id", opted.slice(i, i + 500))
      .gte("checkin_date", since)
      .limit(60_000);
    for (const r of data ?? []) byUser.get(r.user_id)?.push(r);
  }
  return {
    used: all.length,
    opted: opted.length,
    stats: companyStats(
      [...byUser.values()].map((checkins) => ({ checkins })),
      today,
    ),
  };
}
