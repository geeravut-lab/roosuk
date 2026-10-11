import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  brandToColumn,
  type Brand,
  type BrandImageKind,
  type BrandImageMime,
} from "./brand";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";

const BUCKET = "brand-assets";
const EXT: Record<BrandImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function loadBrand(): Promise<Brand> {
  return (await loadPlatformSettings()).brand;
}

let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const { error } = await createAdminClient().storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 1024 * 1024 + 1024,
  });
  if (
    error &&
    !/already exists|duplicate|resource already/i.test(error.message)
  )
    throw error;
  bucketReady = true;
}

const pathOf = (kind: BrandImageKind, mime: BrandImageMime, version: number) =>
  `${kind}-${version}.${EXT[mime]}`;

/** The bytes of the admin's logo / tab icon, or null when none is set (or storage fails). */
export async function readBrandImage(kind: BrandImageKind): Promise<{
  bytes: Uint8Array;
  mime: BrandImageMime;
  version: number;
} | null> {
  const ref = (await loadBrand())[kind];
  if (!ref) return null;
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .download(pathOf(kind, ref.mime, ref.version));
  if (error || !data) {
    console.error("[brand] download failed:", error?.message);
    return null;
  }
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    mime: ref.mime,
    version: ref.version,
  };
}

async function writeColumn(brand: Brand, adminId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .update({
      brand: brandToColumn(brand),
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  // An UPDATE that matches no row is "success" to PostgREST — count the rows.
  if (error || data?.length !== 1) return false;
  invalidatePlatformSettingsCache();
  return true;
}

/** Saves the names (and keeps the pictures). */
export async function saveBrandNames(
  adminId: string,
  nameTh: string,
  nameEn: string,
): Promise<boolean> {
  invalidatePlatformSettingsCache();
  const cur = await loadBrand();
  return writeColumn({ ...cur, nameTh, nameEn }, adminId);
}

/** Stores a new logo / tab icon, then points the settings at it; the previous file is removed after. */
export async function saveBrandImage(
  adminId: string,
  kind: BrandImageKind,
  bytes: Uint8Array,
  mime: BrandImageMime,
): Promise<boolean> {
  invalidatePlatformSettingsCache();
  const cur = await loadBrand();
  const version = Date.now();
  await ensureBucket();
  const db = createAdminClient();
  const path = pathOf(kind, mime, version);
  const up = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    console.error("[brand] upload failed:", up.error.message);
    return false;
  }
  if (!(await writeColumn({ ...cur, [kind]: { mime, version } }, adminId))) {
    await db.storage.from(BUCKET).remove([path]);
    return false;
  }
  const old = cur[kind];
  if (old)
    await db.storage.from(BUCKET).remove([pathOf(kind, old.mime, old.version)]);
  return true;
}

/** Back to the built-in picture. */
export async function removeBrandImage(
  adminId: string,
  kind: BrandImageKind,
): Promise<boolean> {
  invalidatePlatformSettingsCache();
  const cur = await loadBrand();
  const old = cur[kind];
  if (!old) return true;
  if (!(await writeColumn({ ...cur, [kind]: null }, adminId))) return false;
  await createAdminClient()
    .storage.from(BUCKET)
    .remove([pathOf(kind, old.mime, old.version)]);
  return true;
}
