import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A live test that files a payment or a callback request notifies EVERY admin —
 * including the real owner accounts in the shared project. These notices are
 * test artefacts, so a spec removes what it caused (and any LINE message still
 * waiting to go out for an admin) when it finishes.
 */
export async function removeAdminNoticesSince(
  d: SupabaseClient,
  sinceIso: string,
): Promise<void> {
  await d
    .from("app_notifications")
    .delete()
    .in("kind", ["payment_review", "lead_new"])
    .gte("created_at", sinceIso);
  const admins = (await d.from("admins").select("user_id")).data ?? [];
  if (admins.length)
    await d
      .from("notification_queue")
      .delete()
      .in(
        "user_id",
        admins.map((a) => a.user_id as string),
      )
      .eq("status", "queued")
      .gte("created_at", sinceIso);
}
