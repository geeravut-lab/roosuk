import "server-only";
import { addDays } from "@/lib/health/dates";
import type { WearableDay } from "@/lib/passport/passport";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dailySeries, passportDays, type ObsRow } from "./series";
import {
  normalizeBatch,
  type BatchResult,
  type Source,
  type WearableTier,
} from "./types";

/** The person's own observations since `from` (their client: RLS gives only their rows). */
export async function loadObservations(
  from: string,
  types?: readonly string[],
): Promise<ObsRow[]> {
  let q = (await createClient())
    .from("health_observations")
    .select("type, value, start_at, source")
    .gte("start_at", `${from}T00:00:00+07:00`)
    .order("start_at", { ascending: true })
    .limit(20_000);
  if (types) q = q.in("type", types as string[]);
  const { data } = await q.returns<ObsRow[]>();
  return data ?? [];
}

/** Per-day summaries for the last `days` days (what the passport summarises). */
export async function loadWearableDays(
  today: string,
  days: number,
): Promise<WearableDay[]> {
  const rows = await loadObservations(addDays(today, -(days - 1)), [
    "steps",
    "resting_heart_rate",
    "sleep_minutes",
  ]);
  return passportDays(dailySeries(rows));
}

export type IngestOutcome =
  | { ok: true; result: BatchResult }
  | { ok: false; error: "err_wearable_consent" | "err_save_failed" };

/** Stores a batch for someone who has already been identified. The source must hold the person's consent (manual aside). */
export async function ingestObservations(
  userId: string,
  tier: WearableTier,
  source: Source,
  rawRows: readonly unknown[],
): Promise<IngestOutcome> {
  const db = createAdminClient();
  if (source !== "manual") {
    const { data } = await db
      .from("wearable_sources")
      .select("revoked_at")
      .eq("user_id", userId)
      .eq("source", source)
      .maybeSingle<{ revoked_at: string | null }>();
    if (!data || data.revoked_at)
      return { ok: false, error: "err_wearable_consent" };
  }
  const { rows, result } = normalizeBatch(rawRows, source, tier, new Date());
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("health_observations").upsert(
      rows.slice(i, i + 500).map((r) => ({ ...r, user_id: userId })),
      { onConflict: "user_id,source,external_id" },
    );
    if (error) {
      console.error("[wearables] ingest failed:", error.message);
      return { ok: false, error: "err_save_failed" };
    }
  }
  return { ok: true, result };
}
