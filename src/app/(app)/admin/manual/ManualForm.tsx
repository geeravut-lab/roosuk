"use client";

import { saveManualUrlAction, type ManualState } from "@/app/actions/manual";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: ManualState = {};

export function ManualForm({ current }: { current: string }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    saveManualUrlAction,
    initial,
  );
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="manualUrl" className="label">
          {t.adminManualUrl}
        </label>
        <input
          id="manualUrl"
          name="manualUrl"
          type="url"
          inputMode="url"
          defaultValue={current}
          maxLength={500}
          autoComplete="off"
          placeholder="https://"
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
      {state.saved ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {state.saved === "set" ? t.adminManualSaved : t.adminManualCleared}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {t.save}
      </button>
    </form>
  );
}
