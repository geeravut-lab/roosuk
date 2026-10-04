import type { Metadata } from "next";
import { saveProfileAction } from "@/app/actions/profile";
import { ChoiceGroup } from "@/components/ChoiceGroup";
import { requireUser } from "@/lib/auth/server";
import { errorText, isErrorKey, type Dict } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import {
  ALCOHOL_VALUES,
  CONDITION_VALUES,
  EMPTY_PROFILE,
  EXERCISE_DAYS,
  GOAL_VALUES,
  PROFILE_COLUMNS,
  SEX_VALUES,
  SMOKING_VALUES,
  type HealthProfile,
} from "@/lib/profile/profile";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).profileTitle };
}

const opts = (t: Dict, prefix: string, values: readonly (string | number)[]) =>
  values.map((v) => ({
    value: String(v),
    label: t[`${prefix}_${v}` as keyof Dict],
  }));

export default async function ProfilePage({
  searchParams,
}: PageProps<"/profile">) {
  const user = await requireUser();
  const params = await searchParams;
  const supabase = await createClient();
  const [t, { data }] = await Promise.all([
    getT(),
    supabase
      .from("health_profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle<HealthProfile>(),
  ]);
  const p = data ?? EMPTY_PROFILE;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const skip = { value: "", label: t.profileSkip };
  const one = (v: string | number | null) => (v === null ? [""] : [String(v)]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.profileTitle}
        </h1>
        <p className="text-muted">{t.profileIntro}</p>
      </div>

      {params.saved ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.profileSaved}
        </p>
      ) : null}
      {isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      <form action={saveProfileAction} className="space-y-5">
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
            defaultValue={p.birth_year ?? ""}
            className="field"
          />
        </div>

        <ChoiceGroup
          id="q-sex"
          label={t.profileSex}
          name="sex"
          type="radio"
          options={[skip, ...opts(t, "sex", SEX_VALUES)]}
          selected={one(p.sex)}
        />
        <ChoiceGroup
          id="q-smoking"
          label={t.profileSmoking}
          name="smoking"
          type="radio"
          options={[skip, ...opts(t, "smoking", SMOKING_VALUES)]}
          selected={one(p.smoking)}
        />
        <ChoiceGroup
          id="q-alcohol"
          label={t.profileAlcohol}
          name="alcohol"
          type="radio"
          options={[skip, ...opts(t, "alcohol", ALCOHOL_VALUES)]}
          selected={one(p.alcohol)}
        />
        <ChoiceGroup
          id="q-exercise"
          label={t.profileExercise}
          name="exercise_days"
          type="radio"
          options={[
            skip,
            ...EXERCISE_DAYS.map((d) => ({
              value: String(d),
              label: String(d),
            })),
          ]}
          selected={one(p.exercise_days)}
        />
        <ChoiceGroup
          id="q-conditions"
          label={t.profileConditions}
          hint={t.profileConditionsHint}
          name="conditions"
          type="checkbox"
          options={opts(t, "condition", CONDITION_VALUES)}
          selected={p.conditions}
        />
        <ChoiceGroup
          id="q-goals"
          label={t.profileGoals}
          name="goals"
          type="checkbox"
          options={opts(t, "goal", GOAL_VALUES)}
          selected={p.goals}
        />

        <p className="text-muted text-sm">{t.profilePrivacy}</p>
        <button type="submit" className="btn btn-primary w-full">
          {t.save}
        </button>
      </form>
    </div>
  );
}
