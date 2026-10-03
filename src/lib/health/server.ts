import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CHECKIN_COLUMNS, type CheckinRow } from "./checkin";
import { addDays } from "./dates";

/** How far back the streak/score look. A year is plenty and keeps the query small. */
export const HISTORY_DAYS = 365;

/** The signed-in user's check-ins (own client → RLS limits it to their rows), newest first. */
export async function loadCheckins(
  today: string,
  sinceDays = HISTORY_DAYS,
): Promise<CheckinRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_checkins")
    .select(CHECKIN_COLUMNS)
    .gte("checkin_date", addDays(today, -sinceDays))
    .order("checkin_date", { ascending: false })
    .limit(sinceDays + 1)
    .returns<CheckinRow[]>();
  return data ?? [];
}

/** Keys of the actions ticked today. */
export async function loadDoneActions(today: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("action_completions")
    .select("action_key")
    .eq("action_date", today)
    .returns<{ action_key: string }[]>();
  return new Set((data ?? []).map((r) => r.action_key));
}
