"use client";

import { submitQuizAction, type QuizState } from "@/app/actions/quiz";
import { ChoiceGroup } from "@/components/ChoiceGroup";
import { QuizResultView } from "@/components/QuizResultView";
import { errorText, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { ALCOHOL_VALUES, SMOKING_VALUES } from "@/lib/profile/profile";
import { useFormAction } from "@/lib/use-form-action";
import { Spinner } from "@/components/Spinner";

export interface QuizDefaults {
  birth_year: string;
  smoking: string;
  alcohol: string;
  exercise_days: string;
}

const initial: QuizState = {};

export function QuizForm({ defaults }: { defaults: QuizDefaults }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(submitQuizAction, initial);

  if (state.result && state.plan) {
    return (
      <QuizResultView
        result={state.result}
        plan={state.plan}
        planSource="template"
        mode={state.unsaved === "quota" ? "quota" : "anonymous"}
        quotaMessage={
          state.quotaError ? errorText(state.quotaError, t) : undefined
        }
      />
    );
  }

  const opts = (prefix: string, values: readonly (string | number)[]) =>
    values.map((v) => ({
      value: String(v),
      label: t[`${prefix}_${v}` as keyof Dict],
    }));

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.quizTitle}
        </h1>
        <p className="text-muted">{t.quizIntro}</p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}

      <div className="card space-y-1">
        <label htmlFor="birth_year" className="font-semibold">
          {t.profileBirthYear}
        </label>
        <input
          id="birth_year"
          name="birth_year"
          type="number"
          inputMode="numeric"
          min={1900}
          max={new Date().getFullYear()}
          placeholder="1990"
          required
          defaultValue={defaults.birth_year}
          className="field"
        />
      </div>

      <ChoiceGroup
        id="q-smoking"
        label={t.profileSmoking}
        name="smoking"
        type="radio"
        options={opts("smoking", SMOKING_VALUES)}
        selected={[defaults.smoking]}
        required
      />
      <ChoiceGroup
        id="q-alcohol"
        label={t.profileAlcohol}
        name="alcohol"
        type="radio"
        options={opts("alcohol", ALCOHOL_VALUES)}
        selected={[defaults.alcohol]}
        required
      />
      <ChoiceGroup
        id="q-exercise"
        label={t.profileExercise}
        name="exercise_days"
        type="radio"
        options={[0, 1, 2, 3, 4, 5, 6, 7].map((d) => ({
          value: String(d),
          label: String(d),
        }))}
        selected={[defaults.exercise_days]}
        required
      />
      <ChoiceGroup
        id="q-sleep"
        label={t.q_sleep}
        name="sleep_band"
        type="radio"
        options={opts("sleep", [1, 2, 3, 4])}
        selected={[]}
        required
      />
      <ChoiceGroup
        id="q-produce"
        label={t.q_produce}
        name="produce_band"
        type="radio"
        options={opts("produce", [1, 2, 3, 4])}
        selected={[]}
        required
      />
      <ChoiceGroup
        id="q-stress"
        label={t.q_stress}
        name="stress"
        type="radio"
        options={opts("stress", [1, 2, 3, 4, 5])}
        selected={[]}
        required
      />
      <ChoiceGroup
        id="q-checkup"
        label={t.q_checkup}
        name="checkup_last_year"
        type="radio"
        options={[
          { value: "yes", label: t.checkup_yes },
          { value: "no", label: t.checkup_no },
        ]}
        selected={[]}
        required
      />

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {t.quizSubmit}
      </button>
    </form>
  );
}
