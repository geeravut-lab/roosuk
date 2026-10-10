"use client";

import { useState } from "react";
import {
  METERED_FEATURES,
  PLANS,
  PLAN_IDS,
  type Plan,
  type PlanId,
} from "@/config/plans";
import {
  resetPlansAction,
  savePlansAction,
  type PlansState,
} from "@/app/actions/plans";
import { Spinner } from "@/components/Spinner";
import type { BillingSettings } from "@/lib/billing/settings";
import { errorText, fmt, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: PlansState = {};

/** A whole number, or "unlimited" when the box is ticked. */
function Count({
  name,
  label,
  value,
  fallback,
  invalid,
  t,
}: {
  name: string;
  label: string;
  value: number | "unlimited";
  fallback: number | "unlimited";
  invalid: boolean;
  t: Dict;
}) {
  const [unlimited, setUnlimited] = useState(value === "unlimited");
  const dflt =
    fallback === "unlimited" ? t.adminPlansUnlimited : String(fallback);
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={0}
          max={1_000_000}
          step={1}
          required={!unlimited}
          disabled={unlimited}
          defaultValue={value === "unlimited" ? "" : value}
          aria-invalid={invalid || undefined}
          className="field w-28"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={`${name}_u`}
            checked={unlimited}
            onChange={(e) => setUnlimited(e.target.checked)}
            className="size-5"
          />
          {t.adminPlansUnlimited}
        </label>
      </div>
      <p className="text-muted text-xs">
        {fmt(t.adminPlansDefault, { v: dflt })}
      </p>
    </div>
  );
}

function Num({
  name,
  label,
  value,
  fallback,
  max,
  invalid,
  t,
}: {
  name: string;
  label: string;
  value: number;
  fallback: number;
  max?: number;
  invalid: boolean;
  t: Dict;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={max ?? 1_000_000}
        step={1}
        required
        defaultValue={value}
        aria-invalid={invalid || undefined}
        className="field w-32"
      />
      <p className="text-muted text-xs">
        {fmt(t.adminPlansDefault, { v: fallback })}
      </p>
    </div>
  );
}

