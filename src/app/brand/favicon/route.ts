import type { NextRequest } from "next/server";
import { serveBrandImage } from "@/lib/brand/serve";

export function GET(req: NextRequest) {
  const apple = req.nextUrl.searchParams.get("apple") === "1";
  return serveBrandImage(
    req,
    "favicon",
    apple ? "/brand/apple-default.png" : "/brand/favicon-default.png",
  );
}
