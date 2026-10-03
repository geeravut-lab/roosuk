import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  consentPath,
  isConsentCurrent,
  type ConsentRecordLike,
} from "./consent";

export interface StoredConsent extends ConsentRecordLike {
  accepted_at: string;
}

/** Latest consent record of a user, read with that user's own client (RLS limits it to their rows). */
export async function fetchLatestConsent(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredConsent | null> {
  const { data } = await supabase
    .from("consent_records")
    .select("policy_version, items, accepted_at")
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle<StoredConsent>();
  return data ?? null;
}

/** Same, with one lookup per request for the signed-in user. */
export const getLatestConsent = cache(
  async (userId: string): Promise<StoredConsent | null> =>
    fetchLatestConsent(await createClient(), userId),
);

/**
 * Where to send a user right after signing in: straight to `next` if their
 * consent is current, otherwise to /consent (which then continues to `next`).
 * Deciding here avoids a second redirect from the layout, which after a server
 * action leaves the address bar on the wrong URL.
 */
export async function resolvePostLoginPath(
  supabase: SupabaseClient,
  userId: string,
  next: string,
): Promise<string> {
  const consent = await fetchLatestConsent(supabase, userId);
  return isConsentCurrent(consent) ? next : consentPath(next);
}
