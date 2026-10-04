"use client";

import { reportPaymentAction, type FormState } from "@/app/actions/payments";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";
import { Spinner } from "@/components/Spinner";

const initial: FormState = {};

/** "I have transferred" — the reference is mandatory (the reviewer searches the statement for it). */
export function ReportForm({ paymentId }: { paymentId: string }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    reportPaymentAction,
    initial,
  );

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <div>
        <label htmlFor="payerRef" className="label">
          {t.payRefLabel}
        </label>
        <input
          id="payerRef"
          name="payerRef"
          className="field"
          required
          maxLength={80}
          autoComplete="off"
          aria-describedby="payerRef-hint"
        />
        <p id="payerRef-hint" className="text-muted mt-1 text-sm">
          {t.payRefHint}
        </p>
      </div>
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {t.payReportBtn}
      </button>
    </form>
  );
}
