import { describe, expect, it } from "vitest";
import {
  barcodeMealItem,
  gtinCheckDigitOk,
  parseBarcode,
  parseOffProduct,
} from "./barcode";

describe("check digit", () => {
  it("accepts real GS1 numbers of each length", () => {
    expect(gtinCheckDigitOk("4006381333931")).toBe(true); // EAN-13
    expect(gtinCheckDigitOk("036000291452")).toBe(true); // UPC-A
    expect(gtinCheckDigitOk("96385074")).toBe(true); // EAN-8
    expect(gtinCheckDigitOk("00012345678905")).toBe(true); // GTIN-14
  });
  it("rejects a wrong digit", () => {
    expect(gtinCheckDigitOk("4006381333932")).toBe(false);
    expect(gtinCheckDigitOk("036000291453")).toBe(false);
    expect(gtinCheckDigitOk("12a4")).toBe(false);
  });
});

describe("parseBarcode", () => {
  it("normalises spacing and pads UPC-A / shortens GTIN-14", () => {
    expect(parseBarcode(" 4006381 333931 ")).toBe("4006381333931");
    expect(parseBarcode("4006381-333931")).toBe("4006381333931");
    expect(parseBarcode("036000291452")).toBe("0036000291452");
    expect(parseBarcode("00012345678905")).toBe("0012345678905");
    expect(parseBarcode("96385074")).toBe("96385074");
  });
  it("rejects bad lengths, letters, wrong check digits and non-strings", () => {
    for (const bad of [
      "",
      "123",
      "4006381333932",
      "40063813339311",
      "ABCDEFGHIJKLM",
      "4006381333931; drop table",
      4006381333931,
      null,
      undefined,
    ])
      expect(parseBarcode(bad), String(bad)).toBeNull();
  });
});

const off = (product: Record<string, unknown>) => ({ status: 1, product });

describe("parseOffProduct", () => {
  it("uses per-serving numbers when the database has them", () => {
    const p = parseOffProduct(
      off({
        product_name: "Instant noodles",
        product_name_th: "บะหมี่กึ่งสำเร็จรูป",
        brands: "Mama, Other",
        nutriments: {
          "energy-kcal_serving": 330,
          proteins_serving: 7.04,
          carbohydrates_serving: 45,
          fat_serving: 13.5,
        },
      }),
    );
    expect(p).toEqual({
      name: "บะหมี่กึ่งสำเร็จรูป",
      brand: "Mama",
      basis: "serving",
      per_serving: { kcal: 330, protein_g: 7, carbs_g: 45, fat_g: 13.5 },
    });
  });
  it("scales per-100 g values by the serving size when it is known", () => {
    const p = parseOffProduct(
      off({
        product_name: "Biscuit",
        serving_quantity: "30",
        nutriments: {
          "energy-kcal_100g": 480,
          proteins_100g: 6,
          carbohydrates_100g: 70,
          fat_100g: 20,
        },
      }),
    );
    expect(p?.basis).toBe("serving");
    expect(p?.per_serving).toEqual({
      kcal: 144,
      protein_g: 1.8,
      carbs_g: 21,
      fat_g: 6,
    });
  });
  it("falls back to per 100 g and says so", () => {
    const p = parseOffProduct(
      off({
        product_name: "Rice",
        nutriments: { "energy-kcal_100g": 130, carbohydrates_100g: 28 },
      }),
    );
    expect(p).toMatchObject({
      basis: "100g",
      per_serving: { kcal: 130, protein_g: 0, carbs_g: 28, fat_g: 0 },
    });
  });
  it("is null without a name, without energy, or with absurd numbers", () => {
    expect(
      parseOffProduct(off({ nutriments: { "energy-kcal_100g": 100 } })),
    ).toBeNull();
    expect(
      parseOffProduct(
        off({ product_name: "X", nutriments: { proteins_100g: 5 } }),
      ),
    ).toBeNull();
    expect(
      parseOffProduct(
        off({
          product_name: "X",
          nutriments: { "energy-kcal_serving": 99999 },
        }),
      ),
    ).toBeNull();
    expect(
      parseOffProduct(
        off({
          product_name: "X",
          nutriments: { "energy-kcal_serving": 100, fat_serving: 9999 },
        }),
      ),
    ).toBeNull();
    expect(parseOffProduct({ status: 0 })).toBeNull();
    expect(parseOffProduct(null)).toBeNull();
    expect(parseOffProduct("<html>")).toBeNull();
  });
  it("ignores junk values instead of crashing", () => {
    const p = parseOffProduct(
      off({
        product_name: "Odd",
        brands: 5,
        nutriments: {
          "energy-kcal_serving": "200",
          proteins_serving: "n/a",
          fat_serving: null,
        },
      }),
    );
    expect(p?.per_serving).toEqual({
      kcal: 200,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });
  it("trims a very long name", () => {
    const p = parseOffProduct(
      off({
        product_name: "x".repeat(300),
        nutriments: { "energy-kcal_serving": 100 },
      }),
    );
    expect(p?.name).toHaveLength(80);
  });
});

describe("barcodeMealItem", () => {
  it("is one serving from the label, not an AI estimate", () => {
    const it = barcodeMealItem("4006381333931", {
      name: "Noodles",
      brand: "Mama",
      basis: "serving",
      per_serving: { kcal: 330, protein_g: 7, carbs_g: 45, fat_g: 13.5 },
    });
    expect(it).toMatchObject({
      name: "Noodles (Mama)",
      servings: 1,
      source: "barcode",
      catalog_key: "ean:4006381333931",
    });
  });
});
