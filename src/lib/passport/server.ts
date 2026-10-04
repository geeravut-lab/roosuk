import "server-only";
import {
  CHECKIN_WINDOW_DAYS,
  type Section,
  type SnapshotInput,
} from "./passport";
import { CHECKIN_COLUMNS, type CheckinRow } from "@/lib/health/checkin";
import { addDays } from "@/lib/health/dates";
import { PROFILE_COLUMNS } from "@/lib/profile/profile";
import { createClient } from "@/lib/supabase/server";
import { loadWearableDays } from "@/lib/wearables/server";

/** Reads the person's own rows (their client, so RLS applies) for the sections they ticked — and nothing for the others. */
export async function loadSnapshotInput(
  sections: readonly Section[],
  today: string,
): Promise<SnapshotInput> {
  const supabase = await createClient();
  const want = new Set(sections);
  const [profile, labs, checkins, documents, wearableDays] = await Promise.all([
    want.has("profile")
      ? supabase
          .from("health_profiles")
          .select(PROFILE_COLUMNS)
          .maybeSingle<NonNullable<SnapshotInput["profile"]>>()
      : null,
    want.has("labs")
      ? supabase
          .from("lab_results")
          .select("name, marker_key, value, unit, status, collected_on")
          .order("collected_on", { ascending: false })
          .limit(300)
          .returns<SnapshotInput["labs"]>()
      : null,
    want.has("checkins")
      ? supabase
          .from("daily_checkins")
          .select(CHECKIN_COLUMNS)
          .gte("checkin_date", addDays(today, -(CHECKIN_WINDOW_DAYS - 1)))
          .limit(100)
          .returns<CheckinRow[]>()
      : null,
    want.has("documents")
      ? supabase
          .from("source_files")
          .select("title, category, doc_date")
          .eq("kind", "doc")
          .order("created_at", { ascending: false })
          .limit(30)
          .returns<SnapshotInput["documents"]>()
      : null,
    want.has("wearables") ? loadWearableDays(today, CHECKIN_WINDOW_DAYS) : [],
  ]);
  return {
    today,
    sections,
    profile: profile?.data ?? null,
    labs: labs?.data ?? [],
    checkins: checkins?.data ?? [],
    documents: documents?.data ?? [],
    wearableDays,
  };
}
