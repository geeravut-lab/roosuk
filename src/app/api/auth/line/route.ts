import { NextResponse, type NextRequest } from "next/server";
import { POST_LOGIN_PATH } from "@/config/routes";
import { safeNextPath } from "@/lib/auth/utils";
import { getCurrentUser } from "@/lib/auth/server";
import { getLineLoginEnv } from "@/lib/env";
import { getOrigin } from "@/lib/http/origin";
import {
  buildLineAuthorizeUrl,
  LINE_COOKIE,
  randomToken,
  type LineMode,
  type LineOAuthCookie,
} from "@/lib/line/login";

/** Step 1 of LINE Login: remember state/nonce in a cookie and send the user to LINE. */
export async function GET(request: NextRequest) {
  const origin = await getOrigin();
  const env = getLineLoginEnv();
  if (!env)
    return NextResponse.redirect(`${origin}/auth?error=err_line_unavailable`);

  const mode: LineMode =
    request.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
  const next = safeNextPath(
    request.nextUrl.searchParams.get("next"),
    mode === "link" ? "/settings" : POST_LOGIN_PATH,
  );

  if (mode === "link" && !(await getCurrentUser())) {
    return NextResponse.redirect(`${origin}/auth?error=err_not_signed_in`);
  }

  const payload: LineOAuthCookie = {
    state: randomToken(),
    nonce: randomToken(),
    mode,
    next,
  };
  const response = NextResponse.redirect(
    buildLineAuthorizeUrl({
      channelId: env.channelId,
      redirectUri: `${origin}/api/auth/line/callback`,
      state: payload.state,
      nonce: payload.nonce,
    }),
  );
  response.cookies.set(LINE_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax", // must be sent on the top-level redirect back from LINE
    path: "/api/auth/line",
    maxAge: 600,
  });
  return response;
}
