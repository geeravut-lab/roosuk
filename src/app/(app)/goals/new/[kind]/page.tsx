import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { isGoalKind } from "@/lib/goals/kinds";
import { loadGoalProfile } from "@/lib/goals/server";
import { IntakeForm } from "./IntakeForm";
import type { Dict } from "@/lib/i18n/dict";

export async function generateMetadata({
  params,
}: PageProps<"/goals/new/[kind]">): Promise<Metadata> {
  const { kind } = await params;
  const t = await getT();
  return {
    title: isGoalKind(kind)
      ? (t[`goalKind_${kind}` as keyof Dict] as string)
      : t.goalsTitle,
  };
}

export default async function NewGoalPage({
  params,
}: PageProps<"/goals/new/[kind]">) {
  if (!(await featureEnabled("goals"))) notFound();
  await requireUser();
  const { kind } = await params;
  if (!isGoalKind(kind)) notFound();
  const [t, profile] = await Promise.all([getT(), loadGoalProfile()]);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t[`goalKind_${kind}` as keyof Dict] as string}
        </h1>
        <p className="text-muted">{t.goalNewIntro}</p>
      </div>
      <IntakeForm
        kind={kind}
        profile={{
          hasBirthYear: profile.birth_year !== null,
          hasSex: profile.sex !== null,
          heightCm: profile.height_cm,
        }}
      />
    </div>
  );
}
