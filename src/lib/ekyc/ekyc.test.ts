import { describe, expect, it } from "vitest";
import {
  DEFAULT_EKYC_SETTINGS,
  MAX_EKYC_IMAGE_BYTES,
  checkImage,
  decide,
  maskDocNumber,
  parseEkycForm,
  parseEkycSettings,
  sniffImage,
  type EkycSettings,
} from "./ekyc";
import { PASSING } from "./test-double";

const on: EkycSettings = { ...DEFAULT_EKYC_SETTINGS, enabled: true };

describe("settings", () => {
  it("are OFF when nothing could be read", () => {
    expect(parseEkycSettings(null).enabled).toBe(false);
    expect(parseEkycSettings({}).enabled).toBe(false);
  });
  it("read the table's columns and clamp strays", () => {
    const s = parseEkycSettings({
      enabled: true,
      thai_id: false,
      liveness_threshold: "0.65",
      face_threshold: 500,
      max_attempts_per_day: 0,
    });
    expect(s).toMatchObject({
      enabled: true,
      thaiId: false,
      passport: true,
      livenessThreshold: 0.65,
      faceThreshold: 100,
      maxAttemptsPerDay: 1,
    });
  });
});

describe("the admin form", () => {
  const form = (o: Record<string, unknown>) => (k: string) => o[k];
  const base = {
    enabled: "on",
    thaiId: "on",
    passport: "on",
    liveness: "on",
    faceMatch: "on",
    livenessThreshold: "0.8",
    faceThreshold: "70",
    maxAttemptsPerDay: "5",
  };
  it("becomes table columns", () => {
    const r = parseEkycForm(form(base));
    expect(r).toEqual({
      ok: true,
      columns: {
        enabled: true,
        thai_id: true,
        passport: true,
        liveness: true,
        face_match: true,
        liveness_threshold: 0.8,
        face_threshold: 70,
        max_attempts_per_day: 5,
      },
    });
  });
  it("an unticked box is off", () => {
    const r = parseEkycForm(
      form({ ...base, faceMatch: undefined, liveness: undefined }),
    );
    expect(r.ok && r.columns).toMatchObject({
      face_match: false,
      liveness: false,
    });
  });
  it("rejects numbers out of range instead of clamping them", () => {
    for (const [k, v] of [
      ["livenessThreshold", "1.2"],
      ["livenessThreshold", ""],
      ["faceThreshold", "101"],
      ["maxAttemptsPerDay", "0"],
      ["maxAttemptsPerDay", "2.5"],
    ] as const)
      expect(parseEkycForm(form({ ...base, [k]: v }))).toEqual({
        ok: false,
        field: k,
      });
  });
  it("will not switch it on with no document type allowed", () => {
    expect(
      parseEkycForm(form({ ...base, thaiId: undefined, passport: undefined })),
    ).toEqual({ ok: false, field: "thaiId" });
  });
});

describe("pictures", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  it("are recognised by their content, not their name", () => {
    expect(sniffImage(jpeg)).toBe("jpeg");
    expect(sniffImage(png)).toBe("png");
    expect(sniffImage(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(
      sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")),
    ).toBeNull();
  });
  it("must exist, be an image and stay within 2 MB", () => {
    expect(checkImage(jpeg)).toEqual({ ok: true, kind: "jpeg" });
    expect(checkImage(null)).toEqual({ ok: false, error: "err_kyc_image" });
    expect(checkImage(new Uint8Array(0))).toEqual({
      ok: false,
      error: "err_kyc_image",
    });
    expect(checkImage(new Uint8Array([1, 2, 3, 4]))).toEqual({
      ok: false,
      error: "err_kyc_image",
    });
    const big = new Uint8Array(MAX_EKYC_IMAGE_BYTES + 1);
    big.set(jpeg);
    expect(checkImage(big)).toEqual({
      ok: false,
      error: "err_kyc_image_large",
    });
    const edge = new Uint8Array(MAX_EKYC_IMAGE_BYTES);
    edge.set(jpeg);
    expect(checkImage(edge).ok).toBe(true);
  });
});

describe("maskDocNumber", () => {
  it("keeps the last four characters only", () => {
    expect(maskDocNumber("1234567890123")).toBe("•••••••••0123");
    expect(maskDocNumber("1 2345 67890 12 3")).toBe("•••••••••0123");
    expect(maskDocNumber("AB123456")).toBe("••••3456");
  });
  it("hides a short number completely, and an empty one is empty", () => {
    expect(maskDocNumber("1234")).toBe("••••");
    expect(maskDocNumber("12")).toBe("••");
    expect(maskDocNumber("")).toBe("");
  });
  it("never leaves the full number in the output", () => {
    const raw = "9876543210987";
    expect(maskDocNumber(raw)).not.toContain("98765");
  });
});

describe("decide", () => {
  it("passes only when every step that is on passes", () => {
    const d = decide(on, PASSING);
    expect(d.pass).toBe(true);
    expect(d.reasons).toEqual([]);
    expect(d.steps).toEqual({ liveness: true, ocr: true, face_match: true });
    expect(d.scores).toEqual({
      liveness: 0.97,
      ocr: 0.93,
      face: 87.2,
      faceThreshold: 70,
    });
  });
  it("a spoof, a low liveness score, no face match or an unreadable document each fail", () => {
    expect(
      decide(on, { ...PASSING, liveness: { live: false, score: 0.1 } }).reasons,
    ).toEqual(["liveness"]);
    expect(
      decide(on, { ...PASSING, liveness: { live: true, score: 0.5 } }).reasons,
    ).toEqual(["liveness"]);
    expect(
      decide(on, {
        ...PASSING,
        face: { matched: false, score: 40, threshold: 70 },
      }).reasons,
    ).toEqual(["face_match"]);
    expect(
      decide(on, {
        ...PASSING,
        ocr: { name: "", docNumber: "", nationality: "", score: 0.2 },
      }).reasons,
    ).toEqual(["ocr"]);
    const all = decide(on, {
      liveness: { live: false, score: 0 },
      ocr: { name: "", docNumber: "", nationality: "", score: null },
      face: { matched: false, score: 0, threshold: 70 },
    });
    expect(all.reasons).toEqual(["liveness", "ocr", "face_match"]);
    expect(all.pass).toBe(false);
  });
  it("a missing result for a step that is ON is a failure, not a pass", () => {
    expect(decide(on, { ocr: PASSING.ocr, face: PASSING.face }).pass).toBe(
      false,
    );
    expect(
      decide(on, { ocr: PASSING.ocr, liveness: PASSING.liveness }).pass,
    ).toBe(false);
  });
  it("a step switched off is skipped", () => {
    const s = { ...on, liveness: false, faceMatch: false };
    const d = decide(s, { ocr: PASSING.ocr });
    expect(d.pass).toBe(true);
    expect(d.steps).toEqual({ ocr: true });
  });
  it("the admin's face threshold can be stricter than the provider's", () => {
    const strict = { ...on, faceThreshold: 90 };
    expect(decide(strict, PASSING).reasons).toEqual(["face_match"]); // 87.2 < 90
    expect(decide({ ...on, faceThreshold: 85 }, PASSING).pass).toBe(true);
    // no score at all cannot satisfy a threshold
    expect(
      decide(strict, {
        ...PASSING,
        face: { matched: true, score: null, threshold: null },
      }).pass,
    ).toBe(false);
  });
  it("a liveness score of null is judged by the provider's verdict alone", () => {
    expect(
      decide(on, { ...PASSING, liveness: { live: true, score: null } }).pass,
    ).toBe(true);
  });
});
