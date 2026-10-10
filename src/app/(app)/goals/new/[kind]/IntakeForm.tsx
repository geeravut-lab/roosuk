"use client";

import Link from "next/link";
import { createGoalAction, type GoalFormState } from "@/app/actions/goals";
import { ChoiceGroup } from "@/components/ChoiceGroup";
import { Spinner } from "@/components/Spinner";
import { errorText, fmt, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import {
  BRAIN_AIMS,
  CAFFEINE,
  CONDITION_GOALS,
  SIT_HOURS,
  SLEEP_HOURS,
  SLEEP_PROBLEMS,
  type GoalKind,
} from "@/lib/goals/kinds";
import { ACTIVITY_LEVELS, DIRECTIONS, PACES } from "@/lib/goals/weight";
import { SEX_VALUES } from "@/lib/profile/profile";
import { useFormAction } from "@/lib/use-form-action";

const initial: GoalFormState = {};

export interface IntakeProfile {
  hasBirthYear: boolean;
  hasSex: boolean;
  heightCm: number | null;
}

const opts = (t: Dict, prefix: string, values: readonly string[]) =>
  values.map((v) => ({
    value: v,
    label: t[`${prefix}_${v}` as keyof Dict] as string,
  }));

export function IntakeForm({
  kind,
  profile,
}: {
  kind: GoalKind;
  profile: IntakeProfile;
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    createGoalAction.bind(null, kind),
    initial,
  );
  const bad = (f: string) => (state.field === f ? true : undefined);

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {state.error ? (
        <div
          role="alert"
          className="bg-tint-warn space-y-2 rounded-xl px-3 py-2"
        >
          <p className="text-sm font-semibold">{errorText(state.error, t)}</p>
          {state.notes?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {state.notes.map((n) => (
                <li key={n}>{t[`goalNote_${n}` as keyof Dict] as string}</li>
              ))}
            </ul>
          ) : null}
          {state.range ? (
            <p className="text-sm font-medium">
              {fmt(t.goalRange, { min: state.range.min, max: state.range.max })}
            </p>
          ) : null}
        </div>
      ) : null}

      {kind === "weight" ? (
        <>
          <ChoiceGroup
            id="gw-direction"
            label={t.goalW_direction}
            name="direction"
            type="radio"
            required
            options={DIRECTIONS.map((d) => ({
              value: d,
              label: t[`goalW_dir_${d}` as keyof Dict] as string,
            }))}
            selected={[]}
          />
          <div className="card space-y-3">
            <div>
              <label htmlFor="height_cm" className="label">
                {t.goalW_height}
              </label>
              <input
                id="height_cm"
                name="height_cm"
                type="number"
                inputMode="numeric"
                min={120}
                max={220}
                required
                defaultValue={profile.heightCm ?? ""}
                aria-invalid={bad("height_cm")}
                className="field w-32"
              />
            </div>
            <div>
              <label htmlFor="weight_kg" className="label">
                {t.goalW_weight}
              </label>
              <input
                id="weight_kg"
                name="weight_kg"
                type="text"
                inputMode="decimal"
                required
                aria-invalid={bad("weight_kg")}
                className="field w-32"
              />
            </div>
            <div>
              <label htmlFor="target_kg" className="label">
                {t.goalW_target}
              </label>
              <input
                id="target_kg"
                name="target_kg"
                type="text"
                inputMode="decimal"
                aria-invalid={bad("target_kg")}
                className="field w-32"
              />
            </div>
            {profile.hasBirthYear ? null : (
              <div>
                <label htmlFor="birth_year" className="label">
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
                  aria-invalid={bad("birth_year")}
                  className="field w-32"
                />
              </div>
            )}
          </div>
          {profile.hasSex ? null : (
            <ChoiceGroup
              id="gw-sex"
              label={t.profileSex}
              name="sex"
              type="radio"
              options={opts(t, "sex", SEX_VALUES)}
              selected={[]}
            />
          )}
          <ChoiceGroup
            id="gw-activity"
            label={t.goalW_activity}
            name="activity"
            type="radio"
            required
            options={opts(t, "activity", ACTIVITY_LEVELS)}
            selected={[]}
          />
          <ChoiceGroup
            id="gw-pace"
            label={t.goalW_pace}
            name="pace"
            type="radio"
            options={PACES.map((p) => ({
              value: p,
              label: t[`goalW_pace_${p}` as keyof Dict] as string,
            }))}
            selected={["gentle"]}
          />
          <ChoiceGroup
            id="gw-careful"
            label={t.goalW_careful}
            hint={t.goalW_carefulHint}
            name="careful"
            type="checkbox"
            options={[
              { value: "pregnant", label: t.careful_pregnant },
              { value: "ed", label: t.careful_ed },
              { value: "medical", label: t.careful_medical },
            ]}
            selected={[]}
          />
          <p className="text-muted text-sm">{t.goalW_privacy}</p>
        </>
      ) : null}

      {kind === "sleep" ? (
        <>
          <ChoiceGroup
            id="gs-avg"
            label={t.goalS_avg}
            name="avg_hours"
            type="radio"
            required
            options={opts(t, "sleepHours", SLEEP_HOURS)}
            selected={[]}
          />
          <ChoiceGroup
            id="gs-problem"
            label={t.goalS_problem}
            name="problem"
            type="radio"
            required
            options={opts(t, "sleepProblem", SLEEP_PROBLEMS)}
            selected={[]}
          />
          <ChoiceGroup
            id="gs-caffeine"
            label={t.goalS_caffeine}
            name="caffeine"
            type="radio"
            required
            options={opts(t, "caffeine", CAFFEINE)}
            selected={[]}
          />
          <div className="card space-y-1">
            <label htmlFor="wake_time" className="label">
              {t.goalS_wake}
            </label>
            <input
              id="wake_time"
              name="wake_time"
              type="time"
              required
              defaultValue="06:30"
              aria-invalid={bad("wake_time")}
              className="field w-36"
            />
          </div>
        </>
      ) : null}

      {kind === "brain" ? (
        <>
          <ChoiceGroup
            id="gb-aim"
            label={t.goalB_aim}
            name="aim"
            type="radio"
            required
            options={opts(t, "brainAim", BRAIN_AIMS)}
            selected={[]}
          />
          <ChoiceGroup
            id="gb-sit"
            label={t.goalB_sit}
            name="sit_hours"
            type="radio"
            required
            options={opts(t, "sitHours", SIT_HOURS)}
            selected={[]}
          />
          <ChoiceGroup
            id="gb-sleep"
            label={t.goalS_avg}
            name="sleep_hours"
            type="radio"
            required
            options={opts(t, "sleepHours", SLEEP_HOURS)}
            selected={[]}
          />
        </>
      ) : null}

      {kind === "condition" ? (
        <>
          <ChoiceGroup
            id="gc-which"
            label={t.goalC_which}
            name="condition"
            type="radio"
            required
            options={opts(t, "condition", CONDITION_GOALS)}
            selected={[]}
          />
          <ChoiceGroup
            id="gc-care"
            label={t.goalC_care}
            name="under_care"
            type="radio"
            required
            options={[
              { value: "yes", label: t.goalC_care_yes },
              { value: "no", label: t.goalC_care_no },
            ]}
            selected={[]}
          />
          <p className="text-muted text-sm">{t.goalC_note}</p>
        </>
      ) : null}

      <p className="text-muted text-xs">{t.goalDisclaimer}</p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? <Spinner /> : null}
          {t.goalCreate}
        </button>
        <Link href="/goals" className="btn btn-ghost">
          {t.cancel}
        </Link>
      </div>
    </form>
  );
}
