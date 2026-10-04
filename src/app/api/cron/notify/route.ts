import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runTick } from "@/lib/notify/server";

export const dynamic = "force-dynamic";

/** Constant-time comparison so the secret cannot be guessed from response timing. */
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The scheduled tick (netlify/functions/notify-tick.mts calls this every 10
 * minutes): write due reminders into the queue, then send the queue to LINE.
 * Closed unless CRON_SECRET is set and presented — it must never be a public
 * button that sends messages.
 */
async function handle(req: Request) {
  if (!process.env.CRON_SECRET?.trim())
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!authorised(req))
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runTick()) });
  } catch (err) {
    console.error("[tick] failed:", err);
    return NextResponse.json({ error: "tick_failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
