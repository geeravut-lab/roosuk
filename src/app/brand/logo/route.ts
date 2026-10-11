import type { NextRequest } from "next/server";
import { serveBrandImage } from "@/lib/brand/serve";

export function GET(req: NextRequest) {
  return serveBrandImage(req, "logo", "/brand/logo-mark.png");
}
