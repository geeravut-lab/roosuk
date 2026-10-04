import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  ChartColumn,
  BookOpen,
  FileText,
  Gift,
  Split,
  FlaskConical,
  ReceiptText,
  ShoppingBag,
  Building2,
  Megaphone,
  Stethoscope,
  Timer,
  ToggleLeft,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminsCard } from "./_admins/AdminsCard";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminTitle };
}

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const self = await requireAdmin();
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const db = createAdminClient();
  const [t, { count }, { count: leads }, { count: unknownLabs }] =
    await Promise.all([
      getT(),
      db
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "review"),
      db
        .from("checkup_leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
      db
        .from("lab_unknown_markers")
        .select("normalized_name", { count: "exact", head: true })
        .eq("status", "new"),
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
          <span className="bg-coral text-on-accent ml-auto rounded-full px-2.5 py-1 text-xs font-semibold">
            {fmt(t.adminPaymentsPending, { n: count })}
          </span>
        ) : null}
      </Link>
      <Link
        href="/admin/leads"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Stethoscope className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminLeadsTitle}</span>
        {leads ? (
          <span className="bg-coral text-on-accent ml-auto rounded-full px-2.5 py-1 text-xs font-semibold">
            {fmt(t.adminLeadsOpen, { n: leads })}
          </span>
        ) : null}
      </Link>
      <Link
        href="/admin/shop"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <ShoppingBag className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminShopTitle}</span>
      </Link>
      <Link
        href="/admin/corporate"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Building2 className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminCorpTitle}</span>
      </Link>
      <Link
        href="/admin/creators"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Megaphone className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminCreatorsTitle}</span>
      </Link>
      <Link
        href="/admin/biomarkers"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <FlaskConical className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminBiomarkersTitle}</span>
        {unknownLabs ? (
          <span className="bg-coral text-on-accent ml-auto rounded-full px-2.5 py-1 text-xs font-semibold">
            {fmt(t.adminBiomarkersQueue, { n: unknownLabs })}
          </span>
        ) : null}
      </Link>
      <Link
        href="/admin/rewards"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Gift className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminRewardsTitle}</span>
      </Link>
      <Link
        href="/admin/paywall"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Split className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminPaywallTitle}</span>
      </Link>
      <Link
        href="/admin/analytics"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <ChartColumn className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminAnalyticsTitle}</span>
      </Link>
      <Link
        href="/admin/ai"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Bot className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminAiTitle}</span>
      </Link>
      <Link
        href="/admin/prompts"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <FileText className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminPromptsTitle}</span>
      </Link>
      <Link
        href="/admin/manual"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <BookOpen className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminManualTitle}</span>
      </Link>
      <Link
        href="/admin/rules"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <Timer className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminRulesTitle}</span>
      </Link>
      <Link
        href="/admin/flags"
        className="card hover:bg-tint-primary flex items-center gap-3"
      >
        <ToggleLeft className="text-primary-strong size-6" aria-hidden />
        <span className="font-semibold">{t.adminFlagsTitle}</span>
      </Link>
      <AdminsCard
        selfId={self.id}
        error={error}
        revoked={sp.admins === "revoked"}
      />
    </div>
  );
}
