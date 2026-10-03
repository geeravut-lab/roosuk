import "server-only";
import { headers } from "next/headers";
import { getConfiguredSiteUrl } from "@/lib/env";

/**
 * Public origin of this deployment, used to build OAuth redirect URLs.
 * Prefers NEXT_PUBLIC_SITE_URL; otherwise derives it from the proxy headers.
 * Spoofing the Host header cannot redirect anywhere dangerous: Supabase and
 * LINE both only accept redirect URLs registered in their dashboards.
 */
export async function getOrigin(): Promise<string> {
  const configured = getConfiguredSiteUrl();
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}
