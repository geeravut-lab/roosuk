import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Image as ImageIcon } from "lucide-react";
import { deleteVaultFileAction } from "@/app/actions/vault";
import { planSpec } from "@/lib/billing/specs.server";
import { requireUser } from "@/lib/auth/server";
import { resolvePlan } from "@/lib/billing/plan";
import { getBillingProfile } from "@/lib/billing/profile.server";
import { keepMode } from "@/lib/files/server";
import { featureEnabled } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { fmt } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { categoryKey, vaultFull, type VaultCategory } from "@/lib/vault/vault";
import { VaultUploadForm } from "./VaultUploadForm";
import { SubmitButton } from "@/components/SubmitButton";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).vaultTitle };
}

interface FileRow {
  id: string;
  kind: "lab" | "food" | "body" | "doc";
  mime: string;
  title: string | null;
  category: VaultCategory | null;
  doc_date: string | null;
  created_at: string;
}

export default async function VaultPage() {
  if (!(await featureEnabled("health_vault"))) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const [t, lang, billing, mode, { data }] = await Promise.all([
    getT(),
    getLang(),
    getBillingProfile(user.id),
    keepMode(user.id),
    supabase
      .from("source_files")
      .select("id, kind, mime, title, category, doc_date, created_at")
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<FileRow[]>(),
  ]);
  const files = data ?? [];
  const docs = files.filter((f) => f.kind === "doc");
  const scans = files.filter((f) => f.kind !== "doc");
  const tier = billing ? resolvePlan(billing, new Date()).tier : "free";
  const max = (await planSpec(tier)).vaultMaxFiles;
  const full = vaultFull(docs.length, max);

  // Where each scan file belongs, so the person can jump to the result.
  const ids = scans.map((s) => s.id);
  const [labs, meals, bodies] = ids.length
    ? await Promise.all([
        supabase
          .from("lab_reports")
          .select("id, source_file_id")
          .in("source_file_id", ids)
          .returns<{ id: string; source_file_id: string }[]>(),
        supabase
          .from("meal_logs")
          .select("id, source_file_id")
          .in("source_file_id", ids)
          .returns<{ id: string; source_file_id: string }[]>(),
        supabase
          .from("body_scans")
          .select("id, source_file_id")
          .in("source_file_id", ids)
          .returns<{ id: string; source_file_id: string }[]>(),
      ])
    : [null, null, null];
  const parent = new Map<string, string>();
  for (const r of labs?.data ?? [])
    parent.set(r.source_file_id, `/scan/lab/${r.id}`);
  for (const r of meals?.data ?? [])
    parent.set(r.source_file_id, `/scan/food/${r.id}`);
  for (const r of bodies?.data ?? [])
    parent.set(r.source_file_id, `/scan/body/${r.id}`);
  const scanLabel = {
    lab: t.vaultFromLab,
    food: t.vaultFromFood,
    body: t.vaultFromBody,
  } as const;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.vaultTitle}
        </h1>
        <p className="text-muted text-sm">{t.vaultIntro}</p>
        <p className="font-semibold">
          {max === "unlimited"
            ? fmt(t.vaultUsageUnlimited, { n: docs.length })
            : fmt(t.vaultUsage, { n: docs.length, max })}
        </p>
        <p className="text-muted text-xs">{t.vaultUsageNote}</p>
      </div>

      <section className="card space-y-3" aria-labelledby="add-h">
        <h2 id="add-h" className="font-semibold">
          {t.vaultAddTitle}
        </h2>
        {mode === "off" ? (
          <p className="text-sm">{t.vaultUnavailable}</p>
        ) : mode === "needs_consent" ? (
          <p className="text-sm">
            {t.vaultNeedsConsent}{" "}
            <Link href="/settings" className="text-primary-strong underline">
              {t.vaultNeedsConsentLink}
            </Link>
          </p>
        ) : full ? (
          <p className="text-sm font-medium">
            {t.vaultFullHint}{" "}
            <Link
              href="/subscription"
              className="text-primary-strong underline"
            >
              {t.todayTrialLink}
            </Link>
          </p>
        ) : (
          <VaultUploadForm today={bangkokDate(new Date())} />
        )}
      </section>

      <section className="space-y-3" aria-labelledby="docs-h">
        <h2 id="docs-h" className="font-semibold">
          {t.vaultDocsTitle}
        </h2>
        {docs.length === 0 ? (
          <p className="card text-sm">{t.vaultDocsNone}</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((f) => (
              <li key={f.id} className="card space-y-2">
                <div className="flex items-start gap-3">
                  {f.mime === "application/pdf" ? (
                    <FileText
                      className="text-primary-strong mt-0.5 size-5 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <ImageIcon
                      className="text-primary-strong mt-0.5 size-5 shrink-0"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words">{f.title}</p>
                    <p className="text-muted text-sm">
                      {f.category ? t[categoryKey(f.category)] : ""}
                      {f.doc_date
                        ? ` · ${fmt(t.vaultDateOn, { date: formatDate(lang, f.doc_date) })}`
                        : ""}
                    </p>
                    <p className="text-muted text-xs">
                      {fmt(t.vaultAddedOn, {
                        date: formatDate(lang, f.created_at),
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/files/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                  >
                    {t.vaultOpen}
                  </a>
                  <form action={deleteVaultFileAction}>
                    <input type="hidden" name="id" value={f.id} />
                    <SubmitButton className="btn btn-ghost">
                      {t.vaultDelete}
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="scans-h">
        <h2 id="scans-h" className="font-semibold">
          {t.vaultScansTitle}
        </h2>
        {scans.length === 0 ? (
          <p className="card text-sm">{t.vaultScansNone}</p>
        ) : (
          <ul className="space-y-2">
            {scans.map((f) => {
              const to = parent.get(f.id);
              return (
                <li
                  key={f.id}
                  className="card flex flex-wrap items-center gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {scanLabel[f.kind as "lab" | "food" | "body"]}
                    </span>
                    <span className="text-muted block text-sm">
                      {formatDate(lang, f.created_at)}
                    </span>
                  </span>
                  <a
                    href={`/api/files/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                  >
                    {t.vaultOpen}
                  </a>
                  {to ? (
                    <Link href={`${to}?from=vault`} className="btn btn-ghost">
                      {t.vaultOpenScan}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
