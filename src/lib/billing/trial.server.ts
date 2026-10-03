import "server-only";
import { loadPlatformSettings } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trialWindow } from "./trial";

/**
 * Starts the Premium trial the first time it is called for a user. The UPDATE
 * only matches a profile whose trial has never started, so it is idempotent and
 * safe to call from several places (consent action, layout self-heal) — at most
 * one of them gets `true`. Written with the service role: users cannot touch
 * these columns. Returns whether THIS call started the trial.
 */
export async function startTrialIfEligible(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { billing } = await loadPlatformSettings();
  if (billing.trialDays <= 0) return false; // trial switched off by an admin

  const { startedAt, endsAt } = trialWindow(now, billing.trialDays);
  const { data, error } = await createAdminClient()
    .from("profiles")
    .update({ trial_started_at: startedAt, trial_ends_at: endsAt })
    .eq("id", userId)
    .is("trial_started_at", null)
    .select("id");
  if (error) throw error;
  return data?.length === 1;
}
