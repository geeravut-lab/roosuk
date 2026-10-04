/**
 * Netlify scheduled function: every 10 minutes it asks the app to run its tick
 * (reminders + sending the LINE queue). The work itself lives in the Next.js
 * route so it shares code, settings and database access with everything else.
 * Needs CRON_SECRET in the Netlify environment; Netlify provides URL.
 */
export default async function handler(): Promise<Response> {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response("not configured", { status: 503 });
  const res = await fetch(`${base}/api/cron/notify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  return new Response(await res.text(), { status: res.status });
}

export const config = { schedule: "*/10 * * * *" };
