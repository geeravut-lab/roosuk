"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { planSpec } from "@/lib/billing/specs.server";
import { trackEvent } from "@/lib/analytics/server";
import { requireUser } from "@/lib/auth/server";
import { resolvePlan } from "@/lib/billing/plan";
import { getBillingProfile } from "@/lib/billing/profile.server";
import { AppError } from "@/lib/errors";
import {
  canKeepFiles,
  countVaultDocs,
  removeSourceFile,
  storeSourceFile,
} from "@/lib/files/server";
import { assertFeature } from "@/lib/flags/server";
import { sniffImageType } from "@/lib/food/food";
import { bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import { isPdf } from "@/lib/lab/lab";
import { parseVaultForm, vaultFull } from "@/lib/vault/vault";
import { createAdminClient } from "@/lib/supabase/admin";

const toErrorKey = (e: unknown): ErrorKey =>
  e instanceof AppError ? e.code : "err_unknown";

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VaultState {
  error?: ErrorKey;
  saved?: boolean;
}

/** Put a document in the vault: sealed like every kept file, filed under a title and category. */
export async function uploadVaultAction(
  _prev: VaultState,
  formData: FormData,
): Promise<VaultState> {
  try {
    await assertFeature("health_vault");
    const user = await requireUser();
    // Same separate consent as every kept file (photos/files).
    if (!(await canKeepFiles(user.id)))
      return { error: "err_keep_unavailable" };

    const meta = parseVaultForm(
      (k) => formData.get(k),
      bangkokDate(new Date()),
    );
    if (!meta.ok) return { error: meta.error };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { error: "err_file_required" };
    if (file.size > MAX_FILE_BYTES) return { error: "err_vault_too_large" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = isPdf(bytes);
    const imageType = pdf ? null : sniffImageType(bytes);
    if (!pdf && !imageType) return { error: "err_file_type" };

    const billing = await getBillingProfile(user.id);
    const tier = billing ? resolvePlan(billing, new Date()).tier : "free";
    if (
      vaultFull(
        await countVaultDocs(user.id),
        (await planSpec(tier)).vaultMaxFiles,
      )
    )
      return { error: "err_vault_full" };

    const id = await storeSourceFile({
      userId: user.id,
      kind: "doc",
      bytes,
      mime: pdf ? "application/pdf" : imageType!,
      meta: meta.value,
    });
    if (!id) return { error: "err_save_failed" };
    await trackEvent("vault_uploaded", user.id);
  } catch (err) {
    return { error: toErrorKey(err) };
  }
  revalidatePath("/vault");
  return { saved: true };
}

/** Delete one vault document (the object first, then its row). */
export async function deleteVaultFileAction(formData: FormData): Promise<void> {
  await assertFeature("health_vault");
  const user = await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");
  // Only vault documents are deleted here; a scan's file goes with its scan (or from its own page).
  const { data: row } = await createAdminClient()
    .from("source_files")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("kind", "doc")
    .maybeSingle<{ id: string }>();
  if (!row) throw new AppError("err_invalid_input");
  if (!(await removeSourceFile(user.id, id)))
    throw new AppError("err_save_failed");
  revalidatePath("/vault");
  redirect("/vault");
}
