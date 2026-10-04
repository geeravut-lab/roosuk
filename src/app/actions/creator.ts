"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/server";
import { normalizeSlug } from "@/lib/creator/creator";
import { AppError } from "@/lib/errors";
import type { ErrorKey } from "@/lib/i18n/dict";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreatorState {
  error?: ErrorKey;
  saved?: boolean;
}

const REASON: Record<string, ErrorKey> = {
  not_found: "err_creator_not_found",
  invalid: "err_creator_invalid",
  taken: "err_creator_taken",
};

/** Make an existing account a creator with its own referral code (or change theirs). */
export async function makeCreatorAction(
  _prev: CreatorState,
  formData: FormData,
): Promise<CreatorState> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const slug = normalizeSlug(formData.get("slug"));
  const name = String(formData.get("name") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (!email || !slug || !name) return { error: "err_creator_invalid" };
  const { data, error } = await createAdminClient().rpc("make_creator", {
    p_email: email,
    p_slug: slug,
    p_name: name,
  });
  if (error) {
    console.error("[creator] make failed:", error.message);
    return { error: "err_save_failed" };
  }
  if (data !== "ok")
    return { error: REASON[String(data)] ?? "err_save_failed" };
  revalidatePath("/admin/creators");
  return { saved: true };
}

/** Take the creator page away (their referral code stays theirs, as before). */
export async function removeCreatorAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const { error } = await createAdminClient()
    .from("creators")
    .delete()
    .eq("user_id", id);
  if (error) throw new AppError("err_save_failed");
  revalidatePath("/admin/creators");
}
