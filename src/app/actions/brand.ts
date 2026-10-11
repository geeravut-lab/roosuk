"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/server";
import {
  MAX_FAVICON_BYTES,
  MAX_LOGO_BYTES,
  checkFavicon,
  validBrandName,
  type BrandImageKind,
  type FaviconCheck,
} from "@/lib/brand/brand";
import {
  removeBrandImage,
  saveBrandImage,
  saveBrandNames,
} from "@/lib/brand/server";
import { sniffImageType } from "@/lib/food/food";
import type { ErrorKey } from "@/lib/i18n/dict";

export interface BrandState {
  error?: ErrorKey;
  saved?: boolean;
}

const FAVICON_ERROR: Record<Exclude<FaviconCheck, "ok">, ErrorKey> = {
  type: "err_brand_favicon_type",
  square: "err_brand_favicon_square",
  small: "err_brand_favicon_small",
  large: "err_brand_favicon_large",
};

function file(formData: FormData, name: string): File | null {
  const f = formData.get(name);
  return f instanceof File && f.size > 0 ? f : null;
}

/**
 * Admin-only: the names, and — when a file is chosen — a new logo / tab icon. The type is
 * decided by the bytes (not the browser's claim), the size by the limits; nothing is changed
 * unless EVERYTHING in the form is acceptable.
 */
export async function saveBrandAction(
  _prev: BrandState,
  formData: FormData,
): Promise<BrandState> {
  const admin = await requireAdmin();
  const nameTh = validBrandName(formData.get("name_th"));
  const nameEn = validBrandName(formData.get("name_en"));
  if (!nameTh || !nameEn) return { error: "err_brand_name" };

  const logo = file(formData, "logo");
  const favicon = file(formData, "favicon");
  let logoBytes: Uint8Array | null = null;
  let logoMime: ReturnType<typeof sniffImageType> = null;
  let faviconBytes: Uint8Array | null = null;
  if (logo) {
    if (logo.size > MAX_LOGO_BYTES) return { error: "err_brand_logo_big" };
    logoBytes = new Uint8Array(await logo.arrayBuffer());
    logoMime = sniffImageType(logoBytes);
    if (!logoMime) return { error: "err_brand_logo_type" };
  }
  if (favicon) {
    if (favicon.size > MAX_FAVICON_BYTES)
      return { error: "err_brand_favicon_big" };
    faviconBytes = new Uint8Array(await favicon.arrayBuffer());
    const check = checkFavicon(faviconBytes);
    if (check !== "ok") return { error: FAVICON_ERROR[check] };
  }

  if (!(await saveBrandNames(admin.id, nameTh, nameEn)))
    return { error: "err_save_failed" };
  if (logoBytes && logoMime)
    if (!(await saveBrandImage(admin.id, "logo", logoBytes, logoMime)))
      return { error: "err_save_failed" };
  if (faviconBytes)
    if (!(await saveBrandImage(admin.id, "favicon", faviconBytes, "image/png")))
      return { error: "err_save_failed" };
  revalidatePath("/", "layout");
  return { saved: true };
}

/** Admin-only: put the built-in logo or tab icon back. */
export async function removeBrandImageAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  const kind: BrandImageKind =
    formData.get("kind") === "favicon" ? "favicon" : "logo";
  await removeBrandImage(admin.id, kind);
  revalidatePath("/", "layout");
}
