import { describe, expect, it } from "vitest";
import {
  listMigrations,
  parseMigrationFile,
  pendingMigrations,
  sqlString,
} from "./migrations.mjs";

describe("migration files", () => {
  it("parses a valid name", () => {
    expect(parseMigrationFile("20261003000100_phase0_foundation.sql")).toEqual({
      version: "20261003000100",
      name: "phase0_foundation",
      file: "20261003000100_phase0_foundation.sql",
    });
  });

  it("rejects names that would silently sort wrong", () => {
    expect(parseMigrationFile("phase0.sql")).toBeNull();
    expect(parseMigrationFile("2026_phase0.sql")).toBeNull();
    expect(() => listMigrations(["oops.sql"])).toThrow(
      /Bad migration file name/,
    );
  });

  it("orders by version and ignores non-sql files", () => {
    const out = listMigrations([
      "20261004000000_b.sql",
      "README.md",
      "20261003000000_a.sql",
    ]);
    expect(out.map((m) => m.name)).toEqual(["a", "b"]);
  });

  it("rejects duplicate versions", () => {
    expect(() =>
      listMigrations(["20261003000000_a.sql", "20261003000000_b.sql"]),
    ).toThrow(/Duplicate/);
  });

  it("returns only pending migrations and refuses unknown applied versions", () => {
    const all = listMigrations([
      "20261003000000_a.sql",
      "20261004000000_b.sql",
    ]);
    expect(
      pendingMigrations(all, ["20261003000000"]).map((m) => m.name),
    ).toEqual(["b"]);
    expect(pendingMigrations(all, [])).toHaveLength(2);
    expect(() => pendingMigrations(all, ["20250101000000"])).toThrow(/no file/);
  });

  it("escapes single quotes in SQL strings", () => {
    expect(sqlString("a'b")).toBe("'a''b'");
  });
});
