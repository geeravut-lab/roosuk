"use server";

import { redirect } from "next/navigation";
import { POLICY_VERSION } from "@/config/legal";
import { requireUser } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/utils";
import { parseConsentForm } from "@/lib/consent/consent";
import type { ErrorKey } from "@/lib/i18n/dict";
import { startTrialIfEligible } from "@/lib/billing/trial.server";
import { createClient } from "@/lib/supabase/server";

export interface ConsentState {
  error?: ErrorKey;
}

/**
 * Appends a consent record (history is kept; the latest row is the current
 * one). The timestamp comes from the database default, never from the client.
 */
export async function recordConsentAction(
  _prev: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const user = await requireUser();

  const parsed = parseConsentForm(formData);
  if (!parsed.ok) return { error: "err_consent_required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consent_records")
    .insert({
      user_id: user.id,
      policy_version: POLICY_VERSION,
      items: parsed.items,
    })
    .select("id");
  if (error || data?.length !== 1) return { error: "err_save_failed" };

  // The Premium trial starts the moment consent is complete. A failure here
  // must not block consent — the app layout retries (self-heal) on the next page.
  try {
    await startTrialIfEligible(user.id);
  } catch (err) {
    console.error("[trial] could not start:", err);
  }

  redirect(safeNextPath(formData.get("next")));
}
