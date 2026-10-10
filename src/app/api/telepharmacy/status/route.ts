import { NextResponse, type NextRequest } from "next/server";
import { featureEnabled } from "@/lib/flags/server";
import { consultStatusFor } from "@/lib/telepharmacy/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The waiting screen asks "what is my call's state?" every few seconds. Only the
 * signed-in owner gets an answer, the access key travels in the body (never in a URL
 * that could land in a log), and the room link is included only when the key matches
 * and a pharmacist has taken the call. Anything else is the same 404.
 */
export async function POST(req: NextRequest) {
  if (!(await featureEnabled("telepharmacy")))
    return NextResponse.json(
      { error: "off" },
      { status: 404, headers: NO_STORE },
    );
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json(
      { error: "auth" },
      { status: 401, headers: NO_STORE },
    );
  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    key?: unknown;
  } | null;
  if (!body || typeof body.id !== "string" || !UUID.test(body.id))
    return NextResponse.json(
      { error: "none" },
      { status: 404, headers: NO_STORE },
    );
  const meta = auth.user.user_metadata as { full_name?: string } | undefined;
  const name = meta?.full_name?.trim() || auth.user.email?.split("@")[0] || "";
  const view = await consultStatusFor(auth.user.id, body.id, body.key, name);
  if (!view)
    return NextResponse.json(
      { error: "none" },
      { status: 404, headers: NO_STORE },
    );
  return NextResponse.json(view, { headers: NO_STORE });
}
