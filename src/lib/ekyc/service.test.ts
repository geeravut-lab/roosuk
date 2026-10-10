import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_EKYC_SETTINGS, type EkycSettings } from "./ekyc";
import { verifyIdentity, type KycStore, type NewVerification } from "./service";
import { PASSING, createDoubleProvider } from "./test-double";

const jpeg = (n = 64) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
};
const on: EkycSettings = { ...DEFAULT_EKYC_SETTINGS, enabled: true };

function store(began: Awaited<ReturnType<KycStore["beginAttempt"]>> = "ok") {
  const saved: NewVerification[] = [];
  const s: KycStore & { saved: NewVerification[]; began: number } = {
    saved,
    began: 0,
    async beginAttempt() {
      s.began += 1;
      return began;
    },
    async save(row) {
      saved.push(row);
      return true;
    },
  };
  return s;
}

const input = (over: Partial<Parameters<typeof verifyIdentity>[0]> = {}) => ({
  userId: "u1",
  settings: on,
  provider: createDoubleProvider(),
  docType: "thai_id",
  consent: true,
  selfie: jpeg(),
  document: jpeg(),
  ...over,
});

describe("verifyIdentity", () => {
  it("passes when every step passes, and stores masked facts and scores only", async () => {
    const st = store();
    const out = await verifyIdentity(input(), st);
    expect(out).toEqual({ kind: "passed" });
    expect(st.saved).toHaveLength(1);
    const row = st.saved[0];
    expect(row).toMatchObject({
      userId: "u1",
      status: "passed",
      docNumberMasked: "•••••••••0123",
      docName: "SOMCHAI JAIDEE",
      livenessScore: 0.97,
      faceScore: 87.2,
    });
    // nothing resembling a picture or the whole number is in what is stored
    const json = JSON.stringify(row);
    expect(json).not.toContain("1234567890123");
    expect(
      Object.keys(row).some((k) =>
        /image|photo|selfie|picture|base64/i.test(k),
      ),
    ).toBe(false);
  });

  it("a failed check is sent to the review queue — it is not a refusal", async () => {
    const st = store();
    const provider = createDoubleProvider({
      face: { matched: false, score: 30, threshold: 70 },
    });
    const out = await verifyIdentity(input({ provider }), st);
    expect(out).toEqual({ kind: "review", reasons: ["face_match"] });
    expect(st.saved[0].status).toBe("review");
    expect(st.saved[0].reasons).toEqual(["face_match"]);
  });

  it("is unavailable when switched off, when the key is missing, or when the document type is off — and costs nothing", async () => {
    for (const over of [
      { settings: { ...on, enabled: false } },
      { provider: null },
    ]) {
      const st = store();
      expect(await verifyIdentity(input(over), st)).toEqual({
        kind: "error",
        error: "err_kyc_unavailable",
      });
      expect(st.began).toBe(0);
    }
    const st = store();
    expect(
      await verifyIdentity(
        input({ settings: { ...on, passport: false }, docType: "passport" }),
        st,
      ),
    ).toEqual({ kind: "error", error: "err_kyc_doc_type" });
    expect(st.began).toBe(0);
  });

  it("needs the consent, a known document type and usable pictures — before any attempt is counted", async () => {
    const cases: [Partial<Parameters<typeof verifyIdentity>[0]>, string][] = [
      [{ consent: false }, "err_kyc_consent"],
      [{ docType: "driver" }, "err_kyc_doc_type"],
      [{ document: null }, "err_kyc_image"],
      [{ selfie: null }, "err_kyc_image"],
      [{ document: new Uint8Array([1, 2, 3, 4]) }, "err_kyc_image"],
      [
        { selfie: new Uint8Array(2 * 1024 * 1024 + 1).fill(0xff) },
        "err_kyc_image",
      ],
    ];
    for (const [over, error] of cases) {
      const st = store();
      const provider = createDoubleProvider();
      const out = await verifyIdentity(input({ ...over, provider }), st);
      expect(
        out.kind === "error" && out.error,
        JSON.stringify(Object.keys(over)),
      ).toMatch(new RegExp(`${error}|err_kyc_image_large`));
      expect(st.began).toBe(0);
      expect(provider.calls).toEqual([]);
    }
  });

  it("a selfie is not required when liveness and face match are both off", async () => {
    const st = store();
    const provider = createDoubleProvider();
    const out = await verifyIdentity(
      input({
        settings: { ...on, liveness: false, faceMatch: false },
        selfie: null,
        provider,
      }),
      st,
    );
    expect(out).toEqual({ kind: "passed" });
    expect(provider.calls).toEqual(["ocr:thai_id"]);
  });

  it("never re-verifies, holds while a review is pending, and stops at the daily limit — without calling the provider", async () => {
    for (const [began, error] of [
      ["verified", "err_kyc_already"],
      ["pending", "err_kyc_pending"],
      ["limit", "err_kyc_limit"],
      ["error", "err_save_failed"],
    ] as const) {
      const provider = createDoubleProvider();
      const out = await verifyIdentity(input({ provider }), store(began));
      expect(out).toEqual({ kind: "error", error });
      expect(provider.calls).toEqual([]);
    }
  });

  it("calls the steps in order: liveness, document, face", async () => {
    const provider = createDoubleProvider();
    await verifyIdentity(input({ docType: "passport", provider }), store());
    expect(provider.calls).toEqual(["liveness", "ocr:passport", "face"]);
  });

  it("a provider error is a coded error, nothing is recorded as a result", async () => {
    for (const [code, error] of [
      ["no_document", "err_kyc_no_document"],
      ["bad_image", "err_kyc_image"],
      ["upstream", "err_kyc_provider"],
      ["timeout", "err_kyc_provider"],
      ["rate_limited", "err_kyc_provider"],
      ["not_configured", "err_kyc_unavailable"],
    ] as const) {
      const st = store();
      const provider = createDoubleProvider({ ocr: code });
      expect(await verifyIdentity(input({ provider }), st)).toEqual({
        kind: "error",
        error,
      });
      expect(st.saved).toHaveLength(0);
      expect(st.began).toBe(1); // the attempt was spent
    }
  });

  it("an unreadable document fails the check", async () => {
    const st = store();
    const provider = createDoubleProvider({
      ocr: { ...PASSING.ocr, name: "", docNumber: "" },
    });
    expect(await verifyIdentity(input({ provider }), st)).toEqual({
      kind: "review",
      reasons: ["ocr"],
    });
  });

  it("reports a failed save", async () => {
    const st = store();
    st.save = async () => false;
    expect(await verifyIdentity(input(), st)).toEqual({
      kind: "error",
      error: "err_save_failed",
    });
  });
});

describe("the test double", () => {
  it("is never imported by production code", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (
          /\.(ts|tsx)$/.test(name) &&
          !/\.test\.(ts|tsx)$/.test(name) &&
          !p.endsWith("test-double.ts")
        ) {
          if (/ekyc\/test-double|\.\/test-double/.test(readFileSync(p, "utf8")))
            offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
