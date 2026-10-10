"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { submitLiverCheckAction, type LiverState } from "@/app/actions/liver";
import { EmergencyCard } from "@/components/liver/EmergencyCard";
import { Spinner } from "@/components/Spinner";
import { errorText, fmt, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import {
  ALCOHOL,
  HEP_B,
  HEP_C,
  HISTORY,
  RED_FLAGS,
  SEXES,
  SYMPTOMS,
  TRI,
} from "@/lib/liver/questionnaire";
import { useFormAction } from "@/lib/use-form-action";

interface Values {
  flags: string[];
  birthYear: string;
  sex: string;
  height: string;
  weight: string;
  waist: string;
  diabetes: string;
  hypertension: string;
  dyslipidemia: string;
  history: string[];
  familyLiver: string;
  hepB: string;
  hepC: string;
  alcohol: string;
  meds: string;
  symptoms: string[];
}

interface Props {
  hasLabs: boolean;
  askBirthYear: boolean;
  askSex: boolean;
  initial: {
    diabetes: string;
    hypertension: string;
    dyslipidemia: string;
    alcohol: string;
    hepB: string;
    hepC: string;
  };
  prefilled: { tri: boolean; alcohol: boolean };
}

const STEPS = ["flags", "body", "health", "virus", "life", "symptoms"] as const;
type Step = (typeof STEPS)[number];
const state0: LiverState = {};

/** Radio / checkbox chips, controlled. The "none" answer of a multi-choice question excludes the rest. */
function Chips({
  id,
  label,
  hint,
  type,
  options,
  value,
  onChange,
  exclusive,
}: {
  id: string;
  label: string;
  hint?: string;
  type: "radio" | "checkbox";
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  exclusive?: string;
}) {
  const toggle = (v: string, on: boolean) => {
    if (type === "radio") return onChange([v]);
    if (!on) return onChange(value.filter((x) => x !== v));
    if (v === exclusive) return onChange([v]);
    onChange([...value.filter((x) => x !== exclusive), v]);
  };
  return (
    <fieldset className="card space-y-3">
      <legend className="sr-only">{label}</legend>
      <div>
        <p id={id} className="font-semibold" aria-hidden>
          {label}
        </p>
        {hint ? <p className="text-muted text-sm">{hint}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="border-field-border bg-surface has-[:checked]:border-active has-[:checked]:bg-tint-active has-[:checked]:text-active has-[:focus-visible]:outline-active flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-[15px] has-[:checked]:border-2 has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <input
              type={type}
              name={`ui_${id}`}
              value={o.value}
              checked={value.includes(o.value)}
              onChange={(e) => toggle(o.value, e.target.checked)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  required,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="card space-y-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="any"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
      {hint ? <p className="text-muted text-sm">{hint}</p> : null}
    </div>
  );
}

/**
 * The adaptive questionnaire. Red flags come first and end the check at once
 * with the emergency card; the rest follows in short parts. Answers live here
 * and travel to the server as hidden fields — the server runs the rule engine.
 */
export function LiverCheckForm({
  hasLabs,
  askBirthYear,
  askSex,
  initial,
  prefilled,
}: Props) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    submitLiverCheckAction,
    state0,
  );
  const [v, setV] = useState<Values>({
    flags: [],
    birthYear: "",
    sex: "",
    height: "",
    weight: "",
    waist: "",
    diabetes: initial.diabetes,
    hypertension: initial.hypertension,
    dyslipidemia: initial.dyslipidemia,
    history: [],
    familyLiver: "",
    hepB: initial.hepB,
    hepC: initial.hepC,
    alcohol: initial.alcohol,
    meds: "",
    symptoms: [],
  });
  const [step, setStep] = useState(0);
  const set = <K extends keyof Values>(k: K, val: Values[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const urgent = v.flags.some((f) => f !== "none");
  const current: Step = STEPS[step];
  const last = step === STEPS.length - 1;
  const year = Number(v.birthYear);
  const maxYear = new Date().getFullYear();

  const valid: Record<Step, boolean> = {
    flags: v.flags.length > 0,
    body:
      (!askBirthYear ||
        (/^\d{4}$/.test(v.birthYear) && year >= 1900 && year <= maxYear)) &&
      (!askSex || v.sex !== ""),
    health:
      !!v.diabetes &&
      !!v.hypertension &&
      !!v.dyslipidemia &&
      !!v.familyLiver &&
      v.history.length > 0,
    virus: !!v.hepB && !!v.hepC,
    life: !!v.alcohol && !!v.meds,
    symptoms: v.symptoms.length > 0,
  };

  const opt = (prefix: string, values: readonly string[]) =>
    values.map((x) => ({ value: x, label: t[`${prefix}_${x}` as keyof Dict] }));
  const tri = opt("liverTri", TRI);
  const prefilledHint = t.liverPrefilled;

  const body: Record<Step, ReactNode> = {
    flags: (
      <>
        <Chips
          id="flags"
          label={t.liverQ_flags}
          type="checkbox"
          exclusive="none"
          options={[
            ...RED_FLAGS.map((f) => ({
              value: f,
              label: t[`liverFlag_${f}` as keyof Dict],
            })),
            { value: "none", label: t.liverFlag_none },
          ]}
          value={v.flags}
          onChange={(x) => set("flags", x)}
        />
        {urgent ? (
          <EmergencyCard
            title={t.liverFlagsAlertTitle}
            body={t.liverFlagsAlertBody}
            cta={t.liverUrgent_emergency_cta}
            callLabel={t.liverCall1669}
          />
        ) : null}
      </>
    ),
    body: (
      <>
        {askBirthYear ? (
          <NumberField
            id="birthYear"
            label={t.liverQ_birthYear}
            value={v.birthYear}
            onChange={(x) => set("birthYear", x)}
            min={1900}
            max={maxYear}
            required
            hint={t.liverYearsHint}
          />
        ) : null}
        {askSex ? (
          <Chips
            id="sex"
            label={t.liverQ_sex}
            hint={t.liverSexHint}
            type="radio"
            options={opt("liverSex", SEXES)}
            value={v.sex ? [v.sex] : []}
            onChange={(x) => set("sex", x[0] ?? "")}
          />
        ) : null}
        <NumberField
          id="height"
          label={t.liverQ_height}
          value={v.height}
          onChange={(x) => set("height", x)}
          min={100}
          max={230}
          hint={t.liverBodyHint}
        />
        <NumberField
          id="weight"
          label={t.liverQ_weight}
          value={v.weight}
          onChange={(x) => set("weight", x)}
          min={25}
          max={300}
        />
        <NumberField
          id="waist"
          label={t.liverQ_waist}
          value={v.waist}
          onChange={(x) => set("waist", x)}
          min={40}
          max={200}
        />
      </>
    ),
    health: (
      <>
        {(["diabetes", "hypertension", "dyslipidemia"] as const).map((k) => (
          <Chips
            key={k}
            id={k}
            label={t[`liverQ_${k}` as keyof Dict]}
            hint={prefilled.tri && v[k] === "yes" ? prefilledHint : undefined}
            type="radio"
            options={tri}
            value={v[k] ? [v[k]] : []}
            onChange={(x) => set(k, x[0] ?? "")}
          />
        ))}
        <Chips
          id="history"
          label={t.liverQ_history}
          type="checkbox"
          exclusive="none"
          options={[
            ...HISTORY.map((h) => ({
              value: h,
              label: t[`liverHistory_${h}` as keyof Dict],
            })),
            { value: "none", label: t.liverHistory_none },
          ]}
          value={v.history}
          onChange={(x) => set("history", x)}
        />
        <Chips
          id="familyLiver"
          label={t.liverQ_family}
          type="radio"
          options={tri}
          value={v.familyLiver ? [v.familyLiver] : []}
          onChange={(x) => set("familyLiver", x[0] ?? "")}
        />
      </>
    ),
    virus: (
      <>
        <Chips
          id="hepB"
          label={t.liverQ_hepB}
          hint={t.liverVirusHint}
          type="radio"
          options={opt("liverHepB", HEP_B)}
          value={v.hepB ? [v.hepB] : []}
          onChange={(x) => set("hepB", x[0] ?? "")}
        />
        <Chips
          id="hepC"
          label={t.liverQ_hepC}
          type="radio"
          options={opt("liverHepC", HEP_C)}
          value={v.hepC ? [v.hepC] : []}
          onChange={(x) => set("hepC", x[0] ?? "")}
        />
      </>
    ),
    life: (
      <>
        <Chips
          id="alcohol"
          label={t.liverQ_alcohol}
          hint={prefilled.alcohol && v.alcohol ? prefilledHint : undefined}
          type="radio"
          options={opt("alcohol", ALCOHOL)}
          value={v.alcohol ? [v.alcohol] : []}
          onChange={(x) => set("alcohol", x[0] ?? "")}
        />
        <Chips
          id="meds"
          label={t.liverQ_meds}
          hint={t.liverMedsHint}
          type="radio"
          options={tri}
          value={v.meds ? [v.meds] : []}
          onChange={(x) => set("meds", x[0] ?? "")}
        />
      </>
    ),
    symptoms: (
      <>
        <Chips
          id="symptoms"
          label={t.liverQ_symptoms}
          type="checkbox"
          exclusive="none"
          options={[
            ...SYMPTOMS.map((s) => ({
              value: s,
              label: t[`liverSymptom_${s}` as keyof Dict],
            })),
            { value: "none", label: t.liverSymptom_none },
          ]}
          value={v.symptoms}
          onChange={(x) => set("symptoms", x)}
        />
        {!hasLabs ? (
          <p className="bg-tint-secondary rounded-xl px-3 py-2 text-sm">
            {t.liverNeedLabs}
          </p>
        ) : null}
      </>
    ),
  };

  // Enter inside a number box must not send a half-finished check.
  const noEnter = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT")
      e.preventDefault();
  };
  const canSubmit = urgent || (last && STEPS.every((s) => valid[s]));

  return (
    <form
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(e);
      }}
      onKeyDown={noEnter}
      className="space-y-4"
    >
      <p className="text-muted text-sm" aria-live="polite">
        {fmt(t.liverStepOf, { n: step + 1, total: STEPS.length })} ·{" "}
        {t[`liverStep_${current}` as keyof Dict]}
      </p>

      {body[current]}

      {/* everything answered so far goes to the server as plain fields */}
      {v.flags.map((f) => (
        <input key={f} type="hidden" name="redFlags" value={f} />
      ))}
      {(
        [
          ["birthYear", v.birthYear],
          ["sex", v.sex],
          ["heightCm", v.height],
          ["weightKg", v.weight],
          ["waistCm", v.waist],
          ["diabetes", v.diabetes],
          ["hypertension", v.hypertension],
          ["dyslipidemia", v.dyslipidemia],
          ["familyLiver", v.familyLiver],
          ["hepB", v.hepB],
          ["hepC", v.hepC],
          ["alcohol", v.alcohol],
          ["meds", v.meds],
        ] as const
      ).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {v.history.map((h) => (
        <input key={`h-${h}`} type="hidden" name="history" value={h} />
      ))}
      {v.symptoms.map((s) => (
        <input key={`s-${s}`} type="hidden" name="symptoms" value={s} />
      ))}

      {state.error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}

      <div className="flex gap-2">
        {step > 0 && !urgent ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep(step - 1)}
            disabled={pending}
          >
            {t.liverBack}
          </button>
        ) : null}
        {urgent || last ? (
          <button
            type="submit"
            disabled={pending || !canSubmit}
            className="btn btn-primary flex-1"
          >
            {pending ? <Spinner /> : null}
            {pending
              ? t.liverSubmitting
              : urgent
                ? t.liverSubmitUrgent
                : t.liverSubmit}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={!valid[current]}
            onClick={() => setStep(step + 1)}
          >
            {t.liverNext}
          </button>
        )}
      </div>
      <p className="text-muted text-xs">{t.liverDisclaimer}</p>
    </form>
  );
}
