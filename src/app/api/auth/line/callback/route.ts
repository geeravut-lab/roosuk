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

  const finish = (path: string, errorCode?: string) => {
    const url = new URL(path, origin);
    if (errorCode) url.searchParams.set("error", errorCode);
    const response = NextResponse.redirect(url);
    response.cookies.set(LINE_COOKIE, "", {
      path: "/api/auth/line",
      maxAge: 0,
    });
    return response;
  };

  const env = getLineLoginEnv();
  if (!env) return finish("/auth", "err_line_unavailable");

  const { searchParams } = request.nextUrl;
  const cookie = parseLineCookie(request.cookies.get(LINE_COOKIE)?.value);
  const code = searchParams.get("code");
  if (
    searchParams.get("error") ||
    !code ||
    !cookie ||
    !statesMatch(cookie.state, searchParams.get("state"))
  ) {
    return finish("/auth", "err_line_failed");
  }

  const profile = await fetchLineProfile({
    code,
    redirectUri: `${origin}/api/auth/line/callback`,
    channelId: env.channelId,
    channelSecret: env.channelSecret,
    nonce: cookie.nonce,
  });
  if (!profile) return finish("/auth", "err_line_failed");

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("line_links")
    .select("user_id")
    .eq("line_sub", profile.sub)
    .maybeSingle<{ user_id: string }>();
  if (lookupError) return finish("/auth", "err_line_failed");

  const linkRow = (userId: string) => ({
    user_id: userId,
    line_sub: profile.sub,
    display_name: profile.name,
    picture_url: profile.picture,
  });

  if (cookie.mode === "link") {
    const user = await getCurrentUser();
    if (!user) return finish("/auth", "err_not_signed_in");
    if (existing && existing.user_id !== user.id)
      return finish("/settings", "err_line_already_linked");

    const { data, error } = await admin
      .from("line_links")
      .upsert(linkRow(user.id), { onConflict: "user_id" })
      .select("user_id");
    if (error || data?.length !== 1)
      return finish("/settings", "err_save_failed");
    return finish(cookie.next);
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
    if (createError || !created.user) return finish("/auth", "err_line_failed");
    userId = created.user.id;

    const { data: inserted, error: insertError } = await admin
      .from("line_links")
      .insert(linkRow(userId))
      .select("user_id");
    if (insertError || inserted?.length !== 1) {
      // Don't leave an orphan account that could never sign in again.
      await admin.auth.admin.deleteUser(userId);
      return finish("/auth", "err_line_failed");
    }
  }

  // Mint a session: generate a one-time magic-link token for this user and
  // redeem it immediately on the server, which sets the session cookies.
  const { data: found } = await admin.auth.admin.getUserById(userId);
  const email = found.user?.email;
  if (!email) return finish("/auth", "err_line_failed");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return finish("/auth", "err_line_failed");

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (verifyError) return finish("/auth", "err_line_failed");

  return finish(cookie.next);
}
