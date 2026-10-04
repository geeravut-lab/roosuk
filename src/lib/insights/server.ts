import "server-only";
import { addDays } from "@/lib/health/dates";
import { ensureCatalog } from "@/lib/lab/catalog.server";
import { createClient } from "@/lib/supabase/server";
import type { CheckinRow } from "@/lib/health/checkin";
import { detectInsights, type Insight, type LabResultRow } from "./anomaly";
import type { InsightNote } from "./explain";

/** The person's current insights, from their own rows (their client, so RLS applies). */
export async function loadInsights(
  today: string,
  checkins: CheckinRow[],
): Promise<Insight[]> {
  await ensureCatalog();
  const supabase = await createClient();
  const { data } = await supabase
    .from("lab_results")
    .select("marker_key, status, collected_on, report_id")
    .not("marker_key", "is", null)
    .gte("collected_on", addDays(today, -400))
    .order("collected_on", { ascending: false })
    .limit(400)
    .returns<LabResultRow[]>();
  return detectInsights({ today, checkins, labs: data ?? [] });
}

export async function loadInsightNote(
  insight: Pick<Insight, "kind" | "anchor">,
): Promise<InsightNote | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("insight_notes")
    .select("summary, steps")
    .eq("kind", insight.kind)
    .eq("anchor", insight.anchor)
    .maybeSingle<{ summary: string; steps: unknown }>();
  if (!data) return null;
  return {
    summary: data.summary,
    steps: Array.isArray(data.steps)
      ? data.steps.filter((s): s is string => typeof s === "string")
      : [],
  };
}
