import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import { isKycVerified } from "@/lib/ekyc/server";
import { featureEnabled } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import {
  loadAccessLog,
  loadAvailability,
  loadPatientConsults,
  loadPharmacist,
  loadPatientRecords,
  loadTakenSlots,
  loadTeleSettings,
  teleOpen,
} from "@/lib/telepharmacy/server";
import {
  LIVE_STATUSES,
  generateSlots,
  pickText,
} from "@/lib/telepharmacy/telepharmacy";
import { createAdminClient } from "@/lib/supabase/admin";
import { FollowUpForm } from "./FollowUpForm";
import { LiveConsult } from "./LiveConsult";
import { RequestDialog, type SlotGroup } from "./RequestDialog";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).teleTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TelepharmacyPage({
  searchParams,
}: PageProps<"/telepharmacy">) {
  if (!(await featureEnabled("telepharmacy"))) notFound();
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const error = one("error");
  const productParam = one("product");
  const now = new Date();
  const [t, lang, settings] = await Promise.all([
    getT(),
    getLang(),
    loadTeleSettings(),
  ]);
  const open = await teleOpen(settings);

  const [consults, records, access, kycOk, availability] = await Promise.all([
    loadPatientConsults(user.id),
    loadPatientRecords(user.id),
    loadAccessLog(user.id),
    settings.requireKycForConsult
      ? isKycVerified(user.id)
      : Promise.resolve(true),
    open ? loadAvailability(settings, now) : Promise.resolve(null),
  ]);
  const isPharmacist = !!(await loadPharmacist(user.id));

  // the product the person came from (a shop page), only if it is on sale
  let product: { id: string; name: string } | null = null;
  if (typeof productParam === "string" && UUID.test(productParam)) {
    const { data } = await createAdminClient()
      .from("shop_products")
      .select("id, name_th, name_en, active")
      .eq("id", productParam)
      .maybeSingle<{
        id: string;
        name_th: string;
        name_en: string | null;
        active: boolean;
      }>();
    if (data?.active)
      product = {
        id: data.id,
        name: lang === "en" && data.name_en ? data.name_en : data.name_th,
      };
  }

  const disclaimer = pickText(
    lang,
    { th: settings.disclaimerTh, en: settings.disclaimerEn },
    t.teleDisclaimerDraft,
  );
  const consentText = pickText(
    lang,
    { th: settings.consentTextTh, en: settings.consentTextEn },
    t.teleConsentDraft,
  );

  const live = consults.find((c) => LIVE_STATUSES.includes(c.status)) ?? null;
  const recentMissed =
    !live &&
    consults[0]?.status === "missed" &&
    now.getTime() - Date.parse(consults[0].ended_at ?? consults[0].created_at) <
      15 * 60_000
      ? consults[0]
      : null;

  // bookable slots, greyed out when full
  let slotGroups: SlotGroup[] = [];
  if (open && settings.scheduledEnabled && kycOk) {
    const horizon = new Date(
      now.getTime() + (settings.bookingDaysAhead + 1) * 86_400_000,
    );
    const slots = generateSlots(
      settings,
      now,
      await loadTakenSlots(now, horizon),
    );
    const byDate = new Map<string, SlotGroup>();
    for (const s of slots) {
      let g = byDate.get(s.date);
      if (!g) {
        const dow = new Date(`${s.date}T00:00:00Z`).getUTCDay();
        g = {
          date: s.date,
          label: `${t[`teleDay_${dow}` as "teleDay_0"]} ${new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH-u-ca-buddhist", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${s.date}T00:00:00Z`))}`,
          slots: [],
        };
        byDate.set(s.date, g);
      }
      g.slots.push({ at: s.at, time: s.time, full: s.full });
    }
    slotGroups = [...byDate.values()];
  }

  const today = bangkokDate(now);
  const dueFollowUps = [...records.values()].filter(
    (r) =>
      r.follow_up_on &&
      r.follow_up_on <= today &&
      !r.follow_up_reply &&
      !r.follow_up_outcome,
  );
  const hours = fmt(t.teleHours, {
    days: settings.openDays
      .map((d) => t[`teleDay_${d}` as "teleDay_0"])
      .join(" "),
    from: settings.openFrom,
    to: settings.openTo,
  });
  const canTalk =
    open &&
    !live &&
    kycOk &&
    settings.instantEnabled &&
    !!availability?.available;
  const instantNote = !settings.instantEnabled
    ? null
    : !availability?.open
      ? `${t.teleClosedNow} · ${hours}`
      : availability.available
        ? t.teleAvailable
        : t.teleUnavailable;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong flex items-center gap-2 text-2xl font-bold">
          <Stethoscope className="size-7" aria-hidden /> {t.teleTitle}
        </h1>
        <p className="text-muted text-sm">{t.teleIntro}</p>
        {isPharmacist ? (
          <Link
            href="/pharmacist"
            className="text-primary-strong text-sm font-semibold underline"
          >
            {t.navPharmacist}
          </Link>
        ) : null}
      </div>

      <p
        role="note"
        className="bg-tint-warn flex gap-2 rounded-xl px-3 py-2 text-sm"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{disclaimer}</span>
      </p>

      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      {!open ? (
        <section role="status" className="card space-y-1">
          <h2 className="font-semibold">{t.teleOffTitle}</h2>
          <p className="text-sm">{t.teleOffBody}</p>
        </section>
      ) : !kycOk ? (
        <section className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="text-primary-strong size-5" aria-hidden />{" "}
            {t.teleKycTitle}
          </h2>
          <p className="text-sm">{t.teleKycBody}</p>
          <Link
            href="/verify?next=/telepharmacy"
            className="btn btn-primary w-full"
          >
            {t.kycGoVerify}
          </Link>
        </section>
      ) : (
        <>
          <p className="text-muted flex items-center gap-2 text-sm">
            {settings.requireKycForConsult ? (
              <>
                <BadgeCheck
                  className="text-primary-strong size-4"
                  aria-hidden
                />{" "}
                {t.kycBadge} ·{" "}
              </>
            ) : null}
            {hours}
          </p>
          {live ? (
            <LiveConsult
              id={live.id}
              status={live.status as "waiting" | "booked" | "accepted"}
              mode={live.mode}
              whenLabel={
                live.scheduled_at
                  ? formatDateTime(lang, live.scheduled_at)
                  : null
              }
              createdAt={live.created_at}
              pharmacistName={live.pharmacist_name}
            />
          ) : (
            <>
              {recentMissed ? (
                <section role="status" className="card space-y-1">
                  <h2 className="font-semibold">{t.teleMissedTitle}</h2>
                  <p className="text-sm">{t.teleMissedBody}</p>
                </section>
              ) : null}
              <RequestDialog
                canInstant={canTalk}
                canBook={settings.scheduledEnabled}
                instantNote={instantNote}
                slotGroups={slotGroups}
                consentText={consentText}
                consentVersion={settings.consentVersion}
                productId={product?.id ?? null}
                productName={product?.name ?? null}
              />
            </>
          )}
        </>
      )}

      {dueFollowUps.length > 0 ? (
        <section
          id="follow-up"
          className="card space-y-3"
          aria-labelledby="fu-h"
        >
          <h2 id="fu-h" className="font-semibold">
            {t.teleFollowUpDue}
          </h2>
          {dueFollowUps.map((r) => (
            <div key={r.consult_id} className="space-y-2">
              <p className="text-sm">
                {fmt(t.teleFollowUpOn, {
                  date: formatDate(lang, `${r.follow_up_on}T12:00:00+07:00`),
                })}
                {r.follow_up_note ? ` · ${r.follow_up_note}` : ""}
              </p>
              <FollowUpForm consultId={r.consult_id} />
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="tele-hist-h">
        <h2 id="tele-hist-h" className="font-semibold">
          {t.teleHistoryTitle}
        </h2>
        {consults.length === 0 ? (
          <p className="text-muted text-sm">{t.teleHistoryNone}</p>
        ) : null}
        <ul className="space-y-3">
          {consults.map((c) => {
            const rec = records.get(c.id);
            return (
              <li key={c.id} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {formatDateTime(lang, c.scheduled_at ?? c.created_at)}
                  </p>
                  <span className="bg-tint-primary rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    {t[`teleStatus_${c.status}` as "teleStatus_done"]}
                  </span>
                </div>
                <p className="text-muted text-sm">
                  {t[`teleMode_${c.mode}` as "teleMode_instant"]} ·{" "}
                  {t[`teleTopic_${c.topic}` as "teleTopic_general"]}
                  {c.product_name ? ` · ${c.product_name}` : ""}
                  {c.pharmacist_name
                    ? ` · ${fmt(t.teleWith, { name: c.pharmacist_name })}`
                    : ""}
                  {c.pharmacist_license_no
                    ? ` (${fmt(t.teleLicenseNo, { no: c.pharmacist_license_no })})`
                    : ""}
                </p>
                {rec ? (
                  <details className="border-line rounded-xl border p-3">
                    <summary className="cursor-pointer font-medium">
                      {t.teleRecordTitle}
                    </summary>
                    <div className="mt-2 space-y-2 text-sm">
                      <p className="font-semibold">{t.teleAdvice}</p>
                      <p className="whitespace-pre-wrap">{rec.advice}</p>
                      {rec.refer_doctor ? (
                        <p className="bg-tint-warn rounded-xl px-3 py-2 font-medium">
                          {t.teleReferDoctor}
                        </p>
                      ) : null}
                      {rec.products.length > 0 ? (
                        <div className="space-y-1">
                          <p className="font-semibold">{t.teleProductsTitle}</p>
                          <ul className="list-disc pl-5">
                            {rec.products.map((p, i) => (
                              <li key={i}>
                                {p.name}
                                {p.note ? ` — ${p.note}` : ""}
                              </li>
                            ))}
                          </ul>
                          <p className="text-muted text-xs">
                            {t.teleProductsNote}
                          </p>
                        </div>
                      ) : null}
                      {rec.follow_up_on ? (
                        <div className="space-y-1">
                          <p className="font-semibold">{t.teleFollowUpTitle}</p>
                          <p>
                            {fmt(t.teleFollowUpOn, {
                              date: formatDate(
                                lang,
                                `${rec.follow_up_on}T12:00:00+07:00`,
                              ),
                            })}
                            {rec.follow_up_note
                              ? ` · ${rec.follow_up_note}`
                              : ""}
                          </p>
                          {rec.follow_up_reply ? (
                            <p>
                              {fmt(t.teleFollowUpYourReply, {
                                text: rec.follow_up_reply,
                              })}
                            </p>
                          ) : null}
                          {rec.follow_up_outcome ? (
                            <p>
                              {fmt(t.teleFollowUpOutcome, {
                                text: rec.follow_up_outcome,
                              })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-2" aria-labelledby="tele-access-h">
        <h2 id="tele-access-h" className="font-semibold">
          {t.teleAccessTitle}
        </h2>
        <p className="text-muted text-sm">{t.teleAccessHint}</p>
        {access.length === 0 ? (
          <p className="text-sm">{t.teleAccessNone}</p>
        ) : (
          <ul className="divide-line divide-y text-sm">
            {access.map((a, i) => (
              <li key={i} className="py-2">
                {formatDateTime(lang, a.at)} ·{" "}
                {t[`teleRole_${a.role}` as "teleRole_admin"]}{" "}
                {t[`teleAccess_${a.action}` as "teleAccess_end"] ?? a.action}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-muted text-xs">{t.telePrivacyNote}</p>
    </div>
  );
}
