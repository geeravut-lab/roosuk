import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, ShieldAlert, Stethoscope } from "lucide-react";
import { claimConsultAction } from "@/app/actions/pharmacist";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import {
  loadPharmacist,
  loadPharmacistHistory,
  loadQueue,
  loadTeleSettings,
  pharmacistCanServe,
  type QueueItem,
} from "@/lib/telepharmacy/server";
import { formatDuration } from "@/lib/telepharmacy/telepharmacy";
import { PresenceToggle } from "./PresenceToggle";
import { ProfileForm } from "./ProfileForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).pharmTitle };
}

/** A heartbeat in the last two minutes (the same window the database uses). */
const isFresh = (iso: string | null) =>
  !!iso && Date.now() - Date.parse(iso) < 120_000;

export default async function PharmacistPage({
  searchParams,
}: PageProps<"/pharmacist">) {
  if (!(await featureEnabled("telepharmacy"))) notFound();
  const user = await requireUser();
  // not a pharmacist: the page does not exist for this person
  const me = await loadPharmacist(user.id);
  if (!me) notFound();
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const [t, lang, settings, canServe] = await Promise.all([
    getT(),
    getLang(),
    loadTeleSettings(),
    pharmacistCanServe(user.id),
  ]);
  const queue = canServe ? await loadQueue() : { waiting: [], today: [] };
  const history = await loadPharmacistHistory(user.id);
  const active = me.active_consult_id;
  const fresh = isFresh(me.last_seen);
  const pendingRecords = history.filter(
    (h) => h.status === "done" && !h.recordFinal,
  );

  const card = (c: QueueItem, label: string) => (
    <li
      key={c.id}
      className="card flex flex-wrap items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="font-semibold">{c.patient_name ?? "—"}</p>
        <p className="text-muted text-sm">
          {t[`teleTopic_${c.topic}` as "teleTopic_general"]}
          {c.product_name ? ` · ${c.product_name}` : ""} ·{" "}
          {c.scheduled_at
            ? formatDateTime(lang, c.scheduled_at)
            : fmt(t.pharmWaitingSince, {
                when: formatDateTime(lang, c.created_at),
              })}
        </p>
      </div>
      <form action={claimConsultAction}>
        <input type="hidden" name="id" value={c.id} />
        <SubmitButton disabled={!!active} className="btn btn-primary">
          {label}
        </SubmitButton>
      </form>
    </li>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong flex items-center gap-2 text-2xl font-bold">
          <Stethoscope className="size-7" aria-hidden /> {t.pharmTitle}
        </h1>
        <p className="text-muted text-sm">
          {fmt(t.pharmHello, { name: me.display_name })}
        </p>
      </div>

      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      {!canServe ? (
        <section role="status" className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="size-5" aria-hidden />{" "}
            {t.pharmNotReadyTitle}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {!me.license_verified ? (
              <li>
                {me.license_no ? t.pharmWaitLicense : t.pharmNeedLicenseNo}
              </li>
            ) : null}
            {settings.requireKycForPharmacist ? (
              <li>
                {t.pharmNeedKyc}{" "}
                <Link
                  href="/verify?next=/pharmacist"
                  className="text-primary-strong font-semibold underline"
                >
                  {t.kycGoVerify}
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <PresenceToggle initialOnline={me.online && fresh} canServe={canServe} />

      {active ? (
        <section
          className="card flex flex-wrap items-center justify-between gap-3"
          aria-labelledby="ph-active"
        >
          <h2 id="ph-active" className="font-semibold">
            {t.pharmActiveTitle}
          </h2>
          <Link
            href={`/pharmacist/consult/${active}`}
            className="btn btn-primary"
          >
            {t.pharmOpenCall}
          </Link>
        </section>
      ) : null}

      {canServe ? (
        <>
          <section className="space-y-3" aria-labelledby="ph-wait">
            <h2 id="ph-wait" className="font-semibold">
              {fmt(t.pharmQueueTitle, { n: queue.waiting.length })}
            </h2>
            {queue.waiting.length === 0 ? (
              <p className="text-muted text-sm">{t.pharmQueueNone}</p>
            ) : null}
            <ul className="space-y-3">
              {queue.waiting.map((c) => card(c, t.pharmTake))}
            </ul>
          </section>

          <section className="space-y-3" aria-labelledby="ph-today">
            <h2 id="ph-today" className="font-semibold">
              {fmt(t.pharmTodayTitle, { n: queue.today.length })}
            </h2>
            {queue.today.length === 0 ? (
              <p className="text-muted text-sm">{t.pharmTodayNone}</p>
            ) : null}
            <ul className="space-y-3">
              {queue.today.map((c) => card(c, t.pharmStart))}
            </ul>
          </section>
        </>
      ) : null}

      {pendingRecords.length > 0 ? (
        <section className="card space-y-2" aria-labelledby="ph-pending">
          <h2 id="ph-pending" className="flex items-center gap-2 font-semibold">
            <ClipboardList className="size-5" aria-hidden />{" "}
            {fmt(t.pharmPendingRecords, { n: pendingRecords.length })}
          </h2>
          <ul className="divide-line divide-y text-sm">
            {pendingRecords.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span>
                  {formatDateTime(lang, h.accepted_at ?? h.created_at)}
                </span>
                <Link
                  href={`/pharmacist/consult/${h.id}`}
                  className="text-primary-strong font-semibold underline"
                >
                  {t.pharmWriteRecord}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2" aria-labelledby="ph-hist">
        <h2 id="ph-hist" className="font-semibold">
          {t.pharmHistoryTitle}
        </h2>
        {history.length === 0 ? (
          <p className="text-muted text-sm">{t.teleHistoryNone}</p>
        ) : null}
        <ul className="divide-line divide-y">
          {history.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span>
                {formatDateTime(lang, h.accepted_at ?? h.created_at)} ·{" "}
                {t[`teleStatus_${h.status}` as "teleStatus_done"]} ·{" "}
                {formatDuration(h.duration_sec)}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-muted">
                  {h.recordFinal ? t.pharmRecordFinal : t.pharmRecordOpen}
                </span>
                <Link
                  href={`/pharmacist/consult/${h.id}`}
                  className="text-primary-strong font-semibold underline"
                >
                  {t.pharmOpenCall}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <details className="card">
        <summary className="cursor-pointer font-semibold">
          {t.pharmProfileTitle}
        </summary>
        <div className="mt-3">
          <ProfileForm
            displayName={me.display_name}
            licenseNo={me.license_no}
          />
        </div>
      </details>
    </div>
  );
}
