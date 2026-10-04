"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { canUnlinkLine } from "@/lib/line/link";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Disconnect LINE". The link table is read-only for users, so the row goes with
 * the service role, for the signed-in user's own row only. A LINE-only account
 * keeps its link: it would have no way to sign in again.
 */
export async function unlinkLineAction(): Promise<void> {
  const user = await requireUser();
  if (!canUnlinkLine(user.email))
    redirect("/settings?error=err_line_unlink_login_only");

  const { data, error } = await createAdminClient()
    .from("line_links")
    .delete()
    .eq("user_id", user.id)
    .select("user_id");
  if (error) {
    console.error("[line] unlink failed:", error.message);
    redirect("/settings?error=err_save_failed");
  }
  revalidatePath("/settings");
  // no row = already not linked: the page is right either way
  redirect(`/settings?line=${data?.length ? "unlinked" : "none"}`);
}
