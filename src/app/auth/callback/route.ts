import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/utils";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Target of the OAuth (Google) redirect and of email-confirmation links. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const fail = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = "?error=err_oauth_failed";
    return NextResponse.redirect(url);
  };

  if (!code || !hasPublicEnv()) return fail();

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail();

  const url = request.nextUrl.clone();
  url.pathname = next;
  url.search = "";
  return NextResponse.redirect(url);
}
