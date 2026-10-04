"use client";

import {
  saveRewardSettingsAction,
  type RewardSettingsState,
} from "@/app/actions/rewards";
import { Spinner } from "@/components/Spinner";
import { errorText, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { REWARD_FIELDS, type RewardSettings } from "@/lib/rewards/rewards";
import { useFormAction } from "@/lib/use-form-action";

const initial: RewardSettingsState = {};

export function RewardForm({ current }: { current: RewardSettings }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    saveRewardSettingsAction,
    initial,
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {REWARD_FIELDS.map((f) => (
          <div key={f.field}>
            <label htmlFor={`rw-${f.field}`} className="label">
              {t[`adminReward_${f.field}` as keyof Dict] as string}
            </label>
            <input
              id={`rw-${f.field}`}
              name={f.field}
              type="number"
              inputMode="numeric"
              step={1}
              min={f.min}
              max={f.max}
              required
              defaultValue={current[f.field]}
              aria-invalid={state.field === f.field || undefined}
              className="field"
            />
          </div>
        ))}
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
          {t.adminRewardSaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {t.save}
      </button>
    </form>
  );
}
