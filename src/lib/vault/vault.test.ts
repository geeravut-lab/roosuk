import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dict } from "@/lib/i18n/dict";
import {
  VAULT_CATEGORIES,
  categoryKey,
  cleanTitle,
  parseVaultForm,
  vaultFull,
} from "./vault";

const form = (o: Record<string, unknown>) => (k: string) => o[k];
const TODAY = "2026-10-04";

describe("parseVaultForm", () => {
  it("accepts a normal document and cleans the title", () => {
    const r = parseVaultForm(
      form({
        title: "  ใบรับรองแพทย์ \n 2026 ",
        category: "doctor_note",
        docDate: "2026-09-30",
      }),
      TODAY,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        title: "ใบรับรองแพทย์ 2026",
        category: "doctor_note",
        docDate: "2026-09-30",
      },
    });
  });
  it("the date is optional but must be real, not in the future and not absurdly old", () => {
    const base = { title: "x", category: "other" };
    expect(parseVaultForm(form({ ...base, docDate: "" }), TODAY)).toMatchObject(
      { ok: true, value: { docDate: null } },
    );
    for (const bad of [
      "2026-02-30",
      "2026-10-05",
      "1980-01-01",
      "yesterday",
      "2026-9-1",
    ])
      expect(
        parseVaultForm(form({ ...base, docDate: bad }), TODAY),
        bad,
      ).toEqual({
        ok: false,
        error: "err_vault_date",
      });
  });
  it("rejects a missing/long title and an unknown category", () => {
    expect(
      parseVaultForm(form({ title: "  ", category: "other" }), TODAY),
    ).toEqual({ ok: false, error: "err_vault_title" });
    expect(
      parseVaultForm(form({ title: "x".repeat(81), category: "other" }), TODAY),
    ).toEqual({ ok: false, error: "err_vault_title" });
    expect(
      parseVaultForm(form({ title: 5, category: "other" }), TODAY),
    ).toEqual({ ok: false, error: "err_vault_title" });
    expect(
      parseVaultForm(form({ title: "ok", category: "__proto__" }), TODAY),
    ).toEqual({ ok: false, error: "err_invalid_input" });
    expect(parseVaultForm(form({ title: "ok" }), TODAY)).toEqual({
      ok: false,
      error: "err_invalid_input",
    });
  });
  it("strips control characters from the title", () => {
    expect(cleanTitle("a\u0000b\u0007c")).toBe("a b c");
  });
});

describe("vaultFull", () => {
  it("compares with the plan limit", () => {
    expect(vaultFull(4, 5)).toBe(false);
    expect(vaultFull(5, 5)).toBe(true);
    expect(vaultFull(999, "unlimited")).toBe(false);
  });
});

describe("categories", () => {
  it("match the database and have names in both languages", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261022000100_health_vault.sql",
      ),
      "utf8",
    );
    const allowed = [
      ...sql
        .slice(
          sql.indexOf("category in ("),
          sql.indexOf("))", sql.indexOf("category in (")),
        )
        .matchAll(/'([a-z_]+)'/g),
    ].map((m) => m[1]);
    expect([...VAULT_CATEGORIES].sort()).toEqual([...allowed].sort());
    for (const lang of ["th", "en"] as const)
      for (const c of VAULT_CATEGORIES)
        expect(dict[lang][categoryKey(c)]).toBeTruthy();
  });
});
