import type { NextRequest } from "next/server";
import { serveBrandImage } from "@/lib/brand/serve";

/** Crawlers and old browsers ask for /favicon.ico directly. */
export function GET(req: NextRequest) {
  return serveBrandImage(req, "favicon", "/brand/favicon-default.ico");
}
