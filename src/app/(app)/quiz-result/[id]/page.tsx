import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuizResultView } from "@/components/QuizResultView";
import { requireUser } from "@/lib/auth/server";
import { getT } from "@/lib/i18n/server";
import { parseStoredPlan, type QuizLever } from "@/lib/quiz/quiz";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).quizResultTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuizResultPage({
  params,
}: PageProps<"/quiz-result/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_results")
    .select("score, chrono_age, delta_years, levers, plan, plan_source")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{
      score: number;
      chrono_age: number;
      delta_years: number;
      levers: QuizLever[];
      plan: unknown;
      plan_source: "ai" | "template";
    }>();
  if (!data) notFound();

  return (
    <QuizResultView
      mode="saved"
      planSource={data.plan_source}
      plan={parseStoredPlan(data.plan)}
      result={{
        score: data.score,
        chronoAge: data.chrono_age,
        deltaYears: data.delta_years,
        healthAge: data.chrono_age + data.delta_years,
        levers: data.levers,
      }}
    />
  );
}
