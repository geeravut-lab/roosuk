import type { Metadata } from "next";
import {
  approveEkycAction,
  rejectEkycAction,
  resetEkycAction,
  revokeEkycAction,
} from "@/app/actions/ekyc";
import { SubmitButton } from "@/components/SubmitButton";
import { getIappEnv } from "@/lib/env";
import { loadEkycSettings } from "@/lib/ekyc/server";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EkycSettingsForm } from "./EkycSettingsForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminEkycTitle };
}

interface Row {
  id: string;
  user_id: string;
  doc_type: "thai_id" | "passport";
  status: "passed" | "review" | "approved" | "rejected" | "revoked";
  doc_name: string | null;
  doc_number_masked: string | null;
  liveness_score: number | null;
  ocr_score: number | null;
  face_score: number | null;
  steps: Record<string, boolean>;
  created_at: string;
}
const COLS =
  "id, user_id, doc_type, status, doc_name, doc_number_masked, liveness_score, ocr_score, face_score, steps, created_at";

const fixed = (n: number | null, d: number) =>
  n === null ? "–" : Number(n).toFixed(d);

export default async function AdminEkycPage({
  searchParams,
}: PageProps<"/admin/ekyc">) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const error = one("error");
  const done = one("done");
  const db = createAdminClient();
  const [t, lang, settings, queue, recent, counts] = await Promise.all([
    getT(),
    getLang(),
    loadEkycSettings(),
    db
      .from("ekyc_verifications")
      .select(COLS)
      .eq("status", "review")
      .order("created_at", { ascending: true })
      .limit(100)
      .returns<Row[]>(),
    db
      .from("ekyc_verifications")
      .select(COLS)
      .in("status", ["passed", "approved"])
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<Row[]>(),
    Promise.all(
      (["passed", "approved", "review", "rejected"] as const).map((s) =>
        db
          .from("ekyc_verifications")
          .select("id", { count: "exact", head: true })
          .eq("status", s),
      ),
    ),
  ]);
  const waiting = queue.data ?? [];
  const verified = recent.data ?? [];
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set([...waiting, ...verified].map((r) => r.user_id))].map(
      async (id) => {
        const { data } = await db.auth.admin.getUserById(id);
        names.set(id, data.user?.email ?? id.slice(0, 8));
      },
    ),
  );
  const doc = (r: Row) =>
    fmt(t.adminEkycDoc, {
      doc: r.doc_type === "thai_id" ? t.kycDocThaiId : t.kycDocPassport,
      name: r.doc_name ?? "–",
      number: r.doc_number_masked ?? "–",
    });
  const failed = (r: Row) =>
    Object.entries(r.steps)
      .filter(([, ok]) => ok === false)
      .map(([k]) => t[`kycReason_${k}` as "kycReason_ocr"] ?? k)
      .join(", ");
  const banner =
    done === "approved"
      ? t.adminEkycApproved
      : done === "rejected"
        ? t.adminEkycRejected
        : done === "revoked"
          ? t.adminEkycRevoked
          : done === "reset"
            ? t.adminEkycResetDone
            : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminEkycTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminEkycHint}</p>
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

      <section className="card space-y-4" aria-labelledby="ek-set">
        <h2 id="ek-set" className="font-semibold">
          {t.adminEkycSettings}
        </h2>
        <p
          className={`rounded-xl px-3 py-2 text-sm ${getIappEnv() ? "bg-tint-secondary" : "bg-tint-warn"}`}
        >
          {getIappEnv() ? t.adminEkycKeyOk : t.adminEkycKeyMissing}
        </p>
        <EkycSettingsForm current={settings} />
        <p className="text-muted text-sm">
          {fmt(t.adminEkycStats, {
            passed: counts[0].count ?? 0,
            approved: counts[1].count ?? 0,
            review: counts[2].count ?? 0,
            rejected: counts[3].count ?? 0,
          })}
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="ek-queue">
        <h2 id="ek-queue" className="font-semibold">
          {fmt(t.adminEkycQueue, { n: waiting.length })}
        </h2>
        {waiting.length === 0 ? (
          <p className="text-muted text-sm">{t.adminEkycQueueNone}</p>
        ) : null}
        <ul className="space-y-3">
          {waiting.map((r) => (
            <li key={r.id} className="card space-y-3">
              <div className="space-y-0.5">
                <p className="font-semibold break-all">
                  {names.get(r.user_id)}
                </p>
                <p className="text-sm">{doc(r)}</p>
                <p className="text-sm">
                  {fmt(t.adminEkycScores, {
                    live: fixed(r.liveness_score, 2),
                    face: fixed(r.face_score, 1),
                    ocr: fixed(r.ocr_score, 2),
                  })}
                </p>
                <p className="text-sm font-medium">
                  {fmt(t.adminEkycDidNotPass, { steps: failed(r) || "–" })}
                </p>
                <p className="text-muted text-sm">
                  {formatDateTime(lang, r.created_at)}
                </p>
              </div>
              <form className="space-y-3">
                <input type="hidden" name="id" value={r.id} />
                <div>
                  <label htmlFor={`note-${r.id}`} className="label">
                    {t.adminEkycNote}
                  </label>
                  <input
                    id={`note-${r.id}`}
                    name="note"
                    className="field"
                    maxLength={500}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <SubmitButton
                    formAction={approveEkycAction}
                    className="btn btn-primary"
                  >
                    {t.adminEkycApprove}
                  </SubmitButton>
                  <SubmitButton
                    formAction={rejectEkycAction}
                    className="btn btn-secondary"
                  >
                    {t.adminEkycReject}
                  </SubmitButton>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3" aria-labelledby="ek-manage">
        <h2 id="ek-manage" className="font-semibold">
          {t.adminEkycManage}
        </h2>
        <p className="text-muted text-sm">{t.adminEkycManageHint}</p>
        <form className="space-y-3">
          <div>
            <label htmlFor="ek-email" className="label">
              {t.adminEkycEmail}
            </label>
            <input
              id="ek-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              className="field"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <SubmitButton
              formAction={resetEkycAction}
              className="btn btn-secondary"
            >
              {t.adminEkycReset}
            </SubmitButton>
            <SubmitButton
              formAction={revokeEkycAction}
              className="btn btn-secondary"
            >
              {t.adminEkycRevokeByEmail}
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="space-y-2" aria-labelledby="ek-ok">
        <h2 id="ek-ok" className="font-semibold">
          {t.adminEkycVerified}
        </h2>
        {verified.length === 0 ? (
          <p className="text-muted text-sm">{t.adminEkycVerifiedNone}</p>
        ) : null}
        <ul className="divide-line divide-y">
          {verified.map((r) => (
            <li key={r.id} className="space-y-0.5 py-2">
              <p className="font-medium break-all">{names.get(r.user_id)}</p>
              <p className="text-muted text-sm">
                {t[`adminEkycStatus_${r.status}` as "adminEkycStatus_passed"]} ·{" "}
                {formatDateTime(lang, r.created_at)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
