import {
  EkycProviderError,
  type EkycProvider,
  type FaceResult,
  type LivenessResult,
  type OcrResult,
  type ProviderErrorCode,
} from "./ekyc";

/**
 * A deterministic stand-in for the provider, for UNIT TESTS ONLY. Production code
 * never imports this file (a test fails if anything outside `*.test.ts` does):
 * identity verification that "succeeds" without a real check would defeat its purpose.
 */
export interface DoubleScript {
  liveness?: LivenessResult | ProviderErrorCode;
  ocr?: OcrResult | ProviderErrorCode;
  face?: FaceResult | ProviderErrorCode;
}

export const PASSING: Required<{
  [K in keyof DoubleScript]: Exclude<
    DoubleScript[K],
    ProviderErrorCode | undefined
  >;
}> = {
  liveness: { live: true, score: 0.97 },
  ocr: {
    name: "SOMCHAI JAIDEE",
    docNumber: "1234567890123",
    nationality: "THA",
    score: 0.93,
  },
  face: { matched: true, score: 87.2, threshold: 70 },
};

export function createDoubleProvider(
  script: DoubleScript = {},
): EkycProvider & {
  calls: string[];
} {
  const calls: string[] = [];
  const pick = <T>(v: T | ProviderErrorCode | undefined, fallback: T): T => {
    if (typeof v === "string")
      throw new EkycProviderError(v as ProviderErrorCode);
    return v ?? fallback;
  };
  return {
    id: "test-double",
    calls,
    async liveness() {
      calls.push("liveness");
      return pick(script.liveness, PASSING.liveness);
    },
    async ocr(doc) {
      calls.push(`ocr:${doc}`);
      return pick(script.ocr, PASSING.ocr);
    },
    async faceMatch() {
      calls.push("face");
      return pick(script.face, PASSING.face);
    },
  };
}
