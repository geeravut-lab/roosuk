import type { Dict } from "@/lib/i18n/dict";
import type { ErrorKey } from "@/lib/i18n/dict";

/** What a vault document can be filed under. The keys are the ones the database allows. */
export const VAULT_CATEGORIES = [
  "lab_paper",
  "prescription",
  "doctor_note",
  "vaccine",
  "imaging",
  "other",
] as const;
export type VaultCategory = (typeof VAULT_CATEGORIES)[number];

export const categoryKey = (c: VaultCategory) => `vaultCat_${c}` as keyof Dict;

export const TITLE_MAX = 80;

export interface VaultMeta {
  title: string;
  category: VaultCategory;
  docDate: string | null;
}

/** A title the person typed: trimmed, one line, no control characters. */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length >= 1 && t.length <= TITLE_MAX ? t : null;
}

export function parseVaultForm(
  get: (name: string) => unknown,
  today: string,
): { ok: true; value: VaultMeta } | { ok: false; error: ErrorKey } {
  const title = cleanTitle(get("title"));
  if (!title) return { ok: false, error: "err_vault_title" };
  const category = get("category");
  if (
    typeof category !== "string" ||
    !(VAULT_CATEGORIES as readonly string[]).includes(category)
  )
    return { ok: false, error: "err_invalid_input" };
  const rawDate = get("docDate");
  let docDate: string | null = null;
  if (typeof rawDate === "string" && rawDate.trim() !== "") {
    const d = rawDate.trim();
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) &&
      new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
    if (!valid || d > today || d < "1990-01-01")
      return { ok: false, error: "err_vault_date" };
    docDate = d;
  }
  return {
    ok: true,
    value: { title, category: category as VaultCategory, docDate },
  };
}

/** True when one more upload would go past the plan's limit. */
export function vaultFull(count: number, max: number | "unlimited"): boolean {
  return max !== "unlimited" && count >= max;
}
