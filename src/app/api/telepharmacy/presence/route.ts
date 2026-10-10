import { NextResponse, type NextRequest } from "next/server";
import { featureEnabled } from "@/lib/flags/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * A pharmacist's switch and heartbeat. "Free" is never what the browser says: the
 * database stores the server's clock for the last heartbeat and counts a pharmacist as
 * free only if it is recent. Going online needs a verified licence (and identity, when
 * required); the function says which one is missing.
 */
export async function POST(req: NextRequest) {
  if (!(await featureEnabled("telepharmacy")))
    return NextResponse.json({ ok: false, reason: "off" }, { status: 404, headers: NO_STORE });
  const { data: auth } = await (await createClient()).auth.getUser();
  if (!auth.user)
    return NextResponse.json({ ok: false, reason: "auth" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => null)) as { online?: unknown } | null;
  if (!body || typeof body.online !== "boolean")
    return NextResponse.json({ ok: false, reason: "input" }, { status: 400, headers: NO_STORE });
  const { data, error } = await createAdminClient().rpc("pharmacist_set_presence", {
    p_user: auth.user.id,
    p_online: body.online,
  });
  if (error)
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500, headers: NO_STORE });
  return NextResponse.json(
    { ok: data === "ok", reason: data },
    { status: data === "not_pharmacist" ? 404 : 200, headers: NO_STORE },
  );
}
