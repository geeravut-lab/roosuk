import { NextResponse, type NextRequest } from "next/server";
import { getOrigin } from "@/lib/http/origin";
import { REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/rewards/rewards";

/**
 * An invite link: remember the code for a week, then go to the front page. The
 * code is only attached to an account once that person finishes consent, and
 * only if it is a real code of someone else (the database checks).
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;
  const origin = await getOrigin();
  const response = NextResponse.redirect(`${origin}/`);
  const clean = normalizeReferralCode(code);
  if (clean)
    response.cookies.set(REFERRAL_COOKIE, clean, {
      path: "/",
      maxAge: 7 * 24 * 3600,
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https"),
    });
  return response;
}
