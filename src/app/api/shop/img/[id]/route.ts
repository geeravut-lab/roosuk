import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { readProductImage } from "@/lib/shop/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A product photo, for signed-in people. An image's id never changes what it shows, so browsers may keep it. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/shop/img/[id]">,
) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  if (!(await getCurrentUser())) return new NextResponse(null, { status: 401 });
  const img = await readProductImage(id);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(img.bytes, {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
