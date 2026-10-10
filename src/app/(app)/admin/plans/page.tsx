import type { Metadata } from "next";
import { PLAN_IDS, type Plan, type PlanId } from "@/config/plans";
import { resolvePlanSpec } from "@/lib/billing/specs";
import { getT } from "@/lib/i18n/server";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";
import { PlansForm } from "./PlansForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminPlansTitle };
}

export default async function AdminPlansPage() {
  invalidatePlatformSettingsCache(); // admins see the truth, not a cached copy
  const [t, { billing }] = await Promise.all([getT(), loadPlatformSettings()]);
  const specs = Object.fromEntries(
    PLAN_IDS.map((id) => [id, resolvePlanSpec(id, billing)]),
  ) as Record<PlanId, Plan>;
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminPlansTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminPlansHint}</p>
      </div>
      <PlansForm billing={billing} specs={specs} />
    </div>
  );
}
