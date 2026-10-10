"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getLang } from "@/lib/i18n/server";
import {
  cancelConsult,
  rekeyConsult,
  startConsult,
} from "@/lib/telepharmacy/server";
import {
  parseFollowUpReply,
  parseRequestForm,
} from "@/lib/telepharmacy/telepharmacy";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RequestState {
  error?: ErrorKey;
  /** the key is shown to this browser once; only its hash is stored */
  started?: { id: string; key: string; mode: "instant" | "scheduled" };
}

function displayName(user: {
  email?: string;
  user_metadata?: unknown;
}): string {
  const meta = user.user_metadata as { full_name?: string } | undefined;
  return meta?.full_name?.trim() || user.email?.split("@")[0] || "";
}

/**
 * "Talk now" or "book a time". The consent in the form is checked here (not just by the
 * browser's required box) and recorded with the version of the text that was shown.
 */
export async function requestConsultAction(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  await assertFeature("telepharmacy");
  const user = await requireUser();
  const parsed = parseRequestForm((k) => formData.get(k));
  if (!parsed.ok) return { error: parsed.error };
  const r = await startConsult({
    userId: user.id,
    name: displayName(user),
    lang: await getLang(),
    input: parsed.value,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/telepharmacy");
  return {
    started: {
      id: r.id,
      key: r.key,
      mode: parsed.value.slot ? "scheduled" : "instant",
    },
  };
}

/** Leave the queue or give up a booked time. */
export async function cancelConsultAction(formData: FormData): Promise<void> {
  await assertFeature("telepharmacy");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const error = await cancelConsult(user.id, id);
  revalidatePath("/telepharmacy");
  redirect(error ? `/telepharmacy?error=${error}` : "/telepharmacy");
}

/** This browser lost its key (another device or tab): the signed-in owner gets a fresh one. */
export async function rekeyConsultAction(
  id: string,
): Promise<{ key: string | null }> {
  await assertFeature("telepharmacy");
  const user = await requireUser();
  if (!UUID.test(id)) return { key: null };
  return { key: await rekeyConsult(user.id, id) };
}

export interface FollowUpState {
  error?: ErrorKey;
  saved?: boolean;
}

/** "How is it going?" — the person's short answer, written next to the pharmacist's follow-up. */
export async function followUpReplyAction(
  _prev: FollowUpState,
  formData: FormData,
): Promise<FollowUpState> {
  await assertFeature("telepharmacy");
  const user = await requireUser();
  const id = String(formData.get("consultId") ?? "");
  const reply = parseFollowUpReply(formData.get("reply"));
  if (!UUID.test(id) || !reply) return { error: "err_invalid_input" };
  const { data, error } = await createAdminClient()
    .from("consult_records")
    .update({
      follow_up_reply: reply,
      follow_up_reply_at: new Date().toISOString(),
    })
    .eq("consult_id", id)
    .eq("patient_id", user.id)
    .not("finalized_at", "is", null)
    .select("id");
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  revalidatePath("/telepharmacy");
  return { saved: true };
}
