import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELE_SETTINGS,
  csvCell,
  formatDuration,
  generateSlots,
  inOpeningHours,
  isOfferedSlot,
  parseRecordForm,
  parseRequestForm,
  parseTeleForm,
  parseTeleSettings,
  pickText,
  type TeleSettings,
} from "./telepharmacy";

const s: TeleSettings = { ...DEFAULT_TELE_SETTINGS, enabled: true, openDays: [0, 1, 2, 3, 4, 5, 6] };
// Wednesday 2026-11-18 10:00 in Bangkok
const NOW = new Date("2026-11-18T03:00:00Z");

describe("settings", () => {
  it("are OFF with identity checks ON when nothing is readable", () => {
    const d = parseTeleSettings(null);
    expect(d.enabled).toBe(false);
    expect(d.requireKycForConsult).toBe(true);
    expect(d.requireKycForPharmacist).toBe(true);
    expect(parseTeleSettings({}).enabled).toBe(false);
  });
  it("read the table's columns (time columns come as HH:MM:SS)", () => {
    const r = parseTeleSettings({ enabled: true, open_days: [1, 2, 9], open_from: "08:30:00", slot_minutes: 30, video_provider: "jaas" });
    expect(r).toMatchObject({ enabled: true, openDays: [1, 2], openFrom: "08:30", slotMinutes: 30, videoProvider: "jaas" });
    expect(parseTeleSettings({ video_provider: "zoom" }).videoProvider).toBe("jitsi");
  });
});

describe("pickText", () => {
  it("uses the admin's text in the reader's language, else the draft", () => {
    expect(pickText("th", { th: " ไทย ", en: "" }, "draft")).toBe("ไทย");
    expect(pickText("en", { th: "ไทย", en: "" }, "draft")).toBe("draft");
  });
});

describe("the admin form", () => {
  const base: Record<string, unknown> = {
    enabled: "on", instantEnabled: "on", scheduledEnabled: "on", requireKycForConsult: "on", requireKycForPharmacist: "on",
    day1: "on", day2: "on", openFrom: "09:00", openTo: "20:00",
    slotMinutes: "20", slotCapacity: "1", bookingDaysAhead: "14", bookingMinLeadMinutes: "60", maxActiveBookings: "3",
    waitTimeoutSec: "180", maxWaiting: "3", maxCallMinutes: "30", videoProvider: "jitsi",
    consentVersion: "draft-1", consentTextTh: "", consentTextEn: "", disclaimerTh: "", disclaimerEn: "", retentionDays: "1825",
  };
  const parse = (o: Record<string, unknown>, prev = DEFAULT_TELE_SETTINGS) => parseTeleForm((k) => o[k], prev);

  it("becomes table columns", () => {
    const r = parse(base);
    expect(r.ok && r.columns).toMatchObject({
      enabled: true, open_days: [1, 2], open_from: "09:00", open_to: "20:00", slot_minutes: 20,
      video_provider: "jitsi", require_kyc_for_consult: true, retention_days: 1825,
    });
  });
  it("an unticked identity requirement is OFF only because the admin unticked it", () => {
    const r = parse({ ...base, requireKycForConsult: undefined });
    expect(r.ok && r.columns.require_kyc_for_consult).toBe(false);
  });
  it("rejects values out of range instead of clamping them", () => {
    for (const [k, v] of [
      ["slotMinutes", "5"], ["slotCapacity", "0"], ["bookingDaysAhead", "61"], ["maxActiveBookings", "11"],
      ["waitTimeoutSec", "10"], ["maxWaiting", "abc"], ["maxCallMinutes", "1.5"], ["retentionDays", "1"], ["slotMinutes", ""],
    ] as const)
      expect(parse({ ...base, [k]: v })).toEqual({ ok: false, field: k });
    expect(parse({ ...base, videoProvider: "zoom" })).toEqual({ ok: false, field: "videoProvider" });
    expect(parse({ ...base, openTo: "08:00" })).toEqual({ ok: false, field: "openTo" });
    expect(parse({ ...base, openFrom: "9am" })).toEqual({ ok: false, field: "openFrom" });
  });
  it("a changed consent text needs a new version label", () => {
    expect(parse({ ...base, consentTextTh: "ข้อความใหม่" })).toEqual({ ok: false, field: "consentVersion" });
    const ok = parse({ ...base, consentTextTh: "ข้อความใหม่", consentVersion: "v2" });
    expect(ok.ok && ok.columns).toMatchObject({ consent_version: "v2", consent_text_th: "ข้อความใหม่" });
    // same text, same label: fine
    const prev = { ...DEFAULT_TELE_SETTINGS, consentTextTh: "เดิม", consentVersion: "v1" };
    expect(parse({ ...base, consentTextTh: "เดิม", consentVersion: "v1" }, prev).ok).toBe(true);
  });
});