export function PlansForm({
  billing,
  specs,
}: {
  billing: BillingSettings;
  /** each plan as it applies now (defaults + admin changes) */
  specs: Record<PlanId, Plan>;
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(savePlansAction, initial);
  const [resetState, onReset, resetting] = useFormAction(
    resetPlansAction,
    initial,
  );
  const bad = (f: string) => state.field === f;
  const p = billing.pricing;
  const dp = {
    goldMonthly: 49,
    goldYearly: 490,
    premiumMonthly: 89,
    premiumYearly: 890,
  };

  return (
    <div className="space-y-5">
      <form method="post" onSubmit={onSubmit} className="space-y-5">
        <section className="card space-y-3" aria-labelledby="pl-gen">
          <h2 id="pl-gen" className="font-semibold">
            {t.adminPlansGeneral}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Num
              name="trial_days"
              label={t.adminPlansTrialDays}
              value={billing.trialDays}
              fallback={14}
              max={365}
              invalid={bad("trial_days")}
              t={t}
            />
            <Num
              name="fair_use_cap_trial"
              label={t.adminPlansCapTrial}
              value={billing.fairUseCapTrial}
              fallback={200}
              invalid={bad("fair_use_cap_trial")}
              t={t}
            />
            <Num
              name="fair_use_cap_premium"
              label={t.adminPlansCapPremium}
              value={billing.fairUseCapPremium}
              fallback={600}
              invalid={bad("fair_use_cap_premium")}
              t={t}
            />
          </div>
          <p className="text-muted text-sm">{t.adminPlansTrialNote}</p>
        </section>

        {PLAN_IDS.map((id) => {
          const plan = specs[id];
          const base = PLANS[id];
          return (
            <section
              key={id}
              className="card space-y-3"
              aria-labelledby={`pl-${id}`}
            >
              <h2
                id={`pl-${id}`}
                className="text-primary-strong text-lg font-bold"
              >
                {t[`planName_${id}` as const]}
              </h2>
              {id === "free" ? (
                <p className="text-muted text-sm">{t.adminPlansFreeNote}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Num
                    name={`price_${id}_monthly`}
                    label={t.adminPlansPriceMonthly}
                    value={id === "gold" ? p.goldMonthly : p.premiumMonthly}
                    fallback={
                      id === "gold" ? dp.goldMonthly : dp.premiumMonthly
                    }
                    invalid={bad(`price_${id}_monthly`)}
                    t={t}
                  />
                  <Num
                    name={`price_${id}_yearly`}
                    label={t.adminPlansPriceYearly}
                    value={id === "gold" ? p.goldYearly : p.premiumYearly}
                    fallback={id === "gold" ? dp.goldYearly : dp.premiumYearly}
                    invalid={bad(`price_${id}_yearly`)}
                    t={t}
                  />
                </div>
              )}

              <h3 className="font-semibold">{t.adminPlansQuotas}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {METERED_FEATURES.map((f) => (
                  <Count
                    key={f}
                    name={`q_${id}_${f}`}
                    label={t[`feature_${f}` as const]}
                    value={plan.quotas[f].limit}
                    fallback={base.quotas[f].limit}
                    invalid={bad(`q_${id}_${f}`)}
                    t={t}
                  />
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Count
                  name={`tl_${id}`}
                  label={t.adminPlansTimeline}
                  value={plan.timelineHistoryMonths}
                  fallback={base.timelineHistoryMonths}
                  invalid={bad(`tl_${id}`)}
                  t={t}
                />
                <Count
                  name={`vault_${id}`}
                  label={t.adminPlansVault}
                  value={plan.vaultMaxFiles}
                  fallback={base.vaultMaxFiles}
                  invalid={bad(`vault_${id}`)}
                  t={t}
                />
                <Num
                  name={`family_${id}`}
                  label={t.adminPlansFamily}
                  value={plan.familyMembers}
                  fallback={base.familyMembers}
                  max={20}
                  invalid={bad(`family_${id}`)}
                  t={t}
                />
                <div>
                  <label htmlFor={`wear_${id}`} className="label">
                    {t.adminPlansWearables}
                  </label>
                  <select
                    id={`wear_${id}`}
                    name={`wear_${id}`}
                    defaultValue={plan.wearables}
                    className="field w-40"
                  >
                    {(["none", "basic", "full"] as const).map((w) => (
                      <option key={w} value={w}>
                        {t[`adminPlansWear_${w}` as const]}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted text-xs">
                    {fmt(t.adminPlansDefault, {
                      v: t[`adminPlansWear_${base.wearables}` as const],
                    })}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    name={`passport_${id}`}
                    defaultChecked={plan.healthPassport}
                    className="size-5"
                  />
                  {t.adminPlansPassport}
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    name={`agent_${id}`}
                    defaultChecked={plan.healthAgent}
                    className="size-5"
                  />
                  {t.adminPlansAgent}
                </label>
              </div>
            </section>
          );
        })}

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
            {t.adminPlansSaved}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? <Spinner /> : null}
          {t.save}
        </button>
      </form>

      <form
        method="post"
        onSubmit={onReset}
        className="card space-y-2"
        aria-labelledby="pl-reset"
      >
        <h2 id="pl-reset" className="font-semibold">
          {t.adminPlansReset}
        </h2>
        <p className="text-muted text-sm">{t.adminPlansResetHint}</p>
        {resetState.reset ? (
          <p role="status" className="text-sm font-medium">
            {t.adminPlansResetDone}
          </p>
        ) : null}
        {resetState.error ? (
          <p role="alert" className="text-sm font-medium">
            {errorText(resetState.error, t)}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={resetting}
          className="btn btn-secondary"
        >
          {resetting ? <Spinner /> : null}
          {t.adminPlansReset}
        </button>
      </form>
    </div>
  );
}
