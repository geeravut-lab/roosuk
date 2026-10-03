import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Service-role client: BYPASSES Row Level Security. Use only in trusted
 * server code, always after you have checked who is asking (requireUser /
 * requireAdmin), and never return its rows to a user without filtering.
 */
export function createAdminClient(): SupabaseClient {
  if (!client) {
    const env = getSupabaseAdminEnv();
    client = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
