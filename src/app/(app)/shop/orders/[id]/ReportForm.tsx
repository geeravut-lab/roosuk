"use client";

import { reportShopPaymentAction, type ReportState } from "@/app/actions/shop";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: ReportState = {};

export function ReportForm({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    reportShopPaymentAction,
    initial,
  );
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div>
        <label htmlFor="payer-ref" className="label">
          {t.shopPayRef}
        </label>
        <input
          id="payer-ref"
          name="payerRef"
          required
          maxLength={60}
          autoComplete="off"
          className="field"
        />
      </div>
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
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
        {t.shopPayReport}
      </button>
    </form>
  );
}
