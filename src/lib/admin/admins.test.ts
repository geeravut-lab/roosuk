import { describe, expect, it } from "vitest";
import { LINE_EMAIL_DOMAIN } from "@/lib/line/login";
import {
  describeAdmins,
  isProtectedAdminEmail,
  parseGrantEmail,
} from "./admins";

describe("isProtectedAdminEmail", () => {
  it("matches the owner in any case and with stray spaces, and nobody else", () => {
    expect(isProtectedAdminEmail("geeravut@gmail.com")).toBe(true);
    expect(isProtectedAdminEmail(" GeeRavut@Gmail.com ")).toBe(true);
    expect(isProtectedAdminEmail("geeravut@gmail.co")).toBe(false);
    expect(isProtectedAdminEmail("xgeeravut@gmail.com")).toBe(false);
    expect(isProtectedAdminEmail(null)).toBe(false);
  });
});

describe("parseGrantEmail", () => {
  it("normalises a real address and refuses anything else", () => {
    expect(parseGrantEmail("  Someone@Example.COM ")).toBe(
      "someone@example.com",
    );
    for (const bad of ["", "no-at-sign", "a@", "@b.com", "a b@c.com", 5, null])
      expect(parseGrantEmail(bad)).toBeNull();
  });
});

describe("describeAdmins", () => {
  const rows = [
    {
      user_id: "u2",
      created_at: "2026-10-02",
      email: "b@x.test",
      name: " Bee ",
    },
    {
      user_id: "u1",
      created_at: "2026-10-03",
      email: "geeravut@gmail.com",
      name: null,
    },
    {
      user_id: "u3",
      created_at: "2026-10-01",
      email: `line_x@${LINE_EMAIL_DOMAIN}`,
      name: "Line",
    },
  ];
  it("puts the owner first, then oldest first; marks self and hides LINE placeholders", () => {
    const out = describeAdmins(rows, "u2");
    expect(out.map((a) => a.id)).toEqual(["u1", "u3", "u2"]);
    expect(out[0]).toMatchObject({ isProtected: true, isSelf: false });
    expect(out[1].email).toBeNull();
    expect(out[2]).toMatchObject({
      isSelf: true,
      displayName: "Bee",
      isProtected: false,
    });
  });
});
