import { NextResponse, type NextRequest } from "next/server";
import { planSpec } from "@/lib/billing/specs.server";
import { tierForAdmin } from "@/lib/billing/entitlement.server";
import { featureEnabled } from "@/lib/flags/server";
import { hashToken } from "@/lib/passport/passport";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestObservations } from "@/lib/wearables/server";
import { MAX_BATCH, isConsentSource, parseBearer } from "@/lib/wearables/types";

/**
 * The ingestion API: `POST /api/wearables/ingest` with `Authorization: Bearer rsk_…`
 * and `{ "source": "health_connect", "observations": [{ "type", "value", "start", "end"?, "device"?, "external_id"? }] }`.
 * The token belongs to one person and carries no rights beyond adding readings for
 * them; the source must hold that person's consent; the plan decides which types
 * are stored. Re-sending the same reading is harmless (same source + id = one row).
 */
const MAX_BODY = 1_000_000;
const json = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!(await featureEnabled("wearables")))
    return json({ error: "feature_off" }, 503);
  const secret = parseBearer(request.headers.get("authorization"));
  if (!secret) return json({ error: "unauthorized" }, 401);

  const db = createAdminClient();
  const { data: token } = await db
    .from("ingest_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hashToken(secret))
    .maybeSingle<{ id: string; user_id: string; revoked_at: string | null }>();
  if (!token || token.revoked_at) return json({ error: "unauthorized" }, 401);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "too_large" }, 413);
  let body: { source?: unknown; observations?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (
    !isConsentSource(body.source) ||
    !Array.isArray(body.observations) ||
    body.observations.length === 0 ||
    body.observations.length > MAX_BATCH
  )
    return json({ error: "bad_request", max: MAX_BATCH }, 400);

  const tier = (await planSpec(await tierForAdmin(token.user_id))).wearables;
  if (tier === "none") return json({ error: "plan" }, 403);

  const out = await ingestObservations(
    token.user_id,
    tier,
    body.source,
    body.observations,
  );
  if (!out.ok)
    return json(
      { error: out.error === "err_wearable_consent" ? "consent" : "server" },
      out.error === "err_wearable_consent" ? 403 : 500,
    );
  await db
    .from("ingest_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", token.id);
  return json(out.result, 200);
}
