import { describe, expect, it } from "vitest";
import { dict } from "@/lib/i18n/dict";
import {
  DEFAULT_BRAND,
  applyBrandNames,
  brandToColumn,
  checkFavicon,
  parseBrand,
  pngSize,
  validBrandName,
} from "./brand";

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

describe("validBrandName", () => {
  it("trims, collapses spaces and accepts Thai and English", () => {
    expect(validBrandName("  สุข   ดี ")).toBe("สุข ดี");
    expect(validBrandName("Well Done")).toBe("Well Done");
  });
  it("rejects empty, long, markup and control characters", () => {
    expect(validBrandName("")).toBeNull();
    expect(validBrandName("   ")).toBeNull();
    expect(validBrandName("x".repeat(41))).toBeNull();
    expect(validBrandName("<b>x</b>")).toBeNull();
    expect(validBrandName("a\u0000b")).toBeNull();
    expect(validBrandName(42)).toBeNull();
  });
});

describe("parseBrand / brandToColumn", () => {
  it("falls back to the defaults for anything malformed", () => {
    expect(parseBrand(null)).toEqual(DEFAULT_BRAND);
    expect(parseBrand([])).toEqual(DEFAULT_BRAND);
    expect(
      parseBrand({ name_th: "<x>", logo: { mime: "image/gif", version: 1 } }),
    ).toEqual(DEFAULT_BRAND);
  });
  it("round-trips and stores only the differences", () => {
    const b = parseBrand({
      name_en: "Vita",
      logo: { mime: "image/png", version: 5 },
    });
    expect(b.nameEn).toBe("Vita");
    expect(b.nameTh).toBe(DEFAULT_BRAND.nameTh);
    expect(brandToColumn(b)).toEqual({
      name_en: "Vita",
      logo: { mime: "image/png", version: 5 },
    });
    expect(brandToColumn(DEFAULT_BRAND)).toEqual({});
  });
});

describe("applyBrandNames", () => {
  it("returns the same object when the names are the defaults", () => {
    expect(applyBrandNames(dict.th, DEFAULT_BRAND)).toBe(dict.th);
  });
  it("swaps the name everywhere, once, in both languages", () => {
    const b = { ...DEFAULT_BRAND, nameTh: "วีต้า", nameEn: "Vita" };
    const th = applyBrandNames(dict.th, b);
    const en = applyBrandNames(dict.en, b);
    expect(th.appName).toBe("วีต้า");
    expect(en.appName).toBe("Vita");
    for (const d of [th, en])
      for (const v of Object.values(d))
        expect(String(v)).not.toMatch(/รู้สุข|RooSuk/);
  });
  it("does not replace twice when the new name contains the old one", () => {
    const b = { ...DEFAULT_BRAND, nameEn: "RooSuk Plus" };
    expect(applyBrandNames(dict.en, b).appName).toBe("RooSuk Plus");
  });
});

describe("tab icon checks", () => {
  it("reads PNG sizes", () => {
    expect(pngSize(png(512, 512))).toEqual({ width: 512, height: 512 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it("accepts a square PNG of 192–1024 px only", () => {
    expect(checkFavicon(png(512, 512))).toBe("ok");
    expect(checkFavicon(png(512, 256))).toBe("square");
    expect(checkFavicon(png(64, 64))).toBe("small");
    expect(checkFavicon(png(2048, 2048))).toBe("large");
    expect(checkFavicon(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("type");
  });
});
