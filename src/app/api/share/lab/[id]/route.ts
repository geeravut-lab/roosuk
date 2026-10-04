import type { NextRequest } from "next/server";
import { parseStoredLabItems } from "@/lib/lab/lab";
import { cardResponse, labCard } from "@/lib/share/render";
import { cardDict, cardHost, noStore, trackShare } from "@/lib/share/route";
import { labCardData } from "@/lib/share/share";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A saved lab report as a summary card (counts only — no names, values or markers). Owner only. */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/share/lab/[id]">,
) {
  const { id } = await ctx.params;
  if (!UUID.test(id))
    return new Response(null, { status: 404, headers: noStore });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401, headers: noStore });

  const { data: report } = await supabase
    .from("lab_reports")
    .select("items, collected_on")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .eq("status", "confirmed")
    .maybeSingle<{ items: unknown; collected_on: string | null }>();
  if (!report) return new Response(null, { status: 404, headers: noStore });

  const data = labCardData(
    parseStoredLabItems(report.items),
    report.collected_on,
  );
  if (data.assessed === 0)
    return new Response(null, { status: 404, headers: noStore });
  const t = await cardDict(req);
  await trackShare(req, "lab", auth.user.id);
  return cardResponse(labCard(t, cardHost(), data), "private");
}
