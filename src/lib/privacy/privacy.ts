import { CONSENT_ITEMS, REQUIRED_CONSENT_KEYS } from "@/config/legal";
import { OWNED_TABLES } from "@/config/user-data";

/** Typed to confirm deletion — checked in the UI AND again on the server (the UI is not a security boundary). */
export const DELETE_PHRASES = ["ลบบัญชี", "DELETE"] as const;

export function isDeletePhrase(typed: unknown): boolean {
  return (
    typeof typed === "string" &&
    (DELETE_PHRASES as readonly string[]).includes(typed.trim())
  );
}

export interface ExportManifest {
  generatedAt: string;
  userId: string;
  /** Row counts per table. */
  tables: Record<string, number>;
  /** Tables that could not be read, with why — an export must never LOOK complete when it is not. */
  skipped: Record<string, string>;
  /** Tables cut at the row limit. */
  truncated: string[];
}

export const EXPORT_ROW_LIMIT = 50_000;

/** Strip columns that identify other people (e.g. the reviewing admin) from rows going into the user's copy. */
export function omitColumns<T extends Record<string, unknown>>(
  row: T,
  omit: readonly string[] | undefined,
): Record<string, unknown> {
  if (!omit?.length) return row;
  return Object.fromEntries(
    Object.entries(row).filter(([k]) => !omit.includes(k)),
  );
}

export function exportFilename(date: Date): string {
  return `roosuk-my-data-${date.toISOString().slice(0, 10)}.json`;
}

/** What goes into the deletion dialog: counts of what is erased and what is kept (detached). */
export function summariseDeletion(counts: Record<string, number>): {
  erasedRows: number;
  retainedRows: number;
} {
  let erasedRows = 0;
  let retainedRows = 0;
  for (const t of OWNED_TABLES) {
    const n = counts[t.table] ?? 0;
    if (t.onDelete === "erased") erasedRows += n;
    else retainedRows += n;
  }
  return { erasedRows, retainedRows };
}

/**
 * Changing the OPTIONAL consents (photos, marketing) appends a new record: the
 * required items must carry over as they were — they cannot be withdrawn here
 * (withdrawing them means ending the service, i.e. deleting the account) — and
 * only the optional ones follow the form.
 */
export function mergeOptionalConsent(
  latest: Record<string, unknown>,
  formData: FormData,
): { ok: true; items: Record<string, boolean> } | { ok: false } {
  if (!REQUIRED_CONSENT_KEYS.every((k) => latest[k] === true))
    return { ok: false };
  const items: Record<string, boolean> = {};
  for (const item of CONSENT_ITEMS)
    items[item.key] = item.required
      ? true
      : formData.get(`consent_${item.key}`) === "on";
  return { ok: true, items };
}
