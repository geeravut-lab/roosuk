import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { BrandImageKind } from "./brand";
import { readBrandImage, loadBrand } from "./server";

/**
 * Serves the admin's logo / tab icon, or sends the browser to the built-in picture. Public on
 * purpose (the sign-in page needs it) and it only ever returns the one image the admin set.
 * Browsers re-check after a minute by ETag, so a new upload shows up quickly without the bytes
 * being read from storage on every page view.
 */
export async function serveBrandImage(
  req: NextRequest,
  kind: BrandImageKind,
  fallback: string,
): Promise<NextResponse> {
  const brand = await loadBrand();
  const ref = brand[kind];
  const toDefault = () =>
    NextResponse.redirect(new URL(fallback, req.url), {
      status: 307,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  if (!ref) return toDefault();
  const etag = `"${kind}-${ref.version}"`;
  const cache = "public, max-age=60, must-revalidate";
  if (req.headers.get("if-none-match") === etag)
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": cache },
    });
  const img = await readBrandImage(kind);
  if (!img) return toDefault();
  return new NextResponse(Buffer.from(img.bytes), {
    headers: {
      "Content-Type": img.mime,
      ETag: etag,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
