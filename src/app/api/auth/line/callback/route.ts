import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getLineLoginEnv } from "@/lib/env";
import { getOrigin } from "@/lib/http/origin";
import {
  fetchLineProfile,
  lineSyntheticEmail,
  LINE_COOKIE,
  parseLineCookie,
  statesMatch,
} from "@/lib/line/login";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Step 2 of LINE Login. Verifies state + ID token, then either links the LINE
 * account to the signed-in user (mode=link) or signs the LINE user in
 * (mode=login), creating their account on first use.
 *
 * NOT yet exercised against real LINE (needs a LINE Login channel and a real
 * LINE account) — the owner tests this by hand.
 */
export async function GET(request: NextRequest) {
  const origin = await getOrigin();

  const go = (path: string, errorCode?: string, reason?: string) => {
    const url = new URL(path, origin);
    if (errorCode) url.searchParams.set("error", errorCode);
    if (reason) url.searchParams.set("reason", reason);
    const response = NextResponse.redirect(url);
    response.cookies.set(LINE_COOKIE, "", {
      path: "/api/auth/line",
      maxAge: 0,
    });
    return response;
  };

  const { searchParams } = request.nextUrl;
  const cookie = parseLineCookie(request.cookies.get(LINE_COOKIE)?.value);
  // Where a failure is shown. A signed-in user (linking) must come back to Settings:
  // /auth bounces signed-in users straight to the app, which silently dropped the error.
  const signedIn = !!(await getCurrentUser());
  const errorPath = cookie
    ? cookie.mode === "link"
      ? "/settings"
      : "/auth"
    : signedIn
      ? "/settings"
      : "/auth";
  const fail = (code: string, reason?: string) => {
    console.error(
      `[line] callback failed: ${code}${reason ? ` (${reason})` : ""}`,
    );
    return go(errorPath, code, reason);
  };

  const env = getLineLoginEnv();
  if (!env) return fail("err_line_unavailable");

  const code = searchParams.get("code");
  const lineError = searchParams.get("error");
  if (lineError) {
    // The person pressed cancel, or LINE refused (e.g. the channel is still "Developing" and this account is not a tester).
    console.error(
      `[line] LINE returned error=${lineError} description=${(searchParams.get("error_description") ?? "").slice(0, 200)}`,
    );
    return fail(
      lineError === "access_denied" ? "err_line_cancelled" : "err_line_failed",
      `line_${/^[a-z_]{1,30}$/.test(lineError) ? lineError : "error"}`,
    );
  }
  if (!cookie) return fail("err_line_expired", "no_state_cookie"); // expired (10 min), or the browser blocked the cookie
  if (!code) return fail("err_line_failed", "no_code");
  if (!statesMatch(cookie.state, searchParams.get("state")))
    return fail("err_line_expired", "state_mismatch");

  const result = await fetchLineProfile({
    code,
    redirectUri: `${origin}/api/auth/line/callback`,
    channelId: env.channelId,
    channelSecret: env.channelSecret,
    nonce: cookie.nonce,
  });
  if (!result.ok) return fail("err_line_failed", result.reason);
  const profile = result.profile;

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("line_links")
    .select("user_id")
    .eq("line_sub", profile.sub)
    .maybeSingle<{ user_id: string }>();
  if (lookupError) return fail("err_line_failed", "db_lookup");

  const linkRow = (userId: string) => ({
    user_id: userId,
    line_sub: profile.sub,
    display_name: profile.name,
    picture_url: profile.picture,
  });

  if (cookie.mode === "link") {
    const user = await getCurrentUser();
    if (!user) return go("/auth", "err_not_signed_in");
    if (existing && existing.user_id !== user.id)
      return fail("err_line_already_linked", "other_user");

    const { data, error } = await admin
      .from("line_links")
      .upsert(linkRow(user.id), { onConflict: "user_id" })
      .select("user_id");
    if (error || data?.length !== 1)
      return fail("err_save_failed", "db_link_upsert");
    return go(
      `${cookie.next}${cookie.next.includes("?") ? "&" : "?"}line=linked`,
    );
  }

  // mode === "login"
  let userId = existing?.user_id;
  if (!userId) {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: lineSyntheticEmail(profile.sub),
        email_confirm: true,
        user_metadata: {
          full_name: profile.name,
          avatar_url: profile.picture,
          provider: "line",
        },
      });
    if (createError || !created.user)
      return fail("err_line_failed", "create_user");
    userId = created.user.id;

    const { data: inserted, error: insertError } = await admin
      .from("line_links")
      .insert(linkRow(userId))
      .select("user_id");
    if (insertError || inserted?.length !== 1) {
      // Don't leave an orphan account that could never sign in again.
      await admin.auth.admin.deleteUser(userId);
      return fail("err_line_failed", "db_link_insert");
    }
  }

  // Mint a session: generate a one-time magic-link token for this user and
  // redeem it immediately on the server, which sets the session cookies.
  const { data: found } = await admin.auth.admin.getUserById(userId);
  const email = found.user?.email;
  if (!email) return fail("err_line_failed", "no_email");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return fail("err_line_failed", "session_link");

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (verifyError) return fail("err_line_failed", "session_verify");

  return go(cookie.next);
}
