import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PassportView } from "@/components/PassportView";
import { PrintButton } from "@/components/PrintButton";
import { LangSwitch } from "@/components/LangSwitch";
import { featureEnabled } from "@/lib/flags/server";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import {
  hashToken,
  isTokenShape,
  parseStoredSnapshot,
} from "@/lib/passport/passport";
import { createAdminClient } from "@/lib/supabase/admin";

// A shared health summary: never indexed, never sent on as a referrer, never cached.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

interface Opened {
  status: "ok" | "expired" | "revoked" | "missing";
  label: string | null;
  holder_name: string | null;
  snapshot: unknown;
  expires_at: string | null;
}

/** The public page behind a Health Passport link. The secret in the URL is the only credential. */
export default async function PassportLinkPage({
  params,
}: PageProps<"/p/[token]">) {
  const { token } = await params;
  if (!isTokenShape(token) || !(await featureEnabled("health_passport")))
    notFound();

  const { data } = await createAdminClient().rpc("open_passport", {
    p_hash: hashToken(token),
  });
  const row = (data as Opened[] | null)?.[0];
  if (!row || row.status === "missing") notFound();

  const [t, lang] = await Promise.all([getT(), getLang()]);
  const snapshot =
    row.status === "ok" ? parseStoredSnapshot(row.snapshot) : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-primary-strong font-bold">{t.appName}</p>
        <LangSwitch />
      </div>
      {row.status === "ok" && snapshot && row.label ? (
        <>
          <PassportView
            t={t}
            lang={lang}
            snapshot={snapshot}
            label={row.label}
            holderName={row.holder_name}
          />
          <div className="flex flex-wrap items-center gap-3">
            <PrintButton />
            {row.expires_at ? (
              <p className="text-muted text-sm">
                {fmt(t.passportLinkValidUntil, {
                  date: formatDateTime(lang, row.expires_at),
                })}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <section role="status" className="card space-y-1">
          <h1 className="text-xl font-bold">{t.passportGoneTitle}</h1>
          <p>
            {row.status === "expired"
              ? t.passportGoneExpired
              : t.passportGoneRevoked}
          </p>
        </section>
      )}
    </main>
  );
}
