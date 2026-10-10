import type { ErrorKey } from "@/lib/i18n/dict";

/**
 * e-KYC, the pure side: what the admin may set, how a provider's answers become
 * a pass or a fail, and what is allowed to be stored. The SERVER decides — the
 * browser sends pictures and nothing else — and no picture is ever kept.
 */
export const DOC_TYPES = ["thai_id", "passport"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v);
}

export const MAX_EKYC_IMAGE_BYTES = 2 * 1024 * 1024;

export interface EkycSettings {
  enabled: boolean;
  thaiId: boolean;
  passport: boolean;
  liveness: boolean;
  faceMatch: boolean;
  /** 0–1: below this the selfie is not accepted as a live person */
  livenessThreshold: number;
  /** 0–100: 0 = use the provider's own threshold */
  faceThreshold: number;
  maxAttemptsPerDay: number;
}

/** Fail closed: with no readable settings, identity verification is OFF. */
export const DEFAULT_EKYC_SETTINGS: EkycSettings = {
  enabled: false,
  thaiId: true,
  passport: true,
  liveness: true,
  faceMatch: true,
  livenessThreshold: 0.8,
  faceThreshold: 0,
  maxAttemptsPerDay: 5,
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;

/** Tolerant: a column from a migration not applied yet falls back to its default. */
export function parseEkycSettings(
  row: Record<string, unknown> | null | undefined,
): EkycSettings {
  const d = DEFAULT_EKYC_SETTINGS;
  if (!row) return d;
  const clamp = (v: unknown, lo: number, hi: number, fb: number) => {
    const n = num(v);
    return n === null ? fb : Math.min(hi, Math.max(lo, n));
  };
  return {
    enabled: bool(row.enabled, d.enabled),
    thaiId: bool(row.thai_id, d.thaiId),
    passport: bool(row.passport, d.passport),
    liveness: bool(row.liveness, d.liveness),
    faceMatch: bool(row.face_match, d.faceMatch),
    livenessThreshold: clamp(row.liveness_threshold, 0, 1, d.livenessThreshold),
    faceThreshold: clamp(row.face_threshold, 0, 100, d.faceThreshold),
    maxAttemptsPerDay: Math.round(
      clamp(row.max_attempts_per_day, 1, 20, d.maxAttemptsPerDay),
    ),
  };
}

/** The admin form → table columns. A number outside its range is an error, never silently clamped. */
export function parseEkycForm(
  get: (key: string) => unknown,
):
  | { ok: true; columns: Record<string, boolean | number> }
  | { ok: false; field: string } {
  const on = (k: string) => get(k) === "on";
  const live = num(get("livenessThreshold"));
  const face = num(get("faceThreshold"));
  const max = num(get("maxAttemptsPerDay"));
  if (live === null || live < 0 || live > 1) {
    return { ok: false, field: "livenessThreshold" };
  }
  if (face === null || face < 0 || face > 100) {
    return { ok: false, field: "faceThreshold" };
  }
  if (max === null || !Number.isInteger(max) || max < 1 || max > 20) {
    return { ok: false, field: "maxAttemptsPerDay" };
  }
  if (!on("thaiId") && !on("passport") && on("enabled")) {
    return { ok: false, field: "thaiId" };
  }
  return {
    ok: true,
    columns: {
      enabled: on("enabled"),
      thai_id: on("thaiId"),
      passport: on("passport"),
      liveness: on("liveness"),
      face_match: on("faceMatch"),
      liveness_threshold: Math.round(live * 100) / 100,
      face_threshold: Math.round(face * 100) / 100,
      max_attempts_per_day: max,
    },
  };
}

/** Is a document type switched on by the admin? */
export function docAllowed(s: EkycSettings, doc: DocType): boolean {
  return doc === "thai_id" ? s.thaiId : s.passport;
}

/** The picture of the face is needed when liveness or face match is on. */
export function needsSelfie(s: EkycSettings): boolean {
  return s.liveness || s.faceMatch;
}

/** Whether the service can be used at all (the provider key is checked by the caller). */
export function ekycConfigured(s: EkycSettings): boolean {
  return s.enabled && (s.thaiId || s.passport);
}

// ── pictures ────────────────────────────────────────────────────────────────
export type ImageKind = "jpeg" | "png";

/** The type by content (a name or a Content-Type header can say anything). */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";
  return null;
}

