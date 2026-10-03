import { describe, expect, it } from "vitest";
import {
  buildLineAuthorizeUrl,
  isLineSyntheticEmail,
  lineSyntheticEmail,
  parseLineCookie,
  randomToken,
  statesMatch,
} from "./login";

describe("LINE login helpers", () => {
  it("builds the authorize URL with state, nonce and the OpenID scope", () => {
    const url = new URL(
      buildLineAuthorizeUrl({
        channelId: "123",
        redirectUri: "https://roosuk.example/api/auth/line/callback",
        state: "S",
        nonce: "N",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://access.line.me/oauth2/v2.1/authorize",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://roosuk.example/api/auth/line/callback",
    );
    expect(url.searchParams.get("state")).toBe("S");
    expect(url.searchParams.get("nonce")).toBe("N");
    expect(url.searchParams.get("scope")).toBe("profile openid");
  });

  it("derives a stable, non-deliverable email per LINE user", () => {
    const email = lineSyntheticEmail("U1AbC");
    expect(email).toBe(lineSyntheticEmail("u1abc"));
    expect(email.endsWith(".invalid")).toBe(true);
    expect(isLineSyntheticEmail(email)).toBe(true);
    expect(isLineSyntheticEmail("someone@gmail.com")).toBe(false);
    expect(isLineSyntheticEmail(null)).toBe(false);
  });

  it("compares state values strictly", () => {
    expect(statesMatch("abc", "abc")).toBe(true);
    expect(statesMatch("abc", "abd")).toBe(false);
    expect(statesMatch("abc", "abcd")).toBe(false);
    expect(statesMatch(undefined, "abc")).toBe(false);
    expect(statesMatch("abc", null)).toBe(false);
  });

  it("generates unguessable, distinct tokens", () => {
    const a = randomToken();
    expect(a.length).toBeGreaterThanOrEqual(30);
    expect(randomToken()).not.toBe(a);
  });

  it("parses only a well-formed state cookie", () => {
    const good = { state: "s", nonce: "n", mode: "login", next: "/today" };
    expect(parseLineCookie(JSON.stringify(good))).toEqual(good);
    expect(
      parseLineCookie(JSON.stringify({ ...good, mode: "admin" })),
    ).toBeNull();
    expect(parseLineCookie("{not json")).toBeNull();
    expect(parseLineCookie(undefined)).toBeNull();
  });
});
