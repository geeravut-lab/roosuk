/**
 * Where user data is stored. The single source of truth for every place the UI
 * or policy mentions it (docs/PDPA-RIGHTS-SECTION-KNOWLEDGE.md §3) — if the
 * Supabase region ever changes, change it here only.
 * Must match the Supabase project region (Singapore = AWS ap-southeast-1).
 */
export const DATA_REGION = {
  id: "ap-southeast-1",
  provider: "Supabase (AWS)",
  countryTh: "สิงคโปร์",
  countryEn: "Singapore",
} as const;
