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
  ShieldCheck,
  Stethoscope,
  Tags,
  Timer,
  ToggleLeft,
  type LucideIcon,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminsCard } from "./_admins/AdminsCard";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminTitle };
}

interface Card {
  href: string;
  icon: LucideIcon;
  title: string;
  badge?: string | null;
}

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const self = await requireAdmin();
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const db = createAdminClient();
  const waiting = (table: string, col: string, val: string | boolean) =>
    db.from(table).select(col, { count: "exact", head: true }).eq(col, val);
  const [
    t,
    { count },
    { count: leads },
    { count: unknownLabs },
    { count: kycReview },
    { count: licenses },
  ] = await Promise.all([
    getT(),
    waiting("payments", "status", "review"),
    waiting("checkup_leads", "status", "new"),
    waiting("lab_unknown_markers", "status", "new"),
    waiting("ekyc_verifications", "status", "review"),
    waiting("pharmacists", "license_verified", false),
  ]);

  const groups: { title: string; cards: Card[] }[] = [
    {
      title: t.adminGroupQueue,
      cards: [
        {
          href: "/admin/payments",
          icon: ReceiptText,
          title: t.adminPaymentsTitle,
          badge: count ? fmt(t.adminPaymentsPending, { n: count }) : null,
        },
        {
          href: "/admin/leads",
          icon: Stethoscope,
          title: t.adminLeadsTitle,
          badge: leads ? fmt(t.adminLeadsOpen, { n: leads }) : null,
        },
        {
          href: "/admin/ekyc",
          icon: ShieldCheck,
          title: t.adminEkycTitle,
          badge: kycReview ? fmt(t.adminEkycQueue, { n: kycReview }) : null,
        },
        {
          href: "/admin/telepharmacy",
          icon: Stethoscope,
          title: t.adminTeleTitle,
          badge: licenses
            ? fmt(t.adminTeleLicensesOpen, { n: licenses })
            : null,
        },
        {
          href: "/admin/biomarkers",
          icon: FlaskConical,
          title: t.adminBiomarkersTitle,
          badge: unknownLabs
            ? fmt(t.adminBiomarkersQueue, { n: unknownLabs })
            : null,
        },
      ],
    },
    {
      title: t.adminGroupMoney,
      cards: [
        { href: "/admin/plans", icon: Tags, title: t.adminPlansTitle },
        { href: "/admin/rewards", icon: Gift, title: t.adminRewardsTitle },
        { href: "/admin/paywall", icon: Split, title: t.adminPaywallTitle },
      ],
    },
    {
      title: t.adminGroupShop,
      cards: [
        { href: "/admin/shop", icon: ShoppingBag, title: t.adminShopTitle },
        { href: "/admin/corporate", icon: Building2, title: t.adminCorpTitle },
        {
          href: "/admin/creators",
          icon: Megaphone,
          title: t.adminCreatorsTitle,
        },
      ],
    },
    {
      title: t.adminGroupAi,
      cards: [
        { href: "/admin/ai", icon: Bot, title: t.adminAiTitle },
        { href: "/admin/prompts", icon: FileText, title: t.adminPromptsTitle },
        { href: "/admin/manual", icon: BookOpen, title: t.adminManualTitle },
      ],
    },
    {
      title: t.adminGroupSystem,
      cards: [
        {
          href: "/admin/analytics",
          icon: ChartColumn,
          title: t.adminAnalyticsTitle,
        },
        { href: "/admin/rules", icon: Timer, title: t.adminRulesTitle },
        { href: "/admin/flags", icon: ToggleLeft, title: t.adminFlagsTitle },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">{t.adminTitle}</h1>
      {groups.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="text-muted text-sm font-semibold">{g.title}</h2>
          {g.cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="card hover:bg-tint-primary flex items-center gap-3"
            >
              <c.icon className="text-primary-strong size-6" aria-hidden />
              <span className="font-semibold">{c.title}</span>
              {c.badge ? (
                <span className="bg-coral text-on-accent ml-auto rounded-full px-2.5 py-1 text-xs font-semibold">
                  {c.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </section>
      ))}
      <AdminsCard
        selfId={self.id}
        error={error}
        revoked={sp.admins === "revoked"}
      />
    </div>
  );
}
