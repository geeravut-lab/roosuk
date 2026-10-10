import "server-only";
import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/health/dates";
import { LIVER_MARKERS, type LiverResult } from "./engine";
import {
  parseStoredAnswers,
  type AlcoholUse,
  type HepB,
  type HepC,
  type LiverAnswers,
  type LiverDefaults,
  type LiverSex,
} from "./questionnaire";
import { parseStoredResult } from "./result";
import { LIVER_LAB_COLUMNS, toPanels, type LiverLabRow } from "./trend";
import type { LabPanel } from "./engine";

/** All reads use the person's own client, so row-level security applies. */

export async function loadLiverLabRows(): Promise<LiverLabRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lab_results")
    .select(LIVER_LAB_COLUMNS)
    .in("marker_key", [...LIVER_MARKERS])
    .not("value_std", "is", null)
    .order("collected_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000)
    .returns<LiverLabRow[]>();
  return data ?? [];
}

export async function loadLiverPanels(): Promise<LabPanel[]> {
  return toPanels(await loadLiverLabRows());
}

export interface HepatitisRow {
  hep_b: HepB;
  hep_c: HepC;
  hep_b_tested_on: string | null;
  hep_c_tested_on: string | null;
}

export async function loadHepatitis(): Promise<HepatitisRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("liver_hepatitis_status")
    .select("hep_b, hep_c, hep_b_tested_on, hep_c_tested_on")
    .maybeSingle<HepatitisRow>();
  return data ?? null;
}

/** What the health profile and the last hepatitis note already tell us. */
export async function loadLiverDefaults(): Promise<LiverDefaults> {
  const supabase = await createClient();
  const [{ data: p }, hep] = await Promise.all([
    supabase
      .from("health_profiles")
      .select("birth_year, sex, alcohol, conditions")
      .maybeSingle<{
        birth_year: number | null;
        sex: string | null;
        alcohol: string | null;
        conditions: string[];
      }>(),
    loadHepatitis(),
  ]);
  const sex: LiverSex | null =
    p?.sex === "female" || p?.sex === "male" ? p.sex : null;
  return {
    birthYear: p?.birth_year ?? null,
    sex,
    alcohol: (p?.alcohol as AlcoholUse | null) ?? null,
    conditions: p?.conditions ?? [],
    hepB: hep?.hep_b ?? "unknown",
    hepC: hep?.hep_c ?? "unknown",
  };
}

export interface StoredAssessment {
  id: string;
  created_at: string;
  /** Bangkok calendar day of created_at */
  created_on: string;
  result: LiverResult;
  answers: LiverAnswers | null;
}

const COLUMNS = "id, created_at, result, answers";
type Raw = {
  id: string;
  created_at: string;
  result: unknown;
  answers: unknown;
};

function parseRow(r: Raw): StoredAssessment | null {
  const result = parseStoredResult(r.result);
  if (!result) return null;
  return {
    id: r.id,
    created_at: r.created_at,
    created_on: bangkokDate(new Date(r.created_at)),
    result,
    answers: parseStoredAnswers(r.answers),
  };
}

export async function loadAssessment(
  id: string,
): Promise<StoredAssessment | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("liver_assessments")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle<Raw>();
  return data ? parseRow(data) : null;
}

/** Newest first. */
export async function loadAssessments(limit = 20): Promise<StoredAssessment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("liver_assessments")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Raw[]>();
  return (data ?? []).flatMap((r) => {
    const a = parseRow(r);
    return a ? [a] : [];
  });
}
