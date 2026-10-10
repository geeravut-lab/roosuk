import { describe, expect, it } from "vitest";
import { EkycProviderError } from "./ekyc";
import { IAPP_PATHS, createIappProvider } from "./iapp";

interface Call {
  url: string;
  key: string | null;
  fields: string[];
}

/** A scripted fetch: answers by path, records what was sent. */
function stub(answers: Record<string, { status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const form = init.body as FormData;
    calls.push({
      url,
      key: new Headers(init.headers).get("apikey"),
      fields: [...form.keys()],
    });
    const path = url.replace("https://api.test", "");
    const a = answers[path] ?? { status: 404, body: { error: "nope" } };
    return new Response(JSON.stringify(a.body), { status: a.status });
  }) as unknown as typeof fetch;
  return {
    calls,
    provider: createIappProvider(
      { apiKey: "k-123", baseUrl: "https://api.test" },
      fetchImpl,
    ),
  };
}
const img = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

describe("iApp provider", () => {
  it("liveness: posts `file` with the apikey header and reads probability from normalized.REAL", async () => {
    const { provider, calls } = stub({
      [IAPP_PATHS.liveness]: {
        status: 200,
        body: { predict: "REAL", normalized: { REAL: 0.93 } },
      },
    });
    expect(await provider.liveness(img)).toEqual({ live: true, score: 0.93 });
    expect(calls[0]).toMatchObject({
      url: `https://api.test${IAPP_PATHS.liveness}`,
      key: "k-123",
      fields: ["file"],
    });
  });

  it("liveness: SPOOF is not live; a bare score is turned into the probability of REAL", async () => {
    const spoof = stub({
      [IAPP_PATHS.liveness]: {
        status: 200,
        body: { predict: "SPOOF", score: 0.9 },
      },
    });
    expect(await spoof.provider.liveness(img)).toEqual({
      live: false,
      score: expect.closeTo(0.1, 5),
    });
    const real = stub({
      [IAPP_PATHS.liveness]: {
        status: 200,
        body: { predict: "REAL", score: 0.88 },
      },
    });
    expect(await real.provider.liveness(img)).toEqual({
      live: true,
      score: 0.88,
    });
  });

  it("Thai ID: reads name, number, nationality and detection score", async () => {
    const { provider } = stub({
      [IAPP_PATHS.thaiId]: {
        status: 200,
        body: {
          en_name: "Mr Somchai Jaidee",
          id_number: "1 2345 67890 12 3",
          detection_score: 0.93,
        },
      },
    });
    expect(await provider.ocr("thai_id", img)).toEqual({
      name: "Mr Somchai Jaidee",
      docNumber: "1 2345 67890 12 3",
      nationality: "THA",
      score: 0.93,
    });
  });

  it("passport: tries the paths in order and skips a 404", async () => {
    const { provider, calls } = stub({
      [IAPP_PATHS.passport[1]]: {
        status: 200,
        body: { names: "JOHN DOE", number: "AB123456", nationality: "GBR" },
      },
    });
    const r = await provider.ocr("passport", img);
    expect(r).toMatchObject({
      name: "JOHN DOE",
      docNumber: "AB123456",
      nationality: "GBR",
    });
    expect(calls.map((c) => c.url.replace("https://api.test", ""))).toEqual([
      IAPP_PATHS.passport[0],
      IAPP_PATHS.passport[1],
    ]);
  });

  it("passport: when every path is 404 it is a provider error", async () => {
    const { provider } = stub({});
    await expect(provider.ocr("passport", img)).rejects.toMatchObject({
      code: "upstream",
    });
  });

  it("face match: uses file1 (selfie) and file2 (document) — image1/image2 is an HTTP 420", async () => {
    const { provider, calls } = stub({
      [IAPP_PATHS.faceVerify]: {
        status: 200,
        body: { matched: true, score: 88.1, threshold: 70 },
      },
    });
    expect(await provider.faceMatch(img, img)).toEqual({
      matched: true,
      score: 88.1,
      threshold: 70,
    });
    expect(calls[0].fields).toEqual(["file1", "file2"]);
  });

  it("face match: no `matched` flag falls back to score >= threshold", async () => {
    const hit = stub({
      [IAPP_PATHS.faceVerify]: {
        status: 200,
        body: { score: 80, threshold: 70 },
      },
    });
    expect((await hit.provider.faceMatch(img, img)).matched).toBe(true);
    const miss = stub({
      [IAPP_PATHS.faceVerify]: {
        status: 200,
        body: { score: 60, threshold: 70 },
      },
    });
    expect((await miss.provider.faceMatch(img, img)).matched).toBe(false);
  });

  it("maps provider failures to codes, never to the vendor's text", async () => {
    const cases: [number, unknown, string][] = [
      [420, { error_message: "NO_ID_CARD_FOUND" }, "no_document"],
      [420, { error: "x" }, "bad_image"],
      [429, {}, "rate_limited"],
      [401, {}, "not_configured"],
      [500, { message: "secret vendor text" }, "upstream"],
    ];
    for (const [status, body, code] of cases) {
      const { provider } = stub({ [IAPP_PATHS.thaiId]: { status, body } });
      const err = await provider.ocr("thai_id", img).catch((e) => e);
      expect(err).toBeInstanceOf(EkycProviderError);
      expect(err.code).toBe(code);
      expect(String(err.message)).not.toContain("secret vendor text");
    }
  });

  it("a network failure is an upstream error", async () => {
    const provider = createIappProvider(
      { apiKey: "k", baseUrl: "https://api.test" },
      (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    );
    await expect(provider.liveness(img)).rejects.toMatchObject({
      code: "upstream",
    });
  });
});
