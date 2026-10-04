import { NextResponse, type NextRequest } from "next/server";
import { readSourceFile } from "@/lib/files/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves a kept source file to its owner, decrypted on the fly. Ownership is
 * decided by the user's own RLS-limited client (their session cookie), so
 * another user's id gives the same 404 as an id that does not exist. Never
 * cached: the plaintext must not sit in a shared or browser cache.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/files/[id]">,
) {
  const { id } = await ctx.params;
  const none = () =>
    new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!UUID.test(id)) return none();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return new NextResponse(null, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });

  const { data: row } = await supabase
    .from("source_files")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle<{ id: string }>();
  if (!row) return none();

  const file = await readSourceFile(auth.user.id, id);
  if (!file) return none();
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      // The type is one of four we verified by content when it was stored.
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
