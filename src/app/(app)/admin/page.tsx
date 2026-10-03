import type { Metadata } from "next";
import Link from "next/link";
import { Bot, ReceiptText, ToggleLeft } from "lucide-react";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminTitle };
}

export default async function AdminHome() {
  const [t, { count }] = await Promise.all([
    getT(),
    createAdminClient()
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "review"),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">{t.adminTitle}</h1>
      <Link
        href="/admin/payments"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <ReceiptText className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminPaymentsTitle}</span>
        {count ? (
          <span className="bg-coral text-foreground ml-auto rounded-full px-2.5 py-1 text-xs font-semibold">
            {fmt(t.adminPaymentsPending, { n: count })}
          </span>
        ) : null}
      </Link>
      <Link
        href="/admin/ai"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Bot className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminAiTitle}</span>
      </Link>
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
