import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv, hasPublicEnv } from "@/lib/env";

export interface SessionResult {
  response: NextResponse;
  /** Signed-in user id (verified JWT claims), or null. */
  userId: string | null;
  configured: boolean;
}

/**
 * Refreshes the Supabase session cookies for this request and reports who is
 * signed in. Called from src/proxy.ts. Authorisation is re-checked in the
 * layouts / actions — the proxy is only the first, cheap line of defence.
 */
export async function updateSession(
  request: NextRequest,
): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  if (!hasPublicEnv()) return { response, userId: null, configured: false };

  const env = getPublicEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not put code between createServerClient and getClaims: it validates the
  // token and triggers the cookie refresh above.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return {
    response,
    userId: typeof sub === "string" ? sub : null,
    configured: true,
  };
}

/** Redirect while keeping any refreshed session cookies. */
export function redirectWithCookies(
  request: NextRequest,
  from: NextResponse,
  pathname: string,
  search?: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  for (const [k, v] of Object.entries(search ?? {})) url.searchParams.set(k, v);
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
