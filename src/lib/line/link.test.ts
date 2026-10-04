import { describe, expect, it } from "vitest";
import { LINE_EMAIL_DOMAIN } from "@/lib/line/login";
import { canUnlinkLine, classifyLinkConflict } from "@/lib/line/link";

const synthetic = `line_u123@${LINE_EMAIL_DOMAIN}`;

describe("classifyLinkConflict", () => {
  it("tells a real account from one that only exists through LINE sign-in", () => {
    expect(classifyLinkConflict("a@b.test")).toBe("other_user");
    expect(classifyLinkConflict(null)).toBe("other_user");
    expect(classifyLinkConflict(synthetic)).toBe("other_login_account");
  });
});

describe("canUnlinkLine", () => {
  it("is off for an account whose only way in is LINE", () => {
    expect(canUnlinkLine(synthetic)).toBe(false);
    expect(canUnlinkLine("a@b.test")).toBe(true);
    expect(canUnlinkLine(null)).toBe(true);
  });
});
