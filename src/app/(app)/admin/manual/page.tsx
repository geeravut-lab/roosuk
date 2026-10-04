import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";
import { ManualForm } from "./ManualForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminManualTitle };
}

export default async function AdminManualPage() {
  invalidatePlatformSettingsCache(); // admins see the truth, not a cached copy
  const [t, settings] = await Promise.all([getT(), loadPlatformSettings()]);
  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.adminManualTitle}
      </h1>
      <p className="text-muted text-sm">{t.adminManualHint}</p>
      <div className="card">
        <ManualForm current={settings.manualUrl} />
      </div>
    </div>
  );
}
