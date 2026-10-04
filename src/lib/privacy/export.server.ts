import "server-only";
import { OWNED_TABLES } from "@/config/user-data";
import { DATA_REGION } from "@/config/data-region";
import { POLICY_VERSION } from "@/config/legal";
import { isLineSyntheticEmail } from "@/lib/line/login";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPORT_ROW_LIMIT,
  exportFilename,
  omitColumns,
  type ExportManifest,
} from "./privacy";

/**
 * "Download my data" (PDPA sections 30–31): one JSON document with everything the
 * system holds about the user. Built with the service role (some tables are
 * server-written and invisible to the user's own client) but only ever for the
 * user who asked, filtered on their own id. It is returned as a STRING and saved
 * by the browser — no copy is kept on the server — and every export is written to
 * the audit log.
 */
export async function buildExport(
  userId: string,
  notIncluded: readonly string[],
  now = new Date(),
): Promise<{ filename: string; json: string; manifest: ExportManifest }> {
  const db = createAdminClient();
  const tables: Record<string, unknown[]> = {};
  const manifest: ExportManifest = {
    generatedAt: now.toISOString(),
    userId,
    tables: {},
    skipped: {},
    truncated: [],
  };

  for (const t of OWNED_TABLES) {
    const { data, error } = await db
      .from(t.table)
      .select("*")
      .eq(t.column, userId)
      .limit(EXPORT_ROW_LIMIT);
    if (error) {
      manifest.skipped[t.table] = error.message.slice(0, 200);
      continue;
    }
    const rows = (data ?? []).map((r) =>
      omitColumns(r as Record<string, unknown>, t.omit),
    );
    tables[t.table] = rows;
    manifest.tables[t.table] = rows.length;
    if (rows.length >= EXPORT_ROW_LIMIT) manifest.truncated.push(t.table);
  }

  const { data: auth } = await db.auth.admin.getUserById(userId);
  const u = auth.user;
  const document = {
    note: "Everything RooSuk holds about you (PDPA sections 30-31).",
    policyVersion: POLICY_VERSION,
    dataRegion: `${DATA_REGION.provider} · ${DATA_REGION.id}`,
    account: {
      id: userId,
      // LINE accounts get a made-up address; that is not the user's data, so it is not shown as theirs.
      email: u?.email && !isLineSyntheticEmail(u.email) ? u.email : null,
      createdAt: u?.created_at ?? null,
      signInMethods: u?.app_metadata?.providers ?? [],
    },
    notIncluded,
    manifest,
    tables,
  };

  const total = Object.values(manifest.tables).reduce((s, n) => s + n, 0);
  await db.from("privacy_audit_log").insert({
    user_id: userId,
    action: "data_export",
    detail: `exported ${total} rows from ${Object.keys(manifest.tables).length} tables`,
    meta: {
      tables: Object.keys(manifest.tables).length,
      skipped: Object.keys(manifest.skipped).length,
    },
  });

  return {
    filename: exportFilename(now),
    json: JSON.stringify(document, null, 2),
    manifest,
  };
}
