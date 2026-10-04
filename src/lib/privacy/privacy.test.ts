import { describe, expect, it } from "vitest";
import { OWNED_TABLES } from "@/config/user-data";
import {
  DELETE_PHRASES,
  exportFilename,
  isDeletePhrase,
  mergeOptionalConsent,
  omitColumns,
  summariseDeletion,
} from "./privacy";

describe("isDeletePhrase", () => {
  it("accepts the Thai or English phrase, trimmed, and nothing else", () => {
    for (const p of DELETE_PHRASES) expect(isDeletePhrase(p)).toBe(true);
    expect(isDeletePhrase("  DELETE ")).toBe(true);
    for (const bad of [
      "delete",
      "ลบ",
      "ลบ บัญชี",
      "",
      "DELETE ME",
      null,
      undefined,
      5,
    ])
      expect(isDeletePhrase(bad)).toBe(false);
  });
});

describe("export helpers", () => {
  it("drops only the named columns", () => {
    expect(
      omitColumns({ a: 1, reviewed_by: "admin-id", note: "x" }, [
        "reviewed_by",
      ]),
    ).toEqual({ a: 1, note: "x" });
    const row = { a: 1 };
    expect(omitColumns(row, undefined)).toBe(row);
    expect(omitColumns(row, [])).toBe(row);
  });
  it("names the file by date", () => {
    expect(exportFilename(new Date("2026-10-14T05:00:00Z"))).toBe(
      "roosuk-my-data-2026-10-14.json",
    );
  });
  it("never ships the reviewing admin's id in a payment row", () => {
    const payments = OWNED_TABLES.find((t) => t.table === "payments")!;
    expect(payments.omit).toContain("reviewed_by");
    expect(
      omitColumns({ id: 1, reviewed_by: "someone-else" }, payments.omit),
    ).toEqual({ id: 1 });
  });
});

describe("summariseDeletion", () => {
  it("separates what is erased from what is kept (detached) for bookkeeping", () => {
    const s = summariseDeletion({
      daily_checkins: 30,
      meal_logs: 4,
      payments: 2,
      user_subscriptions: 1,
      unknown_table: 99,
    });
    expect(s).toEqual({ erasedRows: 34, retainedRows: 3 });
    expect(summariseDeletion({})).toEqual({ erasedRows: 0, retainedRows: 0 });
  });
});

describe("mergeOptionalConsent", () => {
  const latest = {
    terms_privacy: true,
    not_medical_service: true,
    sensitive_health_data: true,
    ai_processing_cross_border: true,
    data_region: true,
    photos: false,
    marketing: true,
  };
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  it("lets only the optional items follow the form, and keeps every required one on", () => {
    const r = mergeOptionalConsent(latest, form({ consent_photos: "on" }));
    expect(r).toEqual({
      ok: true,
      items: { ...latest, photos: true, marketing: false },
    });
    // a forged form cannot switch a required item off
    const forged = mergeOptionalConsent(
      latest,
      form({ consent_sensitive_health_data: "", consent_photos: "on" }),
    );
    expect(forged.ok && forged.items.sensitive_health_data).toBe(true);
  });
  it("refuses when the latest record is missing a required item (the app layout sends that user to /consent)", () => {
    expect(
      mergeOptionalConsent(
        { ...latest, sensitive_health_data: false },
        form({}),
      ).ok,
    ).toBe(false);
    expect(mergeOptionalConsent({}, form({})).ok).toBe(false);
  });
});
