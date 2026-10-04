import type { NextRequest } from "next/server";
import { parseStoredItems } from "@/lib/food/food";
import { cardResponse, foodCard } from "@/lib/share/render";
import { cardDict, cardHost, noStore, trackShare } from "@/lib/share/route";
import { foodCardData } from "@/lib/share/share";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A saved meal as a card: dish names and an approximate energy figure — never the photo. Owner only. */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/share/food/[id]">,
) {
  const { id } = await ctx.params;
  if (!UUID.test(id))
    return new Response(null, { status: 404, headers: noStore });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401, headers: noStore });

  const { data: meal } = await supabase
    .from("meal_logs")
    .select("items, kcal")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .eq("status", "confirmed")
    .maybeSingle<{ items: unknown; kcal: number }>();
  if (!meal) return new Response(null, { status: 404, headers: noStore });

  const data = foodCardData(parseStoredItems(meal.items), meal.kcal);
  if (data.names.length === 0)
    return new Response(null, { status: 404, headers: noStore });
  const t = await cardDict(req);
  await trackShare(req, "food", auth.user.id);
  return cardResponse(foodCard(t, cardHost(), data), "private");
}
