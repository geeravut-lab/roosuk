import { randomBytes } from "node:crypto";

/**
 * LINE Login (OpenID Connect) helpers. Supabase has no built-in LINE provider,
 * so we run the authorization-code flow ourselves and then mint a Supabase
 * session on the server (see src/app/api/auth/line/callback/route.ts).
 * Docs: https://developers.line.biz/en/docs/line-login/integrate-line-login/
 */

export const LINE_AUTHORIZE_URL =
  "https://access.line.me/oauth2/v2.1/authorize";
export const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
export const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

/**
 * LINE does not always return an email, and we never merge accounts by email
 * (account-takeover risk), so each LINE user gets a synthetic, non-deliverable
 * address of their own. `.invalid` is a reserved TLD that can never resolve.
 * ⚠ Verify on the first live test that Supabase accepts it.
 */
export const LINE_EMAIL_DOMAIN = "line-users.roosuk.invalid";

export function lineSyntheticEmail(lineSub: string): string {
  return `line_${lineSub.toLowerCase()}@${LINE_EMAIL_DOMAIN}`;
}

export function isLineSyntheticEmail(
  email: string | null | undefined,
): boolean {
  return !!email && email.endsWith(`@${LINE_EMAIL_DOMAIN}`);
}

export type LineMode = "login" | "link";

export interface LineOAuthCookie {
  state: string;
  nonce: string;
  mode: LineMode;
  next: string;
}

export const LINE_COOKIE = "roosuk_line_oauth";

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function buildLineAuthorizeUrl(params: {
  channelId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const url = new URL(LINE_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.channelId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("nonce", params.nonce);
  return url.toString();
}

/** Constant-time-ish equality for the state check. */
export function statesMatch(
  expected: string | undefined,
  actual: string | null,
): boolean {
  if (!expected || !actual || expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

export function parseLineCookie(
  raw: string | undefined,
): LineOAuthCookie | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LineOAuthCookie>;
    if (
      typeof v.state === "string" &&
      typeof v.nonce === "string" &&
      (v.mode === "login" || v.mode === "link") &&
      typeof v.next === "string"
    ) {
      return { state: v.state, nonce: v.nonce, mode: v.mode, next: v.next };
    }
  } catch {
    // fall through
  }
  return null;
}

export interface LineProfile {
  sub: string;
  name: string | null;
  picture: string | null;
}

async function postForm(
  url: string,
  body: Record<string, string>,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
}

export type LineProfileResult =
  { ok: true; profile: LineProfile } | { ok: false; reason: string };

/** A short, safe tag for an error code coming back from LINE (never its free text). */
const tag = (v: unknown) =>
  typeof v === "string" && /^[a-z0-9_]{1,30}$/i.test(v)
    ? v.toLowerCase()
    : "unknown";

async function lineError(
  res: Response,
): Promise<{ code: string; text: string }> {
  try {
    const j = (await res.json()) as {
      error?: unknown;
      error_description?: unknown;
    };
    return {
      code: tag(j.error),
      text:
        typeof j.error_description === "string"
          ? j.error_description.slice(0, 200)
          : "",
    };
  } catch {
    return { code: "unknown", text: "" };
  }
}

/**
 * Exchange the authorization code, then have LINE verify the ID token. On failure
 * the result says WHICH step failed (`reason`, a short safe tag shown to the user
 * and logged with LINE's own description) — "it just didn't work" is undebuggable.
 */
export async function fetchLineProfile(params: {
  code: string;
  redirectUri: string;
  channelId: string;
  channelSecret: string;
  nonce: string;
}): Promise<LineProfileResult> {
  const fail = (reason: string, detail = ""): LineProfileResult => {
    console.error(
      `[line] sign-in failed at ${reason}${detail ? `: ${detail}` : ""}`,
    );
    return { ok: false, reason };
  };

  let tokenRes: Response;
  try {
    tokenRes = await postForm(LINE_TOKEN_URL, {
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.channelId,
      client_secret: params.channelSecret,
    });
  } catch (err) {
    return fail(
      "token_network",
      String((err as Error)?.message ?? err).slice(0, 120),
    );
  }
  if (!tokenRes.ok) {
    const e = await lineError(tokenRes);
    // invalid_grant + "redirect_uri" = the callback URL differs from the one registered in the LINE console;
    // invalid_client = wrong Channel ID / Channel secret.
    return fail(
      `token_${tokenRes.status}_${e.code}`,
      `${e.code} ${e.text} (redirect_uri=${params.redirectUri})`,
    );
  }
  const token = (await tokenRes.json()) as { id_token?: string };
  if (!token.id_token)
    return fail("token_no_id_token", "the openid scope was not granted");

  let verifyRes: Response;
  try {
    verifyRes = await postForm(LINE_VERIFY_URL, {
      id_token: token.id_token,
      client_id: params.channelId,
      nonce: params.nonce,
    });
  } catch (err) {
    return fail(
      "verify_network",
      String((err as Error)?.message ?? err).slice(0, 120),
    );
  }
  if (!verifyRes.ok) {
    const e = await lineError(verifyRes);
    return fail(`verify_${verifyRes.status}_${e.code}`, `${e.code} ${e.text}`);
  }
  const claims = (await verifyRes.json()) as {
    sub?: string;
    aud?: string;
    nonce?: string;
    name?: string;
    picture?: string;
  };
  if (!claims.sub) return fail("verify_no_sub");
  if (claims.aud !== params.channelId) return fail("verify_wrong_channel");
  if (claims.nonce !== undefined && claims.nonce !== params.nonce)
    return fail("verify_nonce");

  return {
    ok: true,
    profile: {
      sub: claims.sub,
      name: claims.name ?? null,
      picture: claims.picture ?? null,
    },
  };
}
