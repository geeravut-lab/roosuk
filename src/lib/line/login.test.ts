import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLineAuthorizeUrl,
  fetchLineProfile,
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

describe("fetchLineProfile names the step that failed", () => {
  const params = {
    code: "c",
    redirectUri: "https://x.test/cb",
    channelId: "123",
    channelSecret: "s",
    nonce: "n",
  };
  const answers = (...rs: { status: number; body: unknown }[]) => {
    const queue = [...rs];
    vi.stubGlobal("fetch", async () => {
      const r = queue.shift()!;
      return new Response(JSON.stringify(r.body), { status: r.status });
    });
  };
  afterEach(() => vi.unstubAllGlobals());

  it("succeeds with the profile when LINE accepts the code and verifies the token", async () => {
    answers(
      { status: 200, body: { id_token: "t" } },
      { status: 200, body: { sub: "U1", aud: "123", nonce: "n", name: "Eva" } },
    );
    expect(await fetchLineProfile(params)).toEqual({
      ok: true,
      profile: { sub: "U1", name: "Eva", picture: null },
    });
  });
  it("tells a wrong callback URL / secret apart from a bad code", async () => {
    answers({
      status: 400,
      body: {
        error: "invalid_grant",
        error_description: "invalid redirect_uri value",
      },
    });
    expect(await fetchLineProfile(params)).toEqual({
      ok: false,
      reason: "token_400_invalid_grant",
    });
    answers({ status: 401, body: { error: "invalid_client" } });
    expect(await fetchLineProfile(params)).toEqual({
      ok: false,
      reason: "token_401_invalid_client",
    });
  });
  it("names the other steps", async () => {
    answers({ status: 200, body: {} });
    expect(await fetchLineProfile(params)).toEqual({
      ok: false,
      reason: "token_no_id_token",
    });
    answers(
      { status: 200, body: { id_token: "t" } },
      { status: 400, body: { error: "invalid_request" } },
    );
    expect(await fetchLineProfile(params)).toEqual({
      ok: false,
      reason: "verify_400_invalid_request",
    });
    answers(
      { status: 200, body: { id_token: "t" } },
      { status: 200, body: { sub: "U1", aud: "999" } },
    );
    expect(await fetchLineProfile(params)).toEqual({
      ok: false,
      reason: "verify_wrong_channel",
    });
    answers(
      { status: 200, body: { id_token: "t" } },
      { status: 200, body: { sub: "U1", aud: "123", nonce: "other" } },
    );
    expect(await fetchLineProfile(params)).toEqual({
      ok: false,
      reason: "verify_nonce",
    });
  });
  it("a network failure is a reason, not a crash, and the reason is always a safe tag", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNRESET at 10.0.0.1 with secret=abc");
    });
    expect(await fetchLineProfile(params)).toEqual({
      ok: false,
      reason: "token_network",
    });
    answers({ status: 400, body: { error: "<script>alert(1)</script>" } });
    const r = await fetchLineProfile(params);
    expect(!r.ok && r.reason).toBe("token_400_unknown");
  });
});
