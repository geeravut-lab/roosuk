import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ConsentRecordLike } from "./consent";

export interface StoredConsent extends ConsentRecordLike {
  accepted_at: string;
}

/** Latest consent record of the signed-in user (RLS limits the query to their own rows). */
export const getLatestConsent = cache(
  async (userId: string): Promise<StoredConsent | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("consent_records")
      .select("policy_version, items, accepted_at")
      .eq("user_id", userId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle<StoredConsent>();
    return data ?? null;
  },
);
