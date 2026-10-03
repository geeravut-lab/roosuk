import { describe, expect, it } from "vitest";
import {
  isValidPromptpayId,
  maskPromptpayId,
  normalizePromptpayId,
  promptpayQrUrl,
} from "./promptpay";

describe("normalizePromptpayId", () => {
  it("keeps digits only", () => {
    expect(normalizePromptpayId("081-234 5678")).toBe("0812345678");
    expect(normalizePromptpayId("1-2345-67890-12-3")).toBe("1234567890123");
  });
  it("turns +66 into a leading 0", () => {
    expect(normalizePromptpayId("+66 81 234 5678")).toBe("0812345678");
  });
});

describe("isValidPromptpayId", () => {
  it("accepts phone, citizen/tax and e-wallet lengths", () => {
    expect(isValidPromptpayId("0812345678")).toBe(true);
    expect(isValidPromptpayId("1234567890123")).toBe(true);
    expect(isValidPromptpayId("123456789012345")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const bad of ["", "12345", "08123abc78", "081234567", "081234567890"])
      expect(isValidPromptpayId(bad)).toBe(false);
  });
});

describe("promptpayQrUrl", () => {
  it("embeds the amount with two decimals", () => {
    expect(promptpayQrUrl("0812345678", 89)).toBe(
      "https://promptpay.io/0812345678/89.00",
    );
  });
  it("returns null without a usable id or amount", () => {
    expect(promptpayQrUrl(null, 89)).toBeNull();
    expect(promptpayQrUrl("123", 89)).toBeNull();
    expect(promptpayQrUrl("0812345678", 0)).toBeNull();
    expect(promptpayQrUrl("0812345678", Number.NaN)).toBeNull();
  });
});

describe("maskPromptpayId", () => {
  it("hides all but the last four digits", () => {
    expect(maskPromptpayId("0812345678")).toBe("••••••5678");
  });
});
