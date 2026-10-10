import "server-only";
import {
  EkycProviderError,
  type DocType,
  type EkycProvider,
  type FaceResult,
  type LivenessResult,
  type OcrResult,
} from "./ekyc";

/**
 * The real provider: iApp Technology's eKYC API (https://api.iapp.co.th).
 * Auth is an `apikey` header, requests are multipart. The key lives in the server
 * environment only. Every call costs credits, which is why the daily attempt
 * limit exists. Endpoint names and field names are the ones the blueprint
 * (docs/SkillConnect_eKYC_Skill.md §2) found by testing against the live API.
 */
export const IAPP_PATHS = {
  liveness: "/v3/store/ekyc/face-passive-liveness",
  thaiId: "/v3/store/ekyc/thai-national-id-card/front",
  // the vendor's documentation disagrees with itself: try them in order, skipping a 404
  passport: [
    "/v3/store/ekyc/passport/v2",
    "/v3/store/ekyc/passport",
    "/v3/store/ekyc/passport/v1",
  ],
  faceVerify: "/v3/store/ekyc/face-verification",
} as const;

const TIMEOUT_MS = 30_000;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};

/** A copy backed by a plain ArrayBuffer (Blob does not accept every typed-array view). */
function toBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy], { type: "image/jpeg" });
}

export function createIappProvider(
  env: { apiKey: string; baseUrl: string },
  fetchImpl: typeof fetch = fetch,
): EkycProvider {
  async function post(
    path: string,
    files: { name: string; bytes: Uint8Array }[],
  ): Promise<{ status: number; json: Json }> {
    const form = new FormData();
    for (const f of files)
      form.append(f.name, toBlob(f.bytes), `${f.name}.jpg`);
    let res: Response;
    try {
      res = await fetchImpl(env.baseUrl + path, {
        method: "POST",
        headers: { apikey: env.apiKey },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut =
        err instanceof Error && /timeout|abort/i.test(err.name + err.message);
      throw new EkycProviderError(timedOut ? "timeout" : "upstream");
    }
    const text = await res.text();
    let json: Json = {};
    try {
      json = obj(JSON.parse(text));
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, json };
  }

  /** Turn a failed call into a coded error. Only the code leaves this file — never the vendor's text. */
  function fail(
    label: string,
    path: string,
    status: number,
    json: Json,
  ): never {
    // a message with the vendor's text is for the server log, not for the user
    console.error(
      `[ekyc] iapp ${label} ${path} -> ${status}`,
      JSON.stringify(json).slice(0, 300),
    );
    const body = JSON.stringify(json);
    if (status === 420 && /NO_ID_CARD_FOUND|NO_PASSPORT|NO_FACE/i.test(body))
      throw new EkycProviderError("no_document", status);
    if (status === 420 || status === 400 || status === 413 || status === 422)
      throw new EkycProviderError("bad_image", status);
    if (status === 429) throw new EkycProviderError("rate_limited", status);
    if (status === 401 || status === 403)
      throw new EkycProviderError("not_configured", status);
    throw new EkycProviderError("upstream", status);
  }

  async function postOk(
    label: string,
    path: string,
    files: { name: string; bytes: Uint8Array }[],
  ): Promise<Json> {
    const r = await post(path, files);
    if (r.status < 200 || r.status >= 300) fail(label, path, r.status, r.json);
    return r.json;
  }

  return {
    id: "iapp",

    async liveness(selfie): Promise<LivenessResult> {
      const r = await postOk("liveness", IAPP_PATHS.liveness, [
        { name: "file", bytes: selfie },
      ]);
      const predictReal = str(r.predict).toUpperCase() === "REAL";
      const score = num(r.score);
      // the vendor answers in more than one shape
      const real =
        num(obj(r.normalized).REAL) ??
        num(obj(r.data).REAL) ??
        (predictReal ? score : score !== null ? 1 - score : null);
      return { live: predictReal, score: real };
    },

    async ocr(doc: DocType, image): Promise<OcrResult> {
      const files = [{ name: "file", bytes: image }];
      let r: Json;
      if (doc === "thai_id") {
        r = await postOk("ocr", IAPP_PATHS.thaiId, files);
      } else {
        let last: { path: string; status: number; json: Json } | null = null;
        let found: Json | null = null;
        for (const path of IAPP_PATHS.passport) {
          const attempt = await post(path, files);
          if (attempt.status === 404) {
            last = { path, ...attempt };
            continue;
          }
          if (attempt.status < 200 || attempt.status >= 300)
            fail("ocr", path, attempt.status, attempt.json);
          found = attempt.json;
          break;
        }
        if (!found) {
          if (last) fail("ocr", last.path, last.status, last.json);
          throw new EkycProviderError("upstream");
        }
        r = found;
      }
      return {
        name: str(r.en_name) || str(r.th_name) || str(r.names) || str(r.name),
        docNumber: str(r.id_number) || str(r.number) || str(r.passport_no),
        nationality: str(r.nationality) || (doc === "thai_id" ? "THA" : ""),
        score: num(r.detection_score),
      };
    },

    async faceMatch(selfie, document): Promise<FaceResult> {
      // the vendor wants file1 / file2 here; image1 / image2 is an HTTP 420
      const r = await postOk("face match", IAPP_PATHS.faceVerify, [
        { name: "file1", bytes: selfie },
        { name: "file2", bytes: document },
      ]);
      const score = num(r.score);
      const threshold = num(r.threshold);
      const matched =
        r.matched === true ||
        (score !== null && threshold !== null && score >= threshold);
      return { matched, score, threshold };
    },
  };
}
