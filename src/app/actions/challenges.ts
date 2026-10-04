"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import {
  CHALLENGE_TEMPLATES,
  isMode,
  isTemplate,
} from "@/lib/challenges/challenges";
import { bangkokDate } from "@/lib/health/dates";
import { normalizeReferralCode } from "@/lib/rewards/rewards";
import { createAdminClient } from "@/lib/supabase/admin";

/** Start a challenge from a template (the numbers come from the template in code, never from the form). */
export async function startChallengeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const template = formData.get("template");
  const mode = formData.get("mode");
  if (!isTemplate(template) || !isMode(mode))
    redirect("/challenges?note=invalid");
  const t = CHALLENGE_TEMPLATES[template];
  const { data, error } = await createAdminClient().rpc("start_challenge", {
    p_user: user.id,
    p_template: template,
    p_mode: mode,
    p_metric: t.metric,
    p_target: t.target,
    p_days: t.days,
    p_today: bangkokDate(new Date()),
  });
  if (error) redirect("/challenges?note=failed");
  const r = data as { ok?: boolean; reason?: string } | null;
  revalidatePath("/challenges");
  redirect(
    r?.ok
      ? "/challenges?note=started"
      : `/challenges?note=${r?.reason ?? "failed"}`,
  );
}

/** Join a friend's challenge by its code (the join link prefills it). */
export async function joinChallengeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = normalizeReferralCode(formData.get("code"));
  if (!code) redirect("/challenges?note=join_invalid");
  const { data, error } = await createAdminClient().rpc("join_challenge", {
    p_user: user.id,
    p_code: code,
    p_today: bangkokDate(new Date()),
  });
  if (error) redirect("/challenges?note=failed");
  const r = data as { ok?: boolean; reason?: string } | null;
  revalidatePath("/challenges");
  redirect(
    r?.ok
      ? "/challenges?note=joined"
      : `/challenges?note=join_${r?.reason ?? "invalid"}`,
  );
}
