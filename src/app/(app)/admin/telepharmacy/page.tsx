import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addPharmacistAction,
  purgeConsultsAction,
  removePharmacistAction,
  setLicenseAction,
} from "@/app/actions/telepharmacy-admin";
import { SubmitButton } from "@/components/SubmitButton";
import { isKycVerified } from "@/lib/ekyc/server";
import { featureEnabled } from "@/lib/flags/server";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { loadTeleSettings } from "@/lib/telepharmacy/server";
import { formatDuration } from "@/lib/telepharmacy/telepharmacy";
import { videoConfigured } from "@/lib/telepharmacy/video";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeleSettingsForm } from "./TeleSettingsForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminTeleTitle };
}

/** Kept outside the component: a page render must not call the clock directly. */
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

interface PharmRow {
  user_id: string;
  display_name: string;
  license_no: string | null;
  license_verified: boolean;
  license_verified_at: string | null;
  online: boolean;
}
interface ConsultRow {
  id: string;
  mode: "instant" | "scheduled";
  status: string;
  created_at: string;
  accepted_at: string | null;
  duration_sec: number | null;
  pharmacist_name: string | null;
}

export default async function AdminTelepharmacyPage({
  searchParams,
}: PageProps<"/admin/telepharmacy">) {
  if (!(await featureEnabled("telepharmacy"))) notFound();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const error = one("error");
  const done = one("done");
  const db = createAdminClient();
  const since = daysAgo(30);
  const [t, lang, settings, pharmacists, recent] = await Promise.all([
    getT(),
    getLang(),
    loadTeleSettings(),
    db
      .from("pharmacists")
      .select(
        "user_id, display_name, license_no, license_verified, license_verified_at, online",
      )
      .order("created_at", { ascending: true })
      .limit(200)
      .returns<PharmRow[]>(),
    db
      .from("consults")
      .select(
        "id, mode, status, created_at, accepted_at, duration_sec, pharmacist_name",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<ConsultRow[]>(),
  ]);
  const people = await Promise.all(
    (pharmacists.data ?? []).map(async (p) => {
      const [{ data: u }, kyc] = await Promise.all([
        db.auth.admin.getUserById(p.user_id),
        isKycVerified(p.user_id),
      ]);
      return { ...p, email: u.user?.email ?? p.user_id.slice(0, 8), kyc };
    }),
  );
  const rows = recent.data ?? [];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const waits = rows
    .filter((r) => r.mode === "instant" && r.accepted_at)
    .map(
      (r) =>
        (Date.parse(r.accepted_at as string) - Date.parse(r.created_at)) / 1000,
    );
  const durations = rows
    .filter((r) => r.status === "done" && r.duration_sec !== null)
    .map((r) => r.duration_sec as number);
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const missedShare = rows.filter((r) => r.mode === "instant").length
    ? Math.round(
        (rows.filter((r) => r.mode === "instant" && r.status === "missed")
          .length /
          rows.filter((r) => r.mode === "instant").length) *
          100,
      )
    : 0;
  const { count: oldCount } = await db
    .from("consults")
    .select("id", { count: "exact", head: true })
    .in("status", ["done", "missed", "cancelled"])
    .lt("created_at", daysAgo(settings.retentionDays));

  const banner =
    done === "added"
      ? t.adminTeleAdded
      : done === "removed"
        ? t.adminTeleRemoved
        : done === "verified"
          ? t.adminTeleLicenseOk
          : done === "unverified"
            ? t.adminTeleLicenseOff
            : done === "purged"
              ? fmt(t.adminTelePurged, { n: one("n") ?? 0 })
              : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminTeleTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminTeleHint}</p>
      </div>
      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}
      {banner ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {banner}
        </p>
      ) : null}

      <section className="card space-y-4" aria-labelledby="at-set">
        <h2 id="at-set" className="font-semibold">
          {t.adminTeleSettings}
        </h2>
        <TeleSettingsForm
          current={settings}
          videoReady={{
            jitsi: videoConfigured("jitsi"),
            jaas: videoConfigured("jaas"),
            custom: videoConfigured("custom"),
          }}
        />
      </section>

      <section
        id="pharmacists"
        className="card space-y-4"
        aria-labelledby="at-ph"
      >
        <h2 id="at-ph" className="font-semibold">
          {t.adminTelePharmacists}
        </h2>
        <p className="text-muted text-sm">{t.adminTelePharmacistsHint}</p>
        {people.length === 0 ? (
          <p className="text-muted text-sm">{t.adminTeleNoPharmacists}</p>
        ) : null}
        <ul className="divide-line divide-y">
          {people.map((p) => (
            <li key={p.user_id} className="space-y-2 py-3">
              <div>
                <p className="font-medium break-all">
                  {p.display_name}{" "}
                  <span className="text-muted font-normal">· {p.email}</span>
                </p>
                <p className="text-sm">
                  {p.license_no
                    ? fmt(t.teleLicenseNo, { no: p.license_no })
                    : t.adminTeleNoLicenseNo}
                  {" · "}
                  <span className={p.license_verified ? "font-semibold" : ""}>
                    {p.license_verified
                      ? t.adminTeleLicenseVerified
                      : t.adminTeleLicenseUnverified}
                  </span>
                  {" · "}
                  {p.kyc ? t.kycBadge : t.adminTeleKycMissing}
                  {p.online ? ` · ${t.pharmOnline}` : ""}
                </p>
                {p.license_verified_at ? (
                  <p className="text-muted text-xs">
                    {formatDateTime(lang, p.license_verified_at)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={setLicenseAction}>
                  <input type="hidden" name="id" value={p.user_id} />
                  <input
                    type="hidden"
                    name="verified"
                    value={p.license_verified ? "0" : "1"}
                  />
                  <SubmitButton className="btn btn-secondary">
                    {p.license_verified
                      ? t.adminTeleUnverify
                      : t.adminTeleVerify}
                  </SubmitButton>
                </form>
                <form action={removePharmacistAction}>
                  <input type="hidden" name="id" value={p.user_id} />
                  <SubmitButton className="btn btn-ghost">
                    {t.adminTeleRemove}
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <form
          action={addPharmacistAction}
          className="border-line space-y-3 border-t pt-4"
        >
          <h3 className="font-semibold">{t.adminTeleAddTitle}</h3>
          <div>
            <label htmlFor="ph-email" className="label">
              {t.adminAdminsEmail}
            </label>
            <input
              id="ph-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              className="field"
            />
          </div>
          <div>
            <label htmlFor="ph-dn" className="label">
              {t.pharmDisplayName}
            </label>
            <input
              id="ph-dn"
              name="displayName"
              maxLength={80}
              autoComplete="off"
              className="field"
            />
          </div>
          <SubmitButton className="btn btn-primary">
            {t.adminTeleAdd}
          </SubmitButton>
        </form>
      </section>

      <section className="card space-y-3" aria-labelledby="at-rep">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="at-rep" className="font-semibold">
            {t.adminTeleReport}
          </h2>
          <Link
            href="/admin/telepharmacy/export"
            prefetch={false}
            className="btn btn-secondary"
          >
            {t.adminTeleExport}
          </Link>
        </div>
        <p className="text-muted text-sm">{t.adminTeleReportHint}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[
            [t.adminTeleStatTotal, rows.length],
            [t.teleStatus_done, count("done")],
            [t.teleStatus_missed, count("missed")],
            [t.teleStatus_cancelled, count("cancelled")],
            [t.adminTeleStatWait, formatDuration(avg(waits))],
            [t.adminTeleStatDuration, formatDuration(avg(durations))],
            [t.adminTeleStatMissedShare, `${missedShare}%`],
          ].map(([k, v]) => (
            <div key={String(k)} className="bg-tint-primary rounded-xl p-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-lg font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="divide-line max-h-96 divide-y overflow-y-auto text-sm">
          {rows.slice(0, 50).map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap justify-between gap-2 py-2"
            >
              <span>
                {formatDateTime(lang, r.created_at)} ·{" "}
                {t[`teleMode_${r.mode}` as "teleMode_instant"]}
              </span>
              <span className="text-muted">
                {t[`teleStatus_${r.status}` as "teleStatus_done"]}
                {r.pharmacist_name ? ` · ${r.pharmacist_name}` : ""} ·{" "}
                {formatDuration(r.duration_sec)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3" aria-labelledby="at-ret">
        <h2 id="at-ret" className="font-semibold">
          {t.adminTeleRetentionTitle}
        </h2>
        <p className="text-sm">
          {fmt(t.adminTeleRetentionBody, {
            days: settings.retentionDays,
            n: oldCount ?? 0,
          })}
        </p>
        <p className="bg-tint-warn rounded-xl px-3 py-2 text-xs">
          {t.adminTeleRetentionLegal}
        </p>
        <form action={purgeConsultsAction} className="space-y-2">
          <label htmlFor="purge-confirm" className="label">
            {t.adminTelePurgeConfirm}
          </label>
          <input
            id="purge-confirm"
            name="confirm"
            autoComplete="off"
            className="field"
          />
          <SubmitButton disabled={!oldCount} className="btn btn-secondary">
            {t.adminTelePurge}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
