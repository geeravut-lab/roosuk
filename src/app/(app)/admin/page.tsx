import type { Metadata } from "next";
import Link from "next/link";
import { ToggleLeft } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminTitle };
}

export default async function AdminHome() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">{t.adminTitle}</h1>
      <Link
        href="/admin/flags"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <ToggleLeft className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminFlagsTitle}</span>
      </Link>
    </div>
  );
}
