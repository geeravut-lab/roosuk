"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { backTarget } from "@/config/nav";
import { fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";

/** A link up to the parent page (see backTarget), for devices without a back button. */
export function BackLink() {
  const { t } = useI18n();
  const raw = usePathname();
  const from = useSearchParams().get("from");
  // /preview/* mirrors real pages for the layout tests
  const pathname = raw.replace(/^\/preview(?=\/)/, "");
  const target = backTarget(pathname, from);
  if (!target) return null;
  return (
    <Link
      href={target.href}
      className="text-primary-strong hover:bg-tint-primary mb-2 -ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[15px] font-semibold"
    >
      <ChevronLeft className="size-5 shrink-0" aria-hidden />
      {fmt(t.backTo, { page: t[target.label] })}
    </Link>
  );
}
