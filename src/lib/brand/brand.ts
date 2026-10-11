import type { Dict } from "@/lib/i18n/dict";

/**
 * The app's name and picture, the pure side. The admin can rename the app (Thai and English)
 * and upload a logo and a browser-tab icon; everything not set falls back to RooSuk's own.
 * Stored as one small JSON object in platform_settings.brand.
 */
export const DEFAULT_NAME_TH = "รู้สุข";
export const DEFAULT_NAME_EN = "RooSuk";

export const MAX_NAME_CHARS = 40;
export const MAX_LOGO_BYTES = 1024 * 1024;
export const MAX_FAVICON_BYTES = 512 * 1024;
/** A browser-tab / install icon must be a square PNG within these sides (pixels). */
export const FAVICON_MIN_SIDE = 192;
export const FAVICON_MAX_SIDE = 1024;

export type BrandImageKind = "logo" | "favicon";
export type BrandImageMime = "image/png" | "image/jpeg" | "image/webp";

export interface BrandImageRef {
  mime: BrandImageMime;
  /** changes with every upload: the ETag of the image */
  version: number;
}

export interface Brand {
  nameTh: string;
  nameEn: string;
  logo: BrandImageRef | null;
  favicon: BrandImageRef | null;
}

export const DEFAULT_BRAND: Brand = {
  nameTh: DEFAULT_NAME_TH,
  nameEn: DEFAULT_NAME_EN,
  logo: null,
  favicon: null,
};

const MIMES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

/** A name the admin may set: 1–40 characters, one line, no angle brackets or control characters. */
export function validBrandName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (v.length < 1 || v.length > MAX_NAME_CHARS) return null;
  if (/[<>\u0000-\u001f\u007f]/.test(v)) return null;
  return v;
}

function parseRef(raw: unknown): BrandImageRef | null {
  if (!raw || typeof raw !== "object") return null;
  const { mime, version } = raw as Record<string, unknown>;
  if (typeof mime !== "string" || !MIMES.includes(mime)) return null;
  if (typeof version !== "number" || !Number.isFinite(version) || version <= 0)
    return null;
  return { mime: mime as BrandImageMime, version: Math.floor(version) };
}

/** Tolerant: anything missing or malformed becomes the default, so a bad row never breaks a page. */
export function parseBrand(raw: unknown): Brand {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    nameTh: validBrandName(o.name_th) ?? DEFAULT_NAME_TH,
    nameEn: validBrandName(o.name_en) ?? DEFAULT_NAME_EN,
    logo: parseRef(o.logo),
    favicon: parseRef(o.favicon),
  };
}

/** What is written to platform_settings.brand (only what differs from the defaults). */
export function brandToColumn(b: Brand): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (b.nameTh !== DEFAULT_NAME_TH) out.name_th = b.nameTh;
  if (b.nameEn !== DEFAULT_NAME_EN) out.name_en = b.nameEn;
  if (b.logo) out.logo = b.logo;
  if (b.favicon) out.favicon = b.favicon;
  return out;
}

export function isDefaultNames(b: Brand): boolean {
  return b.nameTh === DEFAULT_NAME_TH && b.nameEn === DEFAULT_NAME_EN;
}

const NAME_PATTERN = new RegExp(`${DEFAULT_NAME_TH}|${DEFAULT_NAME_EN}`, "g");

/**
 * The dictionary with the app's name swapped in. Every place the text says the default Thai
 * name gets the admin's Thai name and every default English name gets the English one — in
 * ONE pass, so a new name that happens to contain the old one is not replaced twice.
 */
export function applyBrandNames(d: Dict, b: Brand): Dict {
  if (isDefaultNames(b)) return d;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d))
    out[k] =
      typeof v === "string"
        ? v.replace(NAME_PATTERN, (m) =>
            m === DEFAULT_NAME_TH ? b.nameTh : b.nameEn,
          )
        : v;
  return out as unknown as Dict;
}

/** Width and height of a PNG from its header, or null when the bytes are not a PNG. */
export function pngSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 0x49484452) return null; // "IHDR"
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export type FaviconCheck = "ok" | "type" | "square" | "small" | "large";

/** The tab icon must be a PNG, square, 192–1024 px: it is also the install icon on phones. */
export function checkFavicon(bytes: Uint8Array): FaviconCheck {
  const size = pngSize(bytes);
  if (!size) return "type";
  if (size.width !== size.height) return "square";
  if (size.width < FAVICON_MIN_SIDE) return "small";
  if (size.width > FAVICON_MAX_SIDE) return "large";
  return "ok";
}
