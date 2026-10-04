"use client";

import { useRef } from "react";
import { addManualAction, type ManualState } from "@/app/actions/wearables";
import { Spinner } from "@/components/Spinner";
import { errorText, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";
import {
  OBS_TYPE_KEYS,
  tierAllows,
  type WearableTier,
} from "@/lib/wearables/types";

const initial: ManualState = {};

export function ManualForm({
  today,
  tier,
}: {
  today: string;
  tier: WearableTier;
}) {
  const { t } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  const [state, onSubmit, pending] = useFormAction(
    async (prev: ManualState, data: FormData) => {
      const r = await addManualAction(prev, data);
      if (r.saved) form.current?.reset();
      return r;
    },
    initial,
  );
  return (
    <form method="post" ref={form} onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor="wm-type" className="label">
            {t.wearManualType}
          </label>
          <select
            id="wm-type"
            name="type"
            className="field"
            defaultValue="resting_heart_rate"
          >
            {OBS_TYPE_KEYS.filter((k) => tierAllows(tier, k)).map((k) => (
              <option key={k} value={k}>
                {t[`wearType_${k}` as keyof Dict]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wm-value" className="label">
            {t.wearManualValue}
          </label>
          <input
            id="wm-value"
            name="value"
            inputMode="decimal"
            required
            autoComplete="off"
            className="field"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="wm-date" className="label">
            {t.wearManualDate}
          </label>
          <input
            id="wm-date"
            name="date"
            type="date"
            max={today}
            defaultValue={today}
            required
            className="field"
          />
        </div>
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
          {t.wearManualSaved}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-secondary w-full"
      >
        {pending ? <Spinner /> : null}
        {t.wearManualSave}
      </button>
    </form>
  );
}
