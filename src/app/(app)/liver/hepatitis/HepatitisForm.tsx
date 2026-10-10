"use client";

import { saveHepatitisAction, type LiverState } from "@/app/actions/liver";
import { Spinner } from "@/components/Spinner";
import { errorText, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { HEP_B, HEP_C } from "@/lib/liver/questionnaire";
import { useFormAction } from "@/lib/use-form-action";

interface Initial {
  hepB: string;
  hepC: string;
  hepBOn: string;
  hepCOn: string;
}

const initial: LiverState = {};

/** Two selects and two optional dates. A record of what the person says, not a diagnosis. */
export function HepatitisForm({ initial: start }: { initial: Initial }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    saveHepatitisAction,
    initial,
  );
  return (
    <form method="post" onSubmit={onSubmit} className="card space-y-4">
      {(
        [
          ["hepB", "hepBOn", HEP_B, "liverHepB"],
          ["hepC", "hepCOn", HEP_C, "liverHepC"],
        ] as const
      ).map(([name, dateName, values, prefix]) => (
        <fieldset key={name} className="space-y-2">
          <legend className="label">{t[prefix as keyof Dict]}</legend>
          <select
            name={name}
            defaultValue={start[name]}
            className="field"
            aria-label={t[prefix as keyof Dict]}
          >
            {values.map((v) => (
              <option key={v} value={v}>
                {t[`${prefix}_${v}` as keyof Dict]}
              </option>
            ))}
          </select>
          <label className="label" htmlFor={`lv-${dateName}`}>
            {t.liverHepTestedOn}
          </label>
          <input
            id={`lv-${dateName}`}
            name={dateName}
            type="date"
            defaultValue={start[dateName]}
            className="field"
          />
        </fieldset>
      ))}
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
          {t.liverHepSaved}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {t.liverHepSave}
      </button>
    </form>
  );
}