export type ImageCheck =
  { ok: true; kind: ImageKind } | { ok: false; error: ErrorKey };

export function checkImage(bytes: Uint8Array | null): ImageCheck {
  if (!bytes || bytes.length === 0)
    return { ok: false, error: "err_kyc_image" };
  if (bytes.length > MAX_EKYC_IMAGE_BYTES)
    return { ok: false, error: "err_kyc_image_large" };
  const kind = sniffImage(bytes);
  return kind ? { ok: true, kind } : { ok: false, error: "err_kyc_image" };
}

/** Keep the last four characters; the rest become dots. */
export function maskDocNumber(raw: string): string {
  const s = raw.replace(/\s+/g, "");
  if (!s) return "";
  const keep = s.length > 4 ? s.slice(-4) : "";
  return "•".repeat(Math.min(s.length - keep.length, 12)) + keep;
}

// ── what the provider says ──────────────────────────────────────────────────
export interface LivenessResult {
  live: boolean;
  /** probability the face is real, 0–1 */
  score: number | null;
}
export interface OcrResult {
  name: string;
  docNumber: string;
  nationality: string;
  score: number | null;
}
export interface FaceResult {
  matched: boolean;
  score: number | null;
  threshold: number | null;
}

/** A provider hides behind this, so the rest of the app never sees a vendor. */
export interface EkycProvider {
  readonly id: string;
  liveness(selfie: Uint8Array): Promise<LivenessResult>;
  ocr(doc: DocType, image: Uint8Array): Promise<OcrResult>;
  faceMatch(selfie: Uint8Array, document: Uint8Array): Promise<FaceResult>;
}

export type ProviderErrorCode =
  | "not_configured"
  | "no_document"
  | "bad_image"
  | "rate_limited"
  | "timeout"
  | "upstream";

export class EkycProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly status?: number,
  ) {
    super(code);
    this.name = "EkycProviderError";
  }
}

export function providerErrorKey(code: ProviderErrorCode): ErrorKey {
  switch (code) {
    case "no_document":
      return "err_kyc_no_document";
    case "bad_image":
      return "err_kyc_image";
    case "not_configured":
      return "err_kyc_unavailable";
    default:
      return "err_kyc_provider";
  }
}

// ── the decision ────────────────────────────────────────────────────────────
export type FailReason = "liveness" | "ocr" | "face_match";

export interface Decision {
  pass: boolean;
  reasons: FailReason[];
  scores: {
    liveness: number | null;
    ocr: number | null;
    face: number | null;
    faceThreshold: number | null;
  };
  steps: Partial<Record<"liveness" | "ocr" | "face_match", boolean>>;
}

/**
 * Pass only when EVERY step the admin switched on passed. A step that is off is
 * skipped, never counted as a pass of something that was not checked.
 */
export function decide(
  s: EkycSettings,
  r: { liveness?: LivenessResult; ocr: OcrResult; face?: FaceResult },
): Decision {
  const reasons: FailReason[] = [];
  const steps: Decision["steps"] = {};
  if (s.liveness) {
    const ok =
      !!r.liveness?.live &&
      (r.liveness.score === null || r.liveness.score >= s.livenessThreshold);
    steps.liveness = ok;
    if (!ok) reasons.push("liveness");
  }
  // reading the document: something must have been read
  const read = !!(r.ocr.docNumber.trim() || r.ocr.name.trim());
  steps.ocr = read;
  if (!read) reasons.push("ocr");
  if (s.faceMatch) {
    const f = r.face;
    const aboveOwn =
      s.faceThreshold <= 0 || (f?.score != null && f.score >= s.faceThreshold);
    const ok = !!f?.matched && aboveOwn;
    steps.face_match = ok;
    if (!ok) reasons.push("face_match");
  }
  return {
    pass: reasons.length === 0,
    reasons,
    scores: {
      liveness: r.liveness?.score ?? null,
      ocr: r.ocr.score,
      face: r.face?.score ?? null,
      faceThreshold: r.face?.threshold ?? null,
    },
    steps,
  };
}
