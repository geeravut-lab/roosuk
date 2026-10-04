import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanDetail, type ProductEvent } from "./events";

/**
 * Record a usage event. NEVER throws and never blocks the user's action: a
 * failed write is logged and forgotten. A duplicate of a once-only event
 * ("active" per day, "signup") is the normal case and is ignored quietly.
 * `userId` is null for the public quiz.
 */
export async function trackEvent(
  event: ProductEvent,
  userId: string | null,
  detail?: string,
): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("product_events")
      .insert({ event, user_id: userId, detail: cleanDetail(detail) });
    if (error && error.code !== "23505")
      console.error("[analytics] could not record", event, error.message);
  } catch (err) {
    console.error("[analytics] could not record", event, err);
  }
}
