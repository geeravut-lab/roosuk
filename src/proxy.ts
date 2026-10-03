import type { NextRequest } from "next/server";
import { isProtectedPath, POST_LOGIN_PATH } from "@/config/routes";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!userId && isProtectedPath(pathname)) {
    const next = pathname + request.nextUrl.search;
    return redirectWithCookies(request, response, "/auth", { next });
  }
  if (userId && pathname === "/auth") {
    return redirectWithCookies(request, response, POST_LOGIN_PATH);
  }
  return response;
}

export const config = {
  // Everything except static assets, the PWA manifest/icons, API routes and Next internals.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|brand|icons|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
