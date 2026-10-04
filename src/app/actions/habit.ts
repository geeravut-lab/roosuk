"use server";

import { trackEvent } from "@/lib/analytics/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { CHECKIN_ACTION, isActionKey } from "@/lib/health/actions";
import { parseCheckinForm } from "@/lib/health/checkin";
import { bangkokDate } from "@/lib/health/dates";
import { createClient } from "@/lib/supabase/server";

/**
 * Saves today's check-in with the user's OWN client: RLS only accepts a row for
 * themselves dated today (Bangkok), so the date here is just the same rule.
 * Submitting again the same day edits the answers.
 */
export async function submitCheckinAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const parsed = parseCheckinForm(formData);
  if (!parsed.ok) redirect("/today/checkin?error=err_invalid_input");

  const supabase = await createClient();
  const date = bangkokDate(new Date());

  const update = () =>
    supabase
      .from("daily_checkins")
      .update(parsed.answers)
      .eq("user_id", user.id)
      .eq("checkin_date", date)
      .select("user_id");

  // Not an upsert: users have no UPDATE right on the key columns, which an upsert would write.
  let { data, error } = await update();
  if (!error && data?.length === 0) {
    const inserted = await supabase
      .from("daily_checkins")
      .insert({ user_id: user.id, checkin_date: date, ...parsed.answers })
      .select("user_id");
    if (inserted.error?.code === "23505") {
      // A double submit won the race: apply ours as an edit.
      ({ data, error } = await update());
    } else {
      data = inserted.data;
      error = inserted.error;
    }
  }
  // An UPDATE that matches nothing is "success" to PostgREST — count the rows.
  if (error || data?.length !== 1)
    redirect("/today/checkin?error=err_save_failed");

  await trackEvent("checkin_done", user.id);
  revalidatePath("/today");
  revalidatePath("/timeline");
  redirect("/today");
}

/** Tick or untick one of today's actions (the check-in action is derived, never stored). */
export async function toggleActionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const key = formData.get("actionKey");
  const done = formData.get("done") === "true";
  if (!isActionKey(key) || key === CHECKIN_ACTION) return;

  const supabase = await createClient();
  const date = bangkokDate(new Date());
  if (done) {
    const { error } = await supabase
      .from("action_completions")
      .insert({ user_id: user.id, action_date: date, action_key: key });
    // 23505: already ticked (double tap) — that is the state we wanted.
    if (error && error.code !== "23505") return;
  } else {
    await supabase
      .from("action_completions")
      .delete()
      .eq("user_id", user.id)
      .eq("action_date", date)
      .eq("action_key", key);
  }
  revalidatePath("/today");
}
