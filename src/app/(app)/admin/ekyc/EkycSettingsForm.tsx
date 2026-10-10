"use client";

import {
  saveEkycSettingsAction,
  type EkycSettingsState,
} from "@/app/actions/ekyc";
import { Spinner } from "@/components/Spinner";
import type { EkycSettings } from "@/lib/ekyc/ekyc";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: EkycSettingsState = {};

export function EkycSettingsForm({ current }: { current: EkycSettings }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    saveEkycSettingsAction,
    initial,
  );
  const check = (name: string, label: string, on: boolean) => (
    <label className="flex min-h-11 items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={on}
        className="mt-1 size-5"
        aria-invalid={state.field === name || undefined}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
  const number = (
    name: string,
    label: string,
    value: number,
    props: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <div>
      <label htmlFor={`ek-${name}`} className="label">
        {label}
      </label>
      <input
        id={`ek-${name}`}
        name={name}
        type="number"
        inputMode="decimal"
        required
        defaultValue={value}
        aria-invalid={state.field === name || undefined}
        className="field"
        {...props}
      />
    </div>
  );
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {check("enabled", t.adminEkycEnabled, current.enabled)}
      <fieldset className="space-y-1">
        <legend className="label">{t.adminEkycDocs}</legend>
        {check("thaiId", t.adminEkycThaiId, current.thaiId)}
        {check("passport", t.adminEkycPassport, current.passport)}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="label">{t.adminEkycSteps}</legend>
        {check("liveness", t.adminEkycLiveness, current.liveness)}
        {check("faceMatch", t.adminEkycFaceMatch, current.faceMatch)}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        {number(
          "livenessThreshold",
          t.adminEkycLivenessTh,
          current.livenessThreshold,
          { min: 0, max: 1, step: 0.05 },
        )}
        {number("faceThreshold", t.adminEkycFaceTh, current.faceThreshold, {
          min: 0,
          max: 100,
          step: 1,
        })}
        {number(
          "maxAttemptsPerDay",
          t.adminEkycMaxAttempts,
          current.maxAttemptsPerDay,
          { min: 1, max: 20, step: 1 },
        )}
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
          {t.adminEkycSaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {t.save}
      </button>
    </form>
  );
}
