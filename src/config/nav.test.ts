import { describe, expect, it } from "vitest";
import { NAV, backTarget } from "./nav";

describe("backTarget", () => {
  it("gives pages below a menu page a link up", () => {
    expect(backTarget("/scan/food")).toEqual({
      href: "/scan",
      label: "navScan",
    });
    expect(backTarget("/scan/lab/abc-123")).toEqual({
      href: "/scan",
      label: "navScan",
    });
    expect(backTarget("/scan/body")).toEqual({
      href: "/scan",
      label: "navScan",
    });
    expect(backTarget("/subscription/pay/xyz")?.href).toBe("/subscription");
    expect(backTarget("/today/checkin")?.href).toBe("/today");
    expect(backTarget("/quiz-result/1")?.href).toBe("/today");
    expect(backTarget("/checkup-interest")?.href).toBe("/today");
    expect(backTarget("/admin/ai")).toEqual({
      href: "/admin",
      label: "navAdmin",
    });
    expect(backTarget("/admin/leads")?.href).toBe("/admin");
  });
  it("menu pages and the admin home have none (they are one tap away in the menu)", () => {
    for (const n of NAV) expect(backTarget(n.href), n.href).toBeNull();
    expect(backTarget("/admin")).toBeNull();
    expect(backTarget("/today/checkin/extra/deep")).toBeNull();
  });
  it("follows ?from= to a known place, ignoring anything else", () => {
    expect(backTarget("/scan/lab/abc", "timeline")?.href).toBe("/timeline");
    expect(backTarget("/scan/food/abc", "notifications")?.href).toBe(
      "/notifications",
    );
    expect(backTarget("/scan/lab/abc", "https://evil.example")?.href).toBe(
      "/scan",
    );
    expect(backTarget("/scan/lab/abc", "")?.href).toBe("/scan");
    expect(backTarget("/scan/lab/abc", "constructor")?.href).toBe("/scan");
    expect(backTarget("/admin", "timeline")).toBeNull(); // no back at all on a page without a parent
  });
});
