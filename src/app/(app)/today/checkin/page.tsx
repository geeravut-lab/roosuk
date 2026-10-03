import type { Metadata } from "next";
import Link from "next/link";
import { submitCheckinAction } from "@/app/actions/habit";
import { requireUser } from "@/lib/auth/server";
import {
  ACTIVITY_BANDS,
  CHECKIN_COLUMNS,
  SCALE,
  SLEEP_BANDS,
  type CheckinRow,
} from "@/lib/health/checkin";
import { bangkokDate } from "@/lib/health/dates";
import { errorText, type Dict } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).checkinTitle };
}

type Question = {
  name: keyof Omit<CheckinRow, "checkin_date">;
  legend: keyof Dict;
  options: readonly number[];
  label: (n: number) => keyof Dict;
};

const QUESTIONS: readonly Question[] = [
  {
    name: "sleep_band",
    legend: "q_sleep",
    options: SLEEP_BANDS,
    label: (n) => `sleep_${n}` as keyof Dict,
  },
  {
    name: "activity_band",
    legend: "q_activity",
    options: ACTIVITY_BANDS,
    label: (n) => `act_${n}` as keyof Dict,
  },
  {
    name: "energy",
    legend: "q_energy",
    options: SCALE,
    label: (n) => `energy_${n}` as keyof Dict,
  },
  {
    name: "mood",
    legend: "q_mood",
    options: SCALE,
    label: (n) => `mood_${n}` as keyof Dict,
  },
  {
    name: "nutrition",
    legend: "q_nutrition",
    options: SCALE,
    label: (n) => `nutrition_${n}` as keyof Dict,
  },
];

export default async function CheckinPage({
  searchParams,
}: PageProps<"/today/checkin">) {
  const user = await requireUser();
  const { error } = await searchParams;
  const today = bangkokDate(new Date());

  const supabase = await createClient();
  const [t, { data: existing }] = await Promise.all([
    getT(),
    supabase
      .from("daily_checkins")
      .select(CHECKIN_COLUMNS)
      .eq("user_id", user.id)
      .eq("checkin_date", today)
      .maybeSingle<CheckinRow>(),
  ]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.checkinTitle}
        </h1>
        <p className="text-muted">{t.checkinIntro}</p>
      </div>

      {typeof error === "string" ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      <form action={submitCheckinAction} className="space-y-5">
        {QUESTIONS.map((q) => (
          <div
            key={q.name}
            role="group"
            aria-labelledby={`q-${q.name}`}
            className="card space-y-3"
          >
            <p id={`q-${q.name}`} className="font-semibold">
              {t[q.legend]}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {q.options.map((n) => (
                <label
                  key={n}
                  className="border-field-border bg-surface has-[:checked]:border-active has-[:checked]:bg-tint-active has-[:checked]:text-active has-[:focus-visible]:outline-active flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-[15px] last:odd:col-span-2 has-[:checked]:border-2 has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                >
                  <input
                    type="radio"
                    name={q.name}
                    value={n}
                    required
                    defaultChecked={existing?.[q.name] === n}
                    className="sr-only"
                  />
                  {t[q.label(n)]}
                </label>
              ))}
            </div>
          </div>
        ))}

        <button type="submit" className="btn btn-primary w-full">
          {existing ? t.checkinUpdate : t.checkinSave}
        </button>
        <Link href="/today" className="btn btn-ghost w-full">
          {t.checkinBack}
        </Link>
      </form>
    </div>
  );
}
