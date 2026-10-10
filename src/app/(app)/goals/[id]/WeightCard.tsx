"use client";

import { logWeightAction, type WeightState } from "@/app/actions/goals";
import { Spinner } from "@/components/Spinner";
import { errorText, fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: WeightState = {};

export function WeightCard({
  latest,
  trend,
  targetKg,
}: {
  latest: { kg: number; date: string } | null;
  trend: number | null;
  targetKg: number | null;
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(logWeightAction, initial);
  return (
    <section className="card space-y-3" aria-labelledby="gw-card">
      <h2 id="gw-card" className="font-semibold">
        {t.goalWeight}
      </h2>
      <div className="text-sm">
        {latest ? (
          <p className="text-lg font-semibold">
            {fmt(t.goalWeightLatest, { kg: latest.kg, date: latest.date })}
          </p>
        ) : null}
        {targetKg !== null ? (
          <p className="text-muted">
            {fmt(t.goalWeightTargetLine, { kg: targetKg })}
          </p>
        ) : null}
        <p className="text-muted">
          {trend !== null
            ? fmt(t.goalWeightTrend, { rate: trend })
            : t.goalWeightTrendNone}
        </p>
      </div>
      <form method="post" onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="weight_today" className="label">
          {t.goalWeightLog}
        </label>
        <div className="flex gap-2">
          <input
            id="weight_today"
            name="weight_kg"
            type="text"
            inputMode="decimal"
            required
            className="field w-32"
          />
          <button
            type="submit"
            disabled={pending}
            className="btn btn-secondary"
          >
            {pending ? <Spinner /> : null}
            {t.goalWeightSave}
          </button>
        </div>
        {state.error ? (
          <p role="alert" className="text-sm font-medium">
            {errorText(state.error, t)}
          </p>
        ) : null}
        {state.saved ? (
          <p role="status" className="text-sm font-medium">
            {t.goalWeightSaved}
          </p>
        ) : null}
      </form>
    </section>
  );
}
