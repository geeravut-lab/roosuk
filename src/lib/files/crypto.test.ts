import { describe, expect, it } from "vitest";
import {
  generateMasterKey,
  openFile,
  parseMasterKey,
  sealFile,
} from "./crypto";

const key = parseMasterKey(generateMasterKey())!;
const ctx = {
  userId: "11111111-1111-4111-8111-111111111111",
  fileId: "22222222-2222-4222-8222-222222222222",
  mime: "image/jpeg",
};
const plain = Buffer.from("JFIF-pretend-photo-of-pad-thai ".repeat(50));

describe("source file encryption", () => {
  it("round-trips and the sealed bytes do not contain the plaintext", () => {
    const sealed = sealFile(key, ctx, plain);
    expect(openFile(key, ctx, sealed).equals(plain)).toBe(true);
    expect(sealed.includes("pretend-photo")).toBe(false);
    expect(sealed.length).toBe(plain.length + 4 + 12 + 16);
  });
  it("uses a fresh IV every time", () => {
    expect(sealFile(key, ctx, plain).equals(sealFile(key, ctx, plain))).toBe(
      false,
    );
  });
  it("does not open with another key, owner, file id or mime", () => {
    const sealed = sealFile(key, ctx, plain);
    const other = parseMasterKey(generateMasterKey())!;
    expect(() => openFile(other, ctx, sealed)).toThrow();
    expect(() =>
      openFile(
        key,
        { ...ctx, userId: "33333333-3333-4333-8333-333333333333" },
        sealed,
      ),
    ).toThrow();
    expect(() =>
      openFile(
        key,
        { ...ctx, fileId: "44444444-4444-4444-8444-444444444444" },
        sealed,
      ),
    ).toThrow();
    expect(() =>
      openFile(key, { ...ctx, mime: "application/pdf" }, sealed),
    ).toThrow();
  });
  it("detects any altered, truncated or foreign bytes", () => {
    const sealed = sealFile(key, ctx, plain);
    for (const i of [0, 5, 20, sealed.length - 1]) {
      const bad = Buffer.from(sealed);
      bad[i] ^= 1;
      expect(() => openFile(key, ctx, bad), `byte ${i}`).toThrow();
    }
    expect(() => openFile(key, ctx, sealed.subarray(0, 30))).toThrow();
    expect(() => openFile(key, ctx, plain)).toThrow();
  });
  it("seals an empty-ish and a large file", () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 7);
    expect(openFile(key, ctx, sealFile(key, ctx, big)).equals(big)).toBe(true);
    expect(openFile(key, ctx, sealFile(key, ctx, Buffer.alloc(1))).length).toBe(
      1,
    );
  });
});

describe("parseMasterKey", () => {
  it("accepts 32 bytes as base64 or hex and nothing else", () => {
    const b64 = generateMasterKey();
    expect(parseMasterKey(b64)).toHaveLength(32);
    expect(parseMasterKey(` ${b64}\n`)).toHaveLength(32);
    expect(parseMasterKey("ab".repeat(32))).toHaveLength(32);
    for (const bad of [
      undefined,
      null,
      "",
      "short",
      "a".repeat(63),
      "password-password-password-password-12",
      Buffer.alloc(16).toString("base64"),
      Buffer.alloc(48, 255).toString("base64"),
    ])
      expect(parseMasterKey(bad as string), String(bad)).toBeNull();
  });
});
