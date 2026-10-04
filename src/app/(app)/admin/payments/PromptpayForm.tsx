"use client";

import { setPromptpayIdAction, type FormState } from "@/app/actions/payments";
import { maskPromptpayId } from "@/lib/billing/promptpay";
import { errorText, fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: FormState = {};

export function PromptpayForm({ current }: { current: string | null }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    setPromptpayIdAction,
    initial,
  );

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <div>
        <label htmlFor="promptpayId" className="label">
          {t.adminPromptpayLabel}
        </label>
        <input
          id="promptpayId"
          name="promptpayId"
          className="field"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={current ?? ""}
          aria-describedby="promptpay-hint"
        />
        <p id="promptpay-hint" className="text-muted mt-1 text-sm">
          {t.adminPromptpayHint}
        </p>
      </div>
      <p className="text-sm font-medium">
        {current
          ? fmt(t.adminPromptpayCurrent, { masked: maskPromptpayId(current) })
          : t.adminPromptpayUnset}
      </p>
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm font-medium">
          {t.adminPromptpaySaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {t.save}
      </button>
    </form>
  );
}