describe("opening hours (Bangkok time)", () => {
  it("open inside the hours on an open day, closed at 20:00 sharp, before opening and on a closed day", () => {
    expect(inOpeningHours(s, NOW)).toBe(true); // Wed 10:00
    expect(inOpeningHours(s, new Date("2026-11-18T13:00:00Z"))).toBe(false); // 20:00
    expect(inOpeningHours(s, new Date("2026-11-18T12:59:00Z"))).toBe(true); // 19:59
    expect(inOpeningHours(s, new Date("2026-11-18T01:59:00Z"))).toBe(false); // 08:59
    expect(inOpeningHours({ ...s, openDays: [1, 2] }, NOW)).toBe(false); // Wednesday is closed
  });
  it("uses the Bangkok day, not UTC's: 23:00 Wednesday in Bangkok is still Wednesday", () => {
    expect(inOpeningHours({ ...s, openFrom: "00:00", openTo: "23:59", openDays: [3] }, new Date("2026-11-18T16:30:00Z"))).toBe(true);
    expect(inOpeningHours({ ...s, openFrom: "00:00", openTo: "23:59", openDays: [3] }, new Date("2026-11-18T17:30:00Z"))).toBe(false); // Thursday 00:30
  });
});

describe("slots", () => {
  it("run on the grid from opening to the last slot that ends by closing time", () => {
    const slots = generateSlots({ ...s, bookingDaysAhead: 1 }, NOW).filter((x) => x.date === "2026-11-18");
    expect(slots[0].time).toBe("11:00"); // 10:00 now + 60 min lead
    expect(slots[slots.length - 1].time).toBe("19:40");
    expect(slots.every((x) => x.at.endsWith("+07:00"))).toBe(true);
    expect(new Set(slots.map((x) => x.time)).size).toBe(slots.length);
  });
  it("skip closed days and stop at the horizon", () => {
    const slots = generateSlots({ ...s, openDays: [1], bookingDaysAhead: 14 }, NOW);
    expect(slots.every((x) => new Date(`${x.date}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    const last = Date.parse(slots[slots.length - 1].at);
    expect(last).toBeLessThanOrEqual(NOW.getTime() + 14 * 86_400_000);
  });
  it("mark a slot full when the people holding it reach the capacity", () => {
    const at = "2026-11-18T07:00:00.000Z"; // 14:00 Bangkok
    const one = generateSlots(s, NOW, new Map([[at, 1]])).find((x) => x.time === "14:00" && x.date === "2026-11-18");
    expect(one?.full).toBe(true);
    const two = generateSlots({ ...s, slotCapacity: 2 }, NOW, new Map([[at, 1]])).find((x) => x.time === "14:00" && x.date === "2026-11-18");
    expect(two?.full).toBe(false);
  });
  it("isOfferedSlot accepts only the instants of the grid", () => {
    expect(isOfferedSlot(s, NOW, "2026-11-18T14:00:00+07:00")).toBe(true);
    expect(isOfferedSlot(s, NOW, "2026-11-18T14:05:00+07:00")).toBe(false);
    expect(isOfferedSlot(s, NOW, "2026-11-18T10:20:00+07:00")).toBe(false); // too soon
    expect(isOfferedSlot(s, NOW, "nonsense")).toBe(false);
  });
});

describe("the customer's request", () => {
  const form = (o: Record<string, unknown>) => (k: string) => o[k];
  const base = { consent_consult: "on", consent_record: "on", topic: "medicine_use", medicines: "  paracetamol \n 500 mg ", allergies: "" };
  it("needs BOTH required consents, every time", () => {
    expect(parseRequestForm(form({ ...base, consent_consult: undefined }))).toEqual({ ok: false, error: "err_tele_consent" });
    expect(parseRequestForm(form({ ...base, consent_record: undefined }))).toEqual({ ok: false, error: "err_tele_consent" });
    expect(parseRequestForm(form({ topic: "general" }))).toEqual({ ok: false, error: "err_tele_consent" });
  });
  it("shares nothing unless each item is ticked, and keeps what was typed to one tidy line", () => {
    const r = parseRequestForm(form(base));
    expect(r.ok && r.value.consentItems).toEqual({ consult: true, record: true, share_profile: false, share_labs: false, share_history: false });
    expect(r.ok && r.value.intake.medicines).toBe("paracetamol 500 mg");
    const all = parseRequestForm(form({ ...base, share_profile: "on", share_labs: "on", share_history: "on" }));
    expect(all.ok && all.value.consentItems).toMatchObject({ share_profile: true, share_labs: true, share_history: true });
  });
  it("refuses an unknown topic or a product id that is not a uuid", () => {
    expect(parseRequestForm(form({ ...base, topic: "diagnose-me" }))).toEqual({ ok: false, error: "err_invalid_input" });
    expect(parseRequestForm(form({ ...base, productId: "1; drop table" }))).toEqual({ ok: false, error: "err_invalid_input" });
    const r = parseRequestForm(form({ ...base, productId: "11111111-1111-4111-8111-111111111111", slot: "2026-11-18T14:00:00+07:00" }));
    expect(r.ok && r.value.productId).toBe("11111111-1111-4111-8111-111111111111");
    expect(r.ok && r.value.slot).toBe("2026-11-18T14:00:00+07:00");
  });
  it("caps what was typed", () => {
    const r = parseRequestForm(form({ ...base, medicines: "x".repeat(1000) }));
    expect(r.ok && r.value.intake.medicines.length).toBe(300);
  });
});

describe("the pharmacist's record", () => {
  const today = "2026-11-18";
  const form = (o: Record<string, unknown>) => (k: string) => o[k];
  it("reads the advice, the referral flag, the products the PHARMACIST suggested and the follow-up", () => {
    const r = parseRecordForm(
      form({ advice: " พักผ่อน ", referDoctor: "on", product_name_0: "วิตามิน A", product_note_0: "ตามฉลาก", followUpOn: "2026-11-25", followUpNote: "ถามอาการ" }),
      today,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        advice: "พักผ่อน", referDoctor: true,
        products: [{ product_id: null, name: "วิตามิน A", note: "ตามฉลาก" }],
        followUpOn: "2026-11-25", followUpNote: "ถามอาการ",
      },
    });
  });
  it("empty product rows are dropped; a row with an id but no name is refused; ids must be uuids", () => {
    const ok = parseRecordForm(form({ advice: "x", product_name_2: "" }), today);
    expect(ok.ok && ok.value.products).toEqual([]);
    expect(parseRecordForm(form({ product_id_0: "11111111-1111-4111-8111-111111111111" }), today)).toEqual({ ok: false, field: "products" });
    expect(parseRecordForm(form({ product_id_0: "nope", product_name_0: "x" }), today)).toEqual({ ok: false, field: "products" });
  });
  it("a follow-up is between tomorrow and a year away", () => {
    for (const bad of ["2026-11-18", "2026-11-17", "2027-11-19", "next week", "2026-13-40x"])
      expect(parseRecordForm(form({ followUpOn: bad }), today)).toEqual({ ok: false, field: "followUpOn" });
    expect(parseRecordForm(form({ followUpOn: "2026-11-19" }), today).ok).toBe(true);
    expect(parseRecordForm(form({ followUpOn: "2027-11-18" }), today).ok).toBe(true);
  });
  it("keeps the advice under 4000 characters", () => {
    expect(parseRecordForm(form({ advice: "a".repeat(4001) }), today)).toEqual({ ok: false, field: "advice" });
  });
});

describe("csv and durations", () => {
  it("quotes cells, and a leading formula character is neutralised", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });
  it("formats seconds as m:ss", () => {
    expect(formatDuration(754)).toBe("12:34");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(null)).toBe("–");
  });
});
