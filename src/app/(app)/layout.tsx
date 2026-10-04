import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { isAdminUser, requireUser } from "@/lib/auth/server";
import { getBillingProfile } from "@/lib/billing/profile.server";
import { startTrialIfEligible } from "@/lib/billing/trial.server";
import { isConsentCurrent } from "@/lib/consent/consent";
import { getLatestConsent } from "@/lib/consent/server";
import { loadPlatformSettings } from "@/lib/settings/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything signed-in lives under here. Besides the proxy's redirect, this is
 * where it is enforced: no user → /auth, no current consent → /consent.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!isConsentCurrent(await getLatestConsent(user.id))) redirect("/consent");

  // Self-heal: consent is done but the trial never started (e.g. the consent
  // request failed to start it, or the account predates trials). Idempotent.
  // Pages rendered in this same request may still show the old state once.
  const billing = await getBillingProfile(user.id);
  if (billing && !billing.trial_started_at) {
    try {
      await startTrialIfEligible(user.id);
    } catch (err) {
      console.error("[trial] self-heal failed:", err);
    }
  }

  const [isAdmin, settings] = await Promise.all([
    isAdminUser(user.id),
    loadPlatformSettings(),
  ]);
  // Unread count for the bell, read with the user's own client (RLS: own rows only).
  const { count: unread } = await (
    await createClient()
  )
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  const meta = user.user_metadata as { full_name?: string } | undefined;
  const displayName =
    meta?.full_name?.trim() || user.email?.split("@")[0] || "";

  return (
    <AppShell
      isAdmin={isAdmin}
      manualUrl={settings.manualUrl}
      displayName={displayName}
      unreadCount={unread ?? 0}
    >
      {children}
    </AppShell>
  );
}
