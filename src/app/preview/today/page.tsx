import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/ComingSoon";
import { AppShell } from "@/components/shell/AppShell";
import { getT } from "@/lib/i18n/server";

/**
 * Layout-test fixture: renders the real AppShell with no backend, so Playwright
 * can measure the responsive layout without Supabase. 404s unless
 * ENABLE_UI_PREVIEW=1, which is never set on Netlify.
 */
export default async function PreviewToday() {
  if (process.env.ENABLE_UI_PREVIEW !== "1") notFound();
  const t = await getT();
  return (
    <AppShell
      isAdmin
      manualUrl="https://example.com/guide"
      displayName="ตัวอย่าง Preview"
    >
      <div className="space-y-4">
        <h1 className="text-primary-strong text-2xl font-bold">{t.navToday}</h1>
        <ComingSoon />
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="card h-24" />
        ))}
      </div>
    </AppShell>
  );
}
