import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/ComingSoon";
import { AppShell } from "@/components/shell/AppShell";
import { NAV } from "@/config/nav";
import { getT } from "@/lib/i18n/server";

/**
 * Layout-test fixture: renders the real AppShell with no backend, so Playwright
 * can measure the responsive layout without Supabase. 404s unless
 * ENABLE_UI_PREVIEW=1, which is never set on Netlify.
 */
export default async function PreviewToday({
  searchParams,
}: PageProps<"/preview/today">) {
  if (process.env.ENABLE_UI_PREVIEW !== "1") notFound();
  const t = await getT();
  // ?off=/goals,/scan greys those menu entries out, as a switched-off feature does.
  const sp = await searchParams;
  const off = String(Array.isArray(sp.off) ? sp.off[0] : (sp.off ?? ""))
    .split(",")
    .filter((h) => NAV.some((i) => i.href === h));
  return (
    <AppShell
      isAdmin
      manualUrl="https://example.com/guide"
      displayName="ตัวอย่าง Preview"
      disabledHrefs={off}
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
