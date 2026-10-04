"use client";

import {
  savePaywallModeAction,
  type PaywallState,
} from "@/app/actions/paywall";
import { Spinner } from "@/components/Spinner";
import { errorText, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { PAYWALL_MODES, type PaywallMode } from "@/lib/paywall/paywall";
import { useFormAction } from "@/lib/use-form-action";

const initial: PaywallState = {};

export function PaywallForm({ current }: { current: PaywallMode }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    savePaywallModeAction,
    initial,
  );
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="label">{t.adminPaywallMode}</legend>
        {PAYWALL_MODES.map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="mode"
              value={m}
              defaultChecked={m === current}
              className="size-5 shrink-0"
            />
            <span>{t[`adminPaywallMode_${m}` as keyof Dict] as string}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-muted text-sm">{t.adminPaywallModeNote}</p>
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      {state.saved ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.adminPaywallSaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {t.save}
      </button>
    </form>
  );
}
