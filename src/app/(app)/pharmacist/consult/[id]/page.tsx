import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Video } from "lucide-react";
import {
  endConsultAction,
  saveFollowUpOutcomeAction,
} from "@/app/actions/pharmacist";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import {
  loadConsultForPharmacist,
  loadPharmacist,
  loadRecordFor,
  pharmacistJoinUrl,
} from "@/lib/telepharmacy/server";
import { formatDuration } from "@/lib/telepharmacy/telepharmacy";
import { createAdminClient } from "@/lib/supabase/admin";
import { PatientContext } from "../../PatientContext";
import { RecordForm } from "./RecordForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).pharmConsultTitle };
}

export default async function PharmacistConsultPage({
  params,
  searchParams,
}: PageProps<"/pharmacist/consult/[id]">) {
  if (!(await featureEnabled("telepharmacy"))) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const me = await loadPharmacist(user.id);
  if (!me) notFound();
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  // opening the shared information is itself written to the access log
  const consult = await loadConsultForPharmacist(user.id, id);
  if (!consult) notFound();
  const [t, lang, record, products] = await Promise.all([
    getT(),
    getLang(),
    loadRecordFor(id, user.id),
    createAdminClient()
      .from("shop_products")
      .select("id, name_th, name_en")
      .eq("active", true)
      .order("sort", { ascending: true })
      .limit(300)
      .returns<{ id: string; name_th: string; name_en: string | null }[]>(),
  ]);
  const join =
    consult.status === "accepted"
      ? await pharmacistJoinUrl(user.id, id, me.display_name)
      : null;
  const catalog = (products.data ?? []).map((p) => ({
    id: p.id,
    name: lang === "en" && p.name_en ? p.name_en : p.name_th,
  }));
  const final = !!record?.finalized_at;

  return (
    <div className="space-y-5">
      <Link
        href="/pharmacist"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.pharmBack}
      </Link>
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.pharmConsultTitle}
        </h1>
        <p className="text-sm">
          {consult.patient_name ?? "—"} ·{" "}
          {t[`teleTopic_${consult.topic}` as "teleTopic_general"]}
          {consult.product_name ? ` · ${consult.product_name}` : ""}
        </p>
        <p className="text-muted text-sm">
          {t[`teleStatus_${consult.status}` as "teleStatus_done"]}
          {consult.accepted_at
            ? ` · ${formatDateTime(lang, consult.accepted_at)}`
            : ""}
          {consult.duration_sec !== null
            ? ` · ${formatDuration(consult.duration_sec)}`
            : ""}
          {` · ${fmt(t.pharmConsentVersion, { v: consult.consent_version })}`}
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

      {consult.status === "accepted" ? (
        <section className="card space-y-3" aria-labelledby="pc-call">
          <h2 id="pc-call" className="font-semibold">
            {t.pharmCallTitle}
          </h2>
          {join ? (
            <a
              href={join}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary w-full"
            >
              <Video className="size-5" aria-hidden /> {t.teleJoin}
            </a>
          ) : (
            <p
              role="alert"
              className="bg-tint-warn rounded-xl px-3 py-2 text-sm"
            >
              {t.err_tele_video_unavailable}
            </p>
          )}
          <p className="text-muted text-xs">{t.pharmCallNote}</p>
          <form action={endConsultAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton className="btn btn-secondary w-full">
              {t.pharmEndCall}
            </SubmitButton>
          </form>
        </section>
      ) : null}

      <PatientContext
        t={t}
        lang={lang}
        snapshot={consult.snapshot}
        shared={consult.shared_sections}
        intake={consult.intake}
      />

      <section className="card space-y-3" aria-labelledby="pc-rec">
        <h2 id="pc-rec" className="font-semibold">
          {t.pharmRecordTitle}
        </h2>
        <p className="bg-tint-warn rounded-xl px-3 py-2 text-xs">
          {t.pharmGuardrail}
        </p>
        {final && record ? (
          <div className="space-y-3 text-sm">
            <p
              role="status"
              className="bg-tint-secondary rounded-xl px-3 py-2 font-medium"
            >
              {fmt(t.pharmFinalAt, {
                when: formatDateTime(lang, record.finalized_at as string),
              })}
            </p>
            <p className="font-semibold">{t.teleAdvice}</p>
            <p className="whitespace-pre-wrap">{record.advice}</p>
            {record.refer_doctor ? (
              <p className="font-medium">{t.teleReferDoctor}</p>
            ) : null}
            {record.products.length ? (
              <ul className="list-disc pl-5">
                {record.products.map((p, i) => (
                  <li key={i}>
                    {p.name}
                    {p.note ? ` — ${p.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {record.follow_up_on ? (
              <div className="space-y-2">
                <p className="font-semibold">
                  {fmt(t.teleFollowUpOn, {
                    date: formatDate(
                      lang,
                      `${record.follow_up_on}T12:00:00+07:00`,
                    ),
                  })}
                  {record.follow_up_note ? ` · ${record.follow_up_note}` : ""}
                </p>
                {record.follow_up_reply ? (
                  <p>
                    {fmt(t.pharmPatientReply, { text: record.follow_up_reply })}
                  </p>
                ) : null}
                {record.follow_up_outcome ? (
                  <p>
                    {fmt(t.teleFollowUpOutcome, {
                      text: record.follow_up_outcome,
                    })}
                  </p>
                ) : (
                  <form
                    action={saveFollowUpOutcomeAction}
                    className="space-y-2"
                  >
                    <input type="hidden" name="id" value={id} />
                    <label htmlFor="fo" className="label">
                      {t.pharmOutcomeLabel}
                    </label>
                    <textarea
                      id="fo"
                      name="outcome"
                      rows={2}
                      maxLength={1000}
                      required
                      className="field py-2"
                    />
                    <SubmitButton className="btn btn-secondary">
                      {t.pharmOutcomeSave}
                    </SubmitButton>
                  </form>
                )}
              </div>
            ) : null}
          </div>
        ) : consult.status === "accepted" || consult.status === "done" ? (
          <RecordForm
            consultId={id}
            callEnded={consult.status === "done"}
            catalog={catalog}
            defaults={{
              advice: record?.advice ?? "",
              referDoctor: record?.refer_doctor ?? false,
              products: record?.products ?? [],
              followUpOn: record?.follow_up_on ?? null,
              followUpNote: record?.follow_up_note ?? null,
            }}
          />
        ) : (
          <p className="text-muted text-sm">{t.pharmNoRecordYet}</p>
        )}
      </section>
    </div>
  );
}
