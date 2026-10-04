"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLANS } from "@/config/plans";
import { requireUser } from "@/lib/auth/server";
import { tierFor } from "@/lib/billing/entitlement.server";
import { AppError } from "@/lib/errors";
import { cleanInviteCode, parseScopes } from "@/lib/family/family";
import { loadFamily } from "@/lib/family/server";
import { assertFeature } from "@/lib/flags/server";
import { dictFor, notifyUser } from "@/lib/notify/server";
import { familyJoinedNotice } from "@/lib/notify/messages";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (code?: string, extra = "") =>
  redirect(
    `/family${code ? `?error=${code}${extra}` : extra ? `?${extra.slice(1)}` : ""}`,
  );

/** A new invite code for the person's one family seat (the old one stops working). */
export async function createFamilyInviteAction(): Promise<void> {
  await assertFeature("family");
  const user = await requireUser();
  const seats = PLANS[await tierFor(user.id)].familyMembers;
  const { data, error } = await createAdminClient().rpc(
    "create_family_invite",
    {
      p_owner: user.id,
      p_seats: seats,
    },
  );
  if (error) {
    console.error("[family] invite failed:", error.message);
    back("err_save_failed");
  }
  const r = data as { ok: boolean; reason?: string };
  if (!r.ok) back(`err_family_${r.reason}`);
  revalidatePath("/family");
  back();
}

export async function cancelFamilyInviteAction(): Promise<void> {
  await assertFeature("family");
  const user = await requireUser();
  const { error } = await createAdminClient()
    .from("family_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("owner_id", user.id)
    .is("revoked_at", null)
    .is("accepted_at", null);
  if (error) back("err_save_failed");
  revalidatePath("/family");
  back();
}

/** Use somebody's code. Joining needs no plan: the seat is the owner's. */
export async function acceptFamilyInviteAction(
  formData: FormData,
): Promise<void> {
  await assertFeature("family");
  const user = await requireUser();
  const code = cleanInviteCode(formData.get("code"));
  if (!code) back("err_family_invalid");
  const { data, error } = await createAdminClient().rpc(
    "accept_family_invite",
    {
      p_user: user.id,
      p_code: code,
    },
  );
  if (error) {
    console.error("[family] accept failed:", error.message);
    back("err_save_failed");
  }
  const r = data as { ok: boolean; reason?: string; owner?: string };
  if (!r.ok) back(`err_family_${r.reason}`);
  if (r.owner) {
    const { t } = await dictFor(r.owner);
    await notifyUser(r.owner, familyJoinedNotice(t, user.id));
  }
  revalidatePath("/family");
  back(undefined, "&joined=1");
}

/** Leave (as a member) or remove the member (as the owner): the link and both sides' shares end. */
export async function endFamilyLinkAction(formData: FormData): Promise<void> {
  await assertFeature("family");
  const user = await requireUser();
  const other = String(formData.get("other") ?? "");
  if (!UUID.test(other)) throw new AppError("err_invalid_input");
  const { data, error } = await createAdminClient().rpc("end_family_link", {
    p_actor: user.id,
    p_other: other,
  });
  if (error) back("err_save_failed");
  revalidatePath("/family");
  back(undefined, data ? "&left=1" : "");
}

/** What I let the other person see. Each switch is off until ticked, and ticking needs the explicit acknowledgement. */
export async function setFamilySharesAction(formData: FormData): Promise<void> {
  await assertFeature("family");
  const user = await requireUser();
  const state = await loadFamily(user.id);
  if (!state.other) back("err_family_invalid");
  const scopes = parseScopes(formData.getAll("scopes"));
  if (scopes.length > 0 && formData.get("ack") !== "on") back("err_family_ack");
  const { data, error } = await createAdminClient().rpc("set_family_shares", {
    p_actor: user.id,
    p_other: state.other!.id,
    p_scopes: scopes,
  });
  if (error || (data as number) < 0) back("err_save_failed");
  await createAdminClient()
    .from("privacy_audit_log")
    .insert({
      user_id: user.id,
      action: "family_share_changed",
      detail: scopes.join(",") || "none",
      meta: { scopes },
    });
  revalidatePath("/family");
  back(undefined, "&saved=1");
}
