import { describe, expect, it } from "vitest";
import {
  cleanAdminNote,
  cleanPhone,
  isLeadStatus,
  parseLeadForm,
} from "./leads";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ok = { interest: "checkup", contactMethod: "line", consent: "on" };

describe("parseLeadForm", () => {
  it("accepts a LINE request without a phone and trims the note", () => {
    expect(
      parseLeadForm(form({ ...ok, note: "  สนใจแพ็กเกจพื้นฐาน \n" })),
    ).toEqual({
      ok: true,
      lead: {
        interest: "checkup",
        contact_method: "line",
        phone: null,
        note: "สนใจแพ็กเกจพื้นฐาน",
      },
    });
    const r = parseLeadForm(form({ ...ok, phone: "0812345678" }));
    expect(r.ok && r.lead.phone).toBeNull(); // a number given alongside LINE is not stored
  });
  it("needs a usable phone when that is the contact method", () => {
    const good = parseLeadForm(
      form({ ...ok, contactMethod: "phone", phone: "081-234-5678" }),
    );
    expect(good.ok && good.lead.phone).toBe("081-234-5678");
    for (const phone of ["", "abc", "12", "081-234-56789012345678"])
      expect(
        parseLeadForm(form({ ...ok, contactMethod: "phone", phone })),
        phone,
      ).toEqual({
        ok: false,
        error: "err_lead_invalid",
      });
  });
  it("is refused without the agreement to be contacted", () => {
    expect(
      parseLeadForm(form({ interest: "checkup", contactMethod: "line" })),
    ).toEqual({
      ok: false,
      error: "err_lead_consent",
    });
    expect(parseLeadForm(form({ ...ok, consent: "off" }))).toEqual({
      ok: false,
      error: "err_lead_consent",
    });
  });
  it("rejects unknown choices and an over-long note", () => {
    for (const bad of [
      { interest: "surgery" },
      { contactMethod: "fax" },
      { interest: "" },
    ])
      expect(
        parseLeadForm(form({ ...ok, ...bad })).ok,
        JSON.stringify(bad),
      ).toBe(false);
    expect(parseLeadForm(form({ ...ok, note: "x".repeat(301) })).ok).toBe(
      false,
    );
    expect(parseLeadForm(form({ ...ok, note: "x".repeat(300) })).ok).toBe(true);
  });
  it("strips control characters from the note", () => {
    const r = parseLeadForm(form({ ...ok, note: "a\u0000b\u0007c" }));
    expect(r.ok && r.lead.note).toBe("abc");
  });
});

describe("helpers", () => {
  it("cleanPhone keeps real-looking numbers only", () => {
    expect(cleanPhone("+66 81 234 5678")).toBe("+66 81 234 5678");
    expect(cleanPhone("(02) 123-4567")).toBe("02 123-4567");
    for (const bad of [null, 5, "", "hello", "1234567", "+".repeat(10)])
      expect(cleanPhone(bad)).toBeNull();
  });
  it("status and admin note", () => {
    expect(isLeadStatus("contacted")).toBe(true);
    expect(isLeadStatus("closed")).toBe(false);
    expect(cleanAdminNote("  โทรแล้ว ")).toBe("โทรแล้ว");
    expect(cleanAdminNote("   ")).toBeNull();
    expect(cleanAdminNote("x".repeat(500))).toHaveLength(300);
  });
});
