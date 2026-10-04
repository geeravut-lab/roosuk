"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import {
  isProtectedAdminEmail,
  parseGrantEmail,
  type GrantResult,
  type RevokeResult,
} from "@/lib/admin/admins";
import type { ErrorKey } from "@/lib/i18n/dict";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GrantState {
  error?: ErrorKey;
  /** the email that was just made an admin */
  granted?: string;
}

const GRANT_ERROR: Record<Exclude<GrantResult, "ok">, ErrorKey> = {
  forbidden: "err_forbidden",
  not_found: "err_admin_not_found",
  already: "err_admin_already",
};

/** Make an existing account an admin, by email. An email nobody has is an error, never a new account. */
export async function grantAdminAction(
  _prev: GrantState,
  formData: FormData,
): Promise<GrantState> {
  const actor = await requireAdmin();
  const email = parseGrantEmail(formData.get("email"));
  if (!email) return { error: "err_invalid_input" };

  const { data, error } = await createAdminClient().rpc("grant_admin", {
    p_actor: actor.id,
    p_email: email,
  });
  if (error) {
    console.error("[admins] grant failed:", error.message);
    return { error: "err_save_failed" };
  }
  const result = data as GrantResult;
  if (result !== "ok")
    return { error: GRANT_ERROR[result] ?? "err_save_failed" };
  revalidatePath("/admin");
  return { granted: email };
}

const REVOKE_ERROR: Record<Exclude<RevokeResult, "ok">, ErrorKey> = {
  forbidden: "err_forbidden",
  self: "err_admin_self",
  protected: "err_admin_protected",
  not_admin: "err_admin_not_admin",
};

/** Take admin away from ANOTHER person. Never yourself, never the owner's account. */
export async function revokeAdminAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const target = String(formData.get("id") ?? "");
  if (!UUID.test(target)) throw new AppError("err_invalid_input");
  const fail = (code: ErrorKey) => redirect(`/admin?error=${code}#admins`);

  if (target === actor.id) fail("err_admin_self");
  const db = createAdminClient();
  // The owner's account is refused here too, before the database is even asked (the database refuses as well).
  const { data: found } = await db.auth.admin.getUserById(target);
  if (isProtectedAdminEmail(found.user?.email)) fail("err_admin_protected");

  const { data, error } = await db.rpc("revoke_admin", {
    p_actor: actor.id,
    p_target: target,
  });
  if (error) {
    console.error("[admins] revoke failed:", error.message);
    fail("err_save_failed");
  }
  const result = data as RevokeResult;
  if (result !== "ok")
    fail(REVOKE_ERROR[result as Exclude<RevokeResult, "ok">]);
  revalidatePath("/admin");
  redirect("/admin?admins=revoked#admins");
}
