import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { isAdminUser, requireUser } from "@/lib/auth/server";
import { isConsentCurrent } from "@/lib/consent/consent";
import { getLatestConsent } from "@/lib/consent/server";
import { loadPlatformSettings } from "@/lib/settings/server";

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

  const [isAdmin, settings] = await Promise.all([
    isAdminUser(user.id),
    loadPlatformSettings(),
  ]);
  const meta = user.user_metadata as { full_name?: string } | undefined;
  const displayName =
    meta?.full_name?.trim() || user.email?.split("@")[0] || "";

  return (
    <AppShell
      isAdmin={isAdmin}
      manualUrl={settings.manualUrl}
      displayName={displayName}
    >
      {children}
    </AppShell>
  );
}
