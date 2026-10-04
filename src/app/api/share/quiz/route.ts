import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { cardResponse, quizCard } from "@/lib/share/render";
import { cardDict, cardHost, trackShare } from "@/lib/share/route";
import { parseQuizCard } from "@/lib/share/share";

export const dynamic = "force-dynamic";

/**
 * Quiz card — public on purpose (the quiz is the front door and anonymous
 * visitors share it too). It only draws the three numbers in the URL, and only
 * if they are a plausible quiz outcome; nothing is read from or stored about anyone.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const data = parseQuizCard({
    score: sp.get("score"),
    health: sp.get("health"),
    real: sp.get("real"),
  });
  if (!data) return new Response(null, { status: 400 });
  const [t, user] = await Promise.all([cardDict(req), getCurrentUser()]);
  await trackShare(req, "quiz", user?.id ?? null);
  return cardResponse(quizCard(t, cardHost(), data), "public");
}
