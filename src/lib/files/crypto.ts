import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Encryption of the source files (food photos, lab reports) a user chooses to
 * keep. The point: a leaked storage bucket, database dump or backup is useless
 * on its own. Files are sealed in OUR code before they are uploaded, with a key
 * that lives only in the server environment (`FILE_ENCRYPTION_KEY`), never in
 * Supabase — so reading them needs both the bucket and the key.
 *
 *  - AES-256-GCM (authenticated: a modified or swapped file fails to open).
 *  - One key per file, derived with HKDF from the master key + the owner + the
 *    file id, and the same context is bound as AAD: a file cannot be moved to
 *    another user or another id and still open.
 *  - Layout: "RSF1" | 12-byte IV | ciphertext | 16-byte tag. The 4-byte tag is
 *    a format/version marker so the scheme can change later.
 */
const MAGIC = Buffer.from("RSF1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface FileContext {
  userId: string;
  fileId: string;
  mime: string;
}

/** The master key from its environment form (base64 or hex of 32 bytes), or null when missing/invalid — never a weak fallback. */
export function parseMasterKey(raw: string | undefined | null): Buffer | null {
  const v = raw?.trim();
  if (!v) return null;
  const candidates = [
    /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, "hex") : null,
    /^[A-Za-z0-9+/_-]{43}={0,1}$/.test(v) ? Buffer.from(v, "base64") : null,
  ];
  return candidates.find((b) => b && b.length === 32) ?? null;
}

function fileKey(master: Buffer, ctx: FileContext): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      master,
      Buffer.from("roosuk-source-file-v1"),
      Buffer.from(`${ctx.userId}|${ctx.fileId}`),
      32,
    ),
  );
}

const aad = (ctx: FileContext) =>
  Buffer.from(`${ctx.userId}|${ctx.fileId}|${ctx.mime}`);

export function sealFile(
  master: Buffer,
  ctx: FileContext,
  plain: Uint8Array,
): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", fileKey(master, ctx), iv);
  cipher.setAAD(aad(ctx));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}

/** Throws when the key, owner, id or mime differ from the ones used to seal, or the bytes were altered. */
export function openFile(
  master: Buffer,
  ctx: FileContext,
  sealed: Uint8Array,
): Buffer {
  const buf = Buffer.from(sealed);
  if (
    buf.length < MAGIC.length + IV_BYTES + TAG_BYTES ||
    !buf.subarray(0, MAGIC.length).equals(MAGIC)
  )
    throw new Error("not a sealed file");
  const iv = buf.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const body = buf.subarray(MAGIC.length + IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", fileKey(master, ctx), iv);
  decipher.setAAD(aad(ctx));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** A fresh random master key, in the form to paste into FILE_ENCRYPTION_KEY. */
export function generateMasterKey(): string {
  return randomBytes(32).toString("base64");
}
