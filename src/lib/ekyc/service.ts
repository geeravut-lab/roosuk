import type { ErrorKey } from "@/lib/i18n/dict";
import {
  EkycProviderError,
  checkImage,
  decide,
  docAllowed,
  ekycConfigured,
  maskDocNumber,
  needsSelfie,
  providerErrorKey,
  type Decision,
  type DocType,
  type EkycProvider,
  type EkycSettings,
  type FailReason,
  type FaceResult,
  type LivenessResult,
  type OcrResult,
} from "./ekyc";

/** What gets stored: masked facts and scores. There is no field for a picture. */
export interface NewVerification {
  userId: string;
  docType: DocType;
  status: "passed" | "review";
  docName: string;
  docNumberMasked: string;
  nationality: string;
  livenessScore: number | null;
  ocrScore: number | null;
  faceScore: number | null;
  faceThreshold: number | null;
  steps: Decision["steps"];
  reasons: FailReason[];
  provider: string;
}

export interface KycStore {
  beginAttempt(
    userId: string,
    max: number,
  ): Promise<"ok" | "verified" | "pending" | "limit" | "error">;
  save(row: NewVerification): Promise<boolean>;
}

export type VerifyOutcome =
  | { kind: "passed" }
  | { kind: "review"; reasons: FailReason[] }
  | { kind: "error"; error: ErrorKey };

export interface VerifyInput {
  userId: string;
  settings: EkycSettings;
  /** null when the provider key is not configured */
  provider: EkycProvider | null;
  docType: unknown;
  consent: boolean;
  selfie: Uint8Array | null;
  document: Uint8Array | null;
}

/**
 * Check a person's identity. The order is fixed and each step can only make the
 * result worse: switches → input → attempt (limit, never twice) → provider → decision → record.
 * A pass is written only by this function, and only after every step the admin
 * switched on has passed; a failure goes to the admin's review queue, it is never
 * a permanent refusal by itself.
 */
export async function verifyIdentity(
  input: VerifyInput,
  store: KycStore,
): Promise<VerifyOutcome> {
  const { settings: s, provider } = input;
  const err = (error: ErrorKey): VerifyOutcome => ({ kind: "error", error });

  if (!ekycConfigured(s) || !provider) return err("err_kyc_unavailable");
  if (!input.consent) return err("err_kyc_consent");
  const doc = input.docType;
  if (doc !== "thai_id" && doc !== "passport") return err("err_kyc_doc_type");
  if (!docAllowed(s, doc)) return err("err_kyc_doc_type");

  const docCheck = checkImage(input.document);
  if (!docCheck.ok) return err(docCheck.error);
  let selfie: Uint8Array | null = null;
  if (needsSelfie(s)) {
    const selfieCheck = checkImage(input.selfie);
    if (!selfieCheck.ok) return err(selfieCheck.error);
    selfie = input.selfie;
  }

  const began = await store.beginAttempt(input.userId, s.maxAttemptsPerDay);
  if (began === "verified") return err("err_kyc_already");
  if (began === "pending") return err("err_kyc_pending");
  if (began === "limit") return err("err_kyc_limit");
  if (began !== "ok") return err("err_save_failed");

  let liveness: LivenessResult | undefined;
  let ocr: OcrResult;
  let face: FaceResult | undefined;
  try {
    if (s.liveness && selfie) liveness = await provider.liveness(selfie);
    ocr = await provider.ocr(doc, input.document as Uint8Array);
    if (s.faceMatch && selfie)
      face = await provider.faceMatch(selfie, input.document as Uint8Array);
  } catch (e) {
    // the attempt is spent (the provider may have charged); nothing is recorded as a result
    if (e instanceof EkycProviderError) return err(providerErrorKey(e.code));
    console.error("[ekyc] provider call failed:", e);
    return err("err_kyc_provider");
  }

  const d = decide(s, { liveness, ocr, face });
  const saved = await store.save({
    userId: input.userId,
    docType: doc,
    status: d.pass ? "passed" : "review",
    docName: ocr.name.slice(0, 120),
    docNumberMasked: maskDocNumber(ocr.docNumber),
    nationality: ocr.nationality.slice(0, 40),
    livenessScore: d.scores.liveness,
    ocrScore: d.scores.ocr,
    faceScore: d.scores.face,
    faceThreshold: d.scores.faceThreshold,
    steps: d.steps,
    reasons: d.reasons,
    provider: provider.id,
  });
  if (!saved) return err("err_save_failed");
  return d.pass ? { kind: "passed" } : { kind: "review", reasons: d.reasons };
}
