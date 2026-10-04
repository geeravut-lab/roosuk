import "server-only";
import { randomUUID } from "node:crypto";
import { getLatestConsent } from "@/lib/consent/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { openFile, parseMasterKey, sealFile } from "./crypto";
import type { KeepMode } from "./types";

/**
 * Kept source files: sealed (AES-256-GCM, key only in the server environment)
 * and uploaded to the private bucket below. Everything here runs with the
 * service role AFTER the caller has established who is asking; the route that
 * serves a file re-checks ownership with the user's own RLS client.
 */
const BUCKET = "user-sources";
const MAX_BYTES = 6 * 1024 * 1024;
export const SOURCE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type SourceMime = (typeof SOURCE_MIMES)[number];
export type SourceKind = "lab" | "food";

const masterKey = () => parseMasterKey(process.env.FILE_ENCRYPTION_KEY);

/** Keeping files needs a valid key: without one the option is not offered, and nothing is ever stored unencrypted. */
export function fileStorageConfigured(): boolean {
  return masterKey() !== null;
}

/** What the scan form should offer: nothing (not configured), a pointer to the consent, or the question itself. */

export async function keepMode(userId: string): Promise<KeepMode> {
  if (!fileStorageConfigured()) return "off";
  return (await canKeepFiles(userId)) ? "available" : "needs_consent";
}

/** Can this user keep a file right now: the server is configured AND they gave the separate photo/file consent. */
export async function canKeepFiles(userId: string): Promise<boolean> {
  if (!fileStorageConfigured()) return false;
  const consent = await getLatestConsent(userId);
  return consent?.items.photos === true;
}

let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const { error } = await createAdminClient().storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES + 1024,
  });
  // "already exists" is the normal case after the first call.
  if (
    error &&
    !/already exists|duplicate|resource already/i.test(error.message)
  )
    throw error;
  bucketReady = true;
}

/** Seal and store; returns the new source_files id, or null if anything failed (nothing is left behind). */
export async function storeSourceFile(input: {
  userId: string;
  kind: SourceKind;
  bytes: Uint8Array;
  mime: SourceMime;
}): Promise<string | null> {
  const key = masterKey();
  if (!key || input.bytes.length < 1 || input.bytes.length > MAX_BYTES)
    return null;
  const id = randomUUID();
  const path = `${input.userId}/${id}.enc`;
  const db = createAdminClient();
  try {
    await ensureBucket();
    const sealed = sealFile(
      key,
      { userId: input.userId, fileId: id, mime: input.mime },
      input.bytes,
    );
    const up = await db.storage.from(BUCKET).upload(path, sealed, {
      contentType: "application/octet-stream",
      upsert: false,
    });
    if (up.error) throw up.error;
    const { error } = await db.from("source_files").insert({
      id,
      user_id: input.userId,
      kind: input.kind,
      mime: input.mime,
      bytes: input.bytes.length,
      object_path: path,
    });
    if (error) {
      await db.storage.from(BUCKET).remove([path]);
      throw error;
    }
    return id;
  } catch (err) {
    console.error("[files] could not store a source file:", err);
    return null;
  }
}

/** Decrypt a file for its owner. null = no such file (or it no longer opens). */
export async function readSourceFile(
  userId: string,
  fileId: string,
): Promise<{ bytes: Buffer; mime: SourceMime } | null> {
  const key = masterKey();
  if (!key) return null;
  const db = createAdminClient();
  const { data: row } = await db
    .from("source_files")
    .select("object_path, mime")
    .eq("id", fileId)
    .eq("user_id", userId)
    .maybeSingle<{ object_path: string; mime: SourceMime }>();
  if (!row || !SOURCE_MIMES.includes(row.mime)) return null;
  const { data: blob, error } = await db.storage
    .from(BUCKET)
    .download(row.object_path);
  if (error || !blob) return null;
  try {
    const bytes = openFile(
      key,
      { userId, fileId, mime: row.mime },
      new Uint8Array(await blob.arrayBuffer()),
    );
    return { bytes, mime: row.mime };
  } catch (err) {
    console.error("[files] a stored file did not open:", fileId, err);
    return null;
  }
}

/** Remove the object, then its row (a failed object delete keeps the row so the sweep retries). */
export async function removeSourceFile(
  userId: string,
  fileId: string | null | undefined,
): Promise<boolean> {
  if (!fileId) return true;
  const db = createAdminClient();
  const { data: row } = await db
    .from("source_files")
    .select("object_path")
    .eq("id", fileId)
    .eq("user_id", userId)
    .maybeSingle<{ object_path: string }>();
  if (!row) return true;
  const rm = await db.storage.from(BUCKET).remove([row.object_path]);
  if (rm.error) {
    console.error("[files] could not remove an object:", rm.error);
    return false;
  }
  const { error } = await db
    .from("source_files")
    .delete()
    .eq("id", fileId)
    .eq("user_id", userId);
  return !error;
}

/** The kept file of a report/meal row, for the delete paths. */
export async function sourceFileOf(
  table: "lab_reports" | "meal_logs",
  id: string,
  userId: string,
): Promise<string | null> {
  const { data } = await createAdminClient()
    .from(table)
    .select("source_file_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle<{ source_file_id: string | null }>();
  return data?.source_file_id ?? null;
}

/** Account deletion: every object under the user's folder, whatever the table says. */
export async function removeAllUserFiles(userId: string): Promise<number> {
  const db = createAdminClient();
  let removed = 0;
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(userId, { limit: 100 });
    if (error || !data?.length) break;
    const paths = data.map((o) => `${userId}/${o.name}`);
    const rm = await db.storage.from(BUCKET).remove(paths);
    if (rm.error) throw rm.error;
    removed += paths.length;
  }
  return removed;
}

/** Files whose report/meal is gone (deleted, or never attached): remove them after a grace period. */
export async function sweepOrphanFiles(now: Date): Promise<number> {
  const db = createAdminClient();
  const cutoff = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const { data: candidates } = await db
    .from("source_files")
    .select("id, user_id")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<{ id: string; user_id: string }[]>();
  if (!candidates?.length) return 0;
  const ids = candidates.map((c) => c.id);
  const [labs, meals] = await Promise.all([
    db
      .from("lab_reports")
      .select("source_file_id")
      .in("source_file_id", ids)
      .returns<{ source_file_id: string }[]>(),
    db
      .from("meal_logs")
      .select("source_file_id")
      .in("source_file_id", ids)
      .returns<{ source_file_id: string }[]>(),
  ]);
  const used = new Set([
    ...(labs.data ?? []).map((r) => r.source_file_id),
    ...(meals.data ?? []).map((r) => r.source_file_id),
  ]);
  let swept = 0;
  for (const c of candidates)
    if (!used.has(c.id) && (await removeSourceFile(c.user_id, c.id))) swept++;
  return swept;
}
