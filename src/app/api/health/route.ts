/** Liveness probe for deploy platforms and uptime monitoring. */
export function GET() {
  return Response.json({ status: "ok" });
}
