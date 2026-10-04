import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { adultStatus } from "@/lib/body/body";
import { keepMode } from "@/lib/files/server";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { BodyScanForm } from "./BodyScanForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).scanBodyTitle };
}

export default async function BodyScanPage() {
  // A switched-off feature has no page (the server action checks it too).
  if (!(await featureEnabled("body_scan"))) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const [t, mode, { data: profile }] = await Promise.all([
    getT(),
    keepMode(user.id),
    supabase
      .from("health_profiles")
      .select("birth_year")
      .eq("user_id", user.id)
      .maybeSingle<{ birth_year: number | null }>(),
  ]);
  const status = adultStatus(
    profile?.birth_year ?? null,
    new Date().getFullYear(),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.scanBodyTitle}
        </h1>
        <p className="text-muted">{t.bodyIntro}</p>
      </div>
      {status === "minor" ? (
        <p role="status" className="card font-medium">
          {t.err_body_adult}
        </p>
      ) : (
        <BodyScanForm keepMode={mode} ageStatus={status} />
      )}
    </div>
  );
}
