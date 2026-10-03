import { describe, expect, it } from "vitest";
import { isProtectedPath } from "@/config/routes";
import { loginSchema, mapAuthError, safeNextPath, signupSchema } from "./utils";

describe("safeNextPath", () => {
  it("allows same-site relative paths", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/admin/flags?x=1")).toBe("/admin/flags?x=1");
  });

  it("falls back for anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      null,
      undefined,
      5,
    ]) {
      expect(safeNextPath(bad), String(bad)).toBe("/today");
    }
    expect(safeNextPath("//x", "/settings")).toBe("/settings");
  });
});

describe("credential schemas", () => {
  it("normalise the email", () => {
    const out = loginSchema.parse({
      email: "  Alice@Example.COM ",
      password: "x",
    });
    expect(out.email).toBe("alice@example.com");
  });

  it("require a valid email and, for sign-up, a password of at least 8 characters", () => {
    expect(
      loginSchema.safeParse({ email: "nope", password: "x" }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({ email: "a@b.co", password: "short" }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({ email: "a@b.co", password: "long-enough" })
        .success,
    ).toBe(true);
    expect(
      signupSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) })
        .success,
    ).toBe(false);
  });
});

describe("mapAuthError", () => {
  it("maps known Supabase codes to our error codes", () => {
    expect(mapAuthError({ code: "invalid_credentials" })).toBe(
      "err_invalid_credentials",
    );
    expect(mapAuthError({ code: "user_already_exists" })).toBe(
      "err_email_taken",
    );
    expect(mapAuthError({ code: "email_exists" })).toBe("err_email_taken");
    expect(mapAuthError({ code: "weak_password" })).toBe("err_weak_password");
    expect(mapAuthError({ code: "email_not_confirmed" })).toBe(
      "err_email_not_confirmed",
    );
    expect(mapAuthError({ code: "over_email_send_rate_limit" })).toBe(
      "err_rate_limited",
    );
    expect(mapAuthError({ status: 429 })).toBe("err_rate_limited");
    expect(mapAuthError({ code: "something_new" })).toBe("err_unknown");
  });
});

describe("isProtectedPath", () => {
  it("protects app and admin areas but not public pages or API routes", () => {
    for (const p of [
      "/today",
      "/today/x",
      "/admin",
      "/admin/flags",
      "/consent",
      "/settings",
    ])
      expect(isProtectedPath(p), p).toBe(true);
    for (const p of [
      "/",
      "/auth",
      "/auth/callback",
      "/privacy",
      "/terms",
      "/api/health",
      "/todayish",
    ])
      expect(isProtectedPath(p), p).toBe(false);
  });
});
