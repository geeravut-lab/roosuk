import "server-only";
import { computeStreak } from "@/lib/health/streak";
import { loadCheckins } from "@/lib/health/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AchievementKey, AchievementStats } from "./achievements";

/**
 * Add every badge the person has now earned (the database counts their own
 * history). Failing quietly is right: a badge arriving a visit later is fine,
 * a broken Today page is not.
 */
export async function awardAchievements(userId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("award_achievements", {
    p_user: userId,
  });
  if (error) console.warn("[achievements] award failed:", error.message);
}

export interface AchievementView {
  earned: Map<AchievementKey, string>; // key → date earned
  stats: AchievementStats;
}

/** Award, then read the person's badges and the counters behind the progress bars. */
export async function loadAchievements(
  userId: string,
  today: string,
): Promise<AchievementView> {
  await awardAchievements(userId);
  const supabase = await createClient();
  const [{ data: rows }, checkins, { count: meals }, { data: labs }] =
    await Promise.all([
      supabase
        .from("user_achievements")
        .select("key, earned_on")
        .returns<{ key: AchievementKey; earned_on: string }[]>(),
      loadCheckins(today),
      supabase
        .from("meal_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed"),
      supabase
        .from("lab_reports")
        .select("collected_on")
        .eq("status", "confirmed")
        .not("collected_on", "is", null)
        .limit(500)
        .returns<{ collected_on: string }[]>(),
    ]);
  return {
    earned: new Map((rows ?? []).map((r) => [r.key, r.earned_on])),
    stats: {
      days: checkins.length,
      bestStreak: computeStreak(
        checkins.map((c) => c.checkin_date),
        today,
      ).best,
      meals: meals ?? 0,
      labs: (labs ?? []).length,
      labDates: new Set((labs ?? []).map((l) => l.collected_on)).size,
    },
  };
}
