import type { Metadata } from "next";
import Link from "next/link";
import { LangSwitch } from "@/components/LangSwitch";
import { getCurrentUser } from "@/lib/auth/server";
import { fmt } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { PROFILE_COLUMNS, type HealthProfile } from "@/lib/profile/profile";
import { createClient } from "@/lib/supabase/server";
import { QuizForm } from "./QuizForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).quizTitle };
}

/**
 * Public on purpose: the quiz is the front door (docs master plan §6) — anyone
 * can take it and see their score. Signed-in users get their profile answers
 * pre-filled, a saved result and a 7-day plan.
 */
export default async function QuizPage() {
  const [t, lang, user] = await Promise.all([
    getT(),
    getLang(),
    getCurrentUser(),
  ]);

  let profile: HealthProfile | null = null;
  let last: { id: string; created_at: string } | null = null;
  if (user) {
    const supabase = await createClient();
    const [p, l] = await Promise.all([
      supabase
        .from("health_profiles")
        .select(PROFILE_COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle<HealthProfile>(),
      supabase
        .from("quiz_results")
        .select("id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; created_at: string }>(),
    ]);
    profile = p.data;
    last = l.data;
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 pb-10">
      <header className="flex h-14 items-center justify-between">
        <Link
          href={user ? "/today" : "/"}
          className="text-primary-strong inline-flex min-h-11 items-center font-bold"
        >
          {user ? t.quizBackToday : t.appName}
        </Link>
        <LangSwitch />
      </header>
      <main id="main" className="space-y-5">
        {last ? (
          <Link
            href={`/quiz-result/${last.id}`}
            className="text-primary-strong inline-flex min-h-11 items-center font-medium underline"
          >
            {fmt(t.quizLast, { date: formatDate(lang, last.created_at) })}
          </Link>
        ) : null}
        <QuizForm
          defaults={{
            birth_year: profile?.birth_year ? String(profile.birth_year) : "",
            smoking: profile?.smoking ?? "",
            alcohol: profile?.alcohol ?? "",
            exercise_days:
              profile?.exercise_days != null
                ? String(profile.exercise_days)
                : "",
          }}
        />
      </main>
    </div>
  );
}
