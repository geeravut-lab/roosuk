import type { Metadata } from "next";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RewardForm } from "./RewardForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminRewardsTitle };
}

export default async function AdminRewardsPage() {
  invalidatePlatformSettingsCache(); // admins see the truth, not a cached copy
  const db = createAdminClient();
  const [t, { rewards }, ledger, invited, qualified] = await Promise.all([
    getT(),
    loadPlatformSettings(),
    db
      .from("reward_ledger")
      .select("amount_thb, kind")
      .limit(50_000)
      .returns<{ amount_thb: number; kind: string }[]>(),
    db.from("referrals").select("referee_id", { count: "exact", head: true }),
    db
      .from("referrals")
      .select("referee_id", { count: "exact", head: true })
      .not("qualified_at", "is", null),
  ]);
  const rows = ledger.data ?? [];
  const sum = (f: (r: { amount_thb: number; kind: string }) => boolean) =>
    rows.filter(f).reduce((n, r) => n + r.amount_thb, 0);
  const outstanding = sum(() => true);
  const granted = sum((r) => r.amount_thb > 0 && r.kind !== "redeem_refund");
  const spent =
    -sum((r) => r.kind.startsWith("redeem_") && r.amount_thb < 0) -
    sum((r) => r.kind === "redeem_refund");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminRewardsTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminRewardsHint}</p>
      </div>
      <section className="card space-y-1" aria-labelledby="rw-sum">
        <h2 id="rw-sum" className="font-semibold">
          {t.adminRewardsSummary}
        </h2>
        <p className="text-sm">
          {fmt(t.adminRewardsOutstanding, { n: outstanding })}
        </p>
        <p className="text-sm">
          {fmt(t.adminRewardsGranted, { n: granted, spent })}
        </p>
        <p className="text-sm">
          {fmt(t.adminRewardsReferrals, {
            invited: invited.count ?? 0,
            done: qualified.count ?? 0,
          })}
        </p>
      </section>
      <div className="card">
        <RewardForm current={rewards} />
      </div>
    </div>
  );
}
