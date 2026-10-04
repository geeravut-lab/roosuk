import type { Metadata } from "next";
import {
  confirmPaymentAction,
  rejectPaymentAction,
} from "@/app/actions/payments";
import { PAYMENT_COLUMNS, type PaymentRow } from "@/lib/billing/payments";
import { maskPromptpayId } from "@/lib/billing/promptpay";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import {
  invalidatePlatformSettingsCache,
  loadPlatformSettings,
} from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PromptpayForm } from "./PromptpayForm";
import { SubmitButton } from "@/components/SubmitButton";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminPaymentsTitle };
}

/** Name + email of the payers (service role — this page is behind requireAdmin in the layout). */
async function payerNames(
  rows: PaymentRow[],
  unknown: string,
): Promise<Map<string, string>> {
  const db = createAdminClient();
  const ids = [
    ...new Set(rows.map((r) => r.user_id).filter(Boolean)),
  ] as string[];
  const out = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id);
      const u = data.user;
      const meta = u?.user_metadata as { full_name?: string } | undefined;
      const label = [meta?.full_name, u?.email].filter(Boolean).join(" · ");
      out.set(id, label || unknown);
    }),
  );
  return out;
}

export default async function AdminPaymentsPage() {
  // The admin just changed something: show the truth, not a 30-second-old copy.
  invalidatePlatformSettingsCache();
  const db = createAdminClient();
  const [t, lang, { promptpayId }, pending, recent] = await Promise.all([
    getT(),
    getLang(),
    loadPlatformSettings(),
    db
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .eq("status", "review")
      .order("reported_at", { ascending: true })
      .returns<PaymentRow[]>(),
    db
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .in("status", ["paid", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(20)
      .returns<PaymentRow[]>(),
  ]);
  const queue = pending.data ?? [];
  const history = recent.data ?? [];
  const names = await payerNames(
    [...queue, ...history],
    t.adminPaymentUnknownUser,
  );
  const who = (r: PaymentRow) =>
    (r.user_id && names.get(r.user_id)) || t.adminPaymentUnknownUser;
  const what = (r: PaymentRow) =>
    `${t[`planName_${r.plan_tier}` as const]} · ${t[`payPeriod_${r.period}` as const]} · ฿${r.amount.toLocaleString("en-US")}`;

  return (
    <div className="space-y-6">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.adminPaymentsTitle}
      </h1>

      <PromptpayForm current={promptpayId} />

      <section className="space-y-3" aria-labelledby="queue-h">
        <h2 id="queue-h" className="font-semibold">
          {queue.length > 0
            ? fmt(t.adminPaymentsPending, { n: queue.length })
            : t.adminPaymentsNone}
        </h2>
        <ul className="space-y-3">
          {queue.map((p) => (
            <li key={p.id} className="card space-y-3">
              <div className="space-y-0.5">
                <p className="font-semibold">{what(p)}</p>
                <p className="text-sm">{who(p)}</p>
                <p className="text-sm font-medium">
                  {fmt(t.adminPaymentRef, { ref: p.payer_ref ?? "" })}
                </p>
                <p className="text-muted text-sm">
                  {p.reported_at
                    ? fmt(t.adminPaymentReported, {
                        when: formatDateTime(lang, p.reported_at),
                      })
                    : null}{" "}
                  ·{" "}
                  {fmt(t.adminPaymentTo, {
                    masked: maskPromptpayId(p.promptpay_id),
                  })}
                </p>
              </div>
              <form className="space-y-3">
                <input type="hidden" name="paymentId" value={p.id} />
                <div>
                  <label htmlFor={`note-${p.id}`} className="label">
                    {t.adminPaymentNoteLabel}
                  </label>
                  <input
                    id={`note-${p.id}`}
                    name="note"
                    className="field"
                    maxLength={500}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <SubmitButton
                    formAction={confirmPaymentAction}
                    className="btn btn-primary"
                  >
                    {t.adminPaymentConfirm}
                  </SubmitButton>
                  <SubmitButton
                    formAction={rejectPaymentAction}
                    className="btn btn-secondary"
                  >
                    {t.adminPaymentReject}
                  </SubmitButton>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {history.length > 0 ? (
        <section className="space-y-3" aria-labelledby="history-h">
          <h2 id="history-h" className="font-semibold">
            {t.adminPaymentsHistory}
          </h2>
          <ul className="space-y-2">
            {history.map((p) => (
              <li key={p.id} className="card text-sm">
                <p className="font-semibold">
                  {what(p)} · {t[`payStatus_${p.status}` as const]}
                </p>
                <p>{who(p)}</p>
                <p className="text-muted">
                  {fmt(t.adminPaymentRef, { ref: p.payer_ref ?? "" })}
                  {p.reviewed_at
                    ? ` · ${formatDateTime(lang, p.reviewed_at)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
