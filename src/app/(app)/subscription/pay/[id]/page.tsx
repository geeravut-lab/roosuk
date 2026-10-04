import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import {
  PAYMENT_COLUMNS,
  canReport,
  type PaymentRow,
} from "@/lib/billing/payments";
import { promptpayQrUrl } from "@/lib/billing/promptpay";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { ReportForm } from "./ReportForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PayPage({
  params,
}: PageProps<"/subscription/pay/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  if (!UUID.test(id)) notFound();

  // Read with the user's own client: RLS only returns their rows.
  const supabase = await createClient();
  const [t, { data: pay }] = await Promise.all([
    getT(),
    supabase
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<PaymentRow>(),
  ]);
  if (!pay) notFound();

  const qr = promptpayQrUrl(pay.promptpay_id, pay.amount);
  const plan = t[`planName_${pay.plan_tier}` as const];
  const period = t[`payPeriod_${pay.period}` as const];

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">{t.payTitle}</h1>

      <section className="card space-y-1" aria-label={t.payAmount}>
        <p className="font-semibold">
          {plan} · {period}
        </p>
        <p className="text-muted text-sm">{t.payAmount}</p>
        <p className="text-primary-strong text-3xl font-bold">
          ฿{pay.amount.toLocaleString("en-US")}
        </p>
        {pay.credit_applied_thb > 0 ? (
          <p className="text-sm font-medium">
            {fmt(t.payCreditLine, { n: pay.credit_applied_thb })}
          </p>
        ) : null}
      </section>

      {canReport(pay.status) && !qr ? (
        <p role="alert" className="card">
          {t.err_payment_not_ready}
        </p>
      ) : null}

      {canReport(pay.status) && qr ? (
        <section className="card space-y-4 text-center">
          {/* promptpay.io draws the QR from the id + amount in the URL; white padding keeps it scannable. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={fmt(t.payQrAlt, { amount: pay.amount })}
            width={256}
            height={256}
            className="mx-auto size-64 rounded-xl bg-white p-2"
          />
          <p className="text-sm">{t.payScanHint}</p>
        </section>
      ) : null}

      {pay.status === "rejected" ? (
        <div role="status" className="card border-warn space-y-1 border-2">
          <p className="inline-flex items-center gap-2 font-semibold">
            <TriangleAlert className="text-primary-strong size-5" aria-hidden />
            {t.payRejectedTitle}
          </p>
          <p>{t.payRejectedBody}</p>
          {pay.review_note ? (
            <p className="text-sm">
              {fmt(t.payRejectedNote, { note: pay.review_note })}
            </p>
          ) : null}
        </div>
      ) : null}

      {canReport(pay.status) ? (
        <section className="card space-y-3">
          <ReportForm paymentId={pay.id} />
          <p className="text-muted text-sm">{t.payExtendNote}</p>
        </section>
      ) : null}

      {pay.status === "review" ? (
        <div role="status" className="card space-y-1">
          <p className="inline-flex items-center gap-2 font-semibold">
            <Clock className="text-primary-strong size-5" aria-hidden />
            {t.payReviewTitle}
          </p>
          <p>{t.payReviewBody}</p>
          {pay.payer_ref ? (
            <p className="text-muted text-sm">
              {fmt(t.payYourRef, { ref: pay.payer_ref })}
            </p>
          ) : null}
        </div>
      ) : null}

      {pay.status === "paid" ? (
        <div role="status" className="card space-y-1">
          <p className="inline-flex items-center gap-2 font-semibold">
            <CircleCheck className="text-primary-strong size-5" aria-hidden />
            {t.payPaidTitle}
          </p>
          <p>{t.payPaidBody}</p>
        </div>
      ) : null}

      {pay.status === "cancelled" ? (
        <p className="card">{t.payCancelledBody}</p>
      ) : null}

      <Link href="/subscription" className="btn btn-secondary w-full">
        {t.payBack}
      </Link>
    </div>
  );
}
