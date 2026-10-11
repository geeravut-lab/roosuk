import "server-only";
import type { NextRequest } from "next/server";
import { trackEvent } from "@/lib/analytics/server";
import { getConfiguredSiteUrl } from "@/lib/env";
import { isLang, type Dict } from "@/lib/i18n/dict";
import { brandedDict, getT } from "@/lib/i18n/server";
import { siteHost } from "./share";

/** Language for a card: an explicit ?lang=, else the visitor's cookie. */
export async function cardDict(req: NextRequest): Promise<Dict> {
  const lang = req.nextUrl.searchParams.get("lang");
  return isLang(lang) ? brandedDict(lang) : getT();
}

export const cardHost = () => siteHost(getConfiguredSiteUrl());

/** The share button adds ?share=1; merely previewing the card is not counted as sharing it. */
export async function trackShare(
  req: NextRequest,
  kind: "quiz" | "lab" | "food",
  userId: string | null,
) {
  if (req.nextUrl.searchParams.get("share") === "1")
    await trackEvent("share_made", userId, kind);
}

export const noStore = { "Cache-Control": "private, no-store" } as const;
