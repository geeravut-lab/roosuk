import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMasterKey, sealFile } from "../../src/lib/files/crypto";

export const BUCKET = "user-sources";

/** A real 1×1 PNG, so the browser can actually decode what the route serves. */
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
export const PDF_MIN = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

/**
 * Store a sealed file the way src/lib/files/server.ts does (same crypto, same
 * bucket, same row), so specs can seed kept files without an AI call.
 */
export async function putSourceFile(
  d: SupabaseClient,
  userId: string,
  kind: "lab" | "food",
  mime: "image/png" | "application/pdf",
  bytes: Buffer,
  createdAt?: string,
): Promise<{ id: string; path: string }> {
  const key = parseMasterKey(process.env.FILE_ENCRYPTION_KEY);
  if (!key) throw new Error("FILE_ENCRYPTION_KEY is not set for the suite");
  await d.storage.createBucket(BUCKET, { public: false }); // "already exists" is fine
  const id = randomUUID();
  const path = `${userId}/${id}.enc`;
  const up = await d.storage
    .from(BUCKET)
    .upload(path, sealFile(key, { userId, fileId: id, mime }, bytes), {
      contentType: "application/octet-stream",
    });
  if (up.error) throw up.error;
  const ins = await d.from("source_files").insert({
    id,
    user_id: userId,
    kind,
    mime,
    bytes: bytes.length,
    object_path: path,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  if (ins.error) throw ins.error;
  return { id, path };
}

export async function objectExists(
  d: SupabaseClient,
  path: string,
): Promise<boolean> {
  const dir = path.split("/")[0];
  const name = path.split("/")[1];
  const { data } = await d.storage.from(BUCKET).list(dir, { search: name });
  return (data ?? []).some((o) => o.name === name);
}
