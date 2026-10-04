"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { parseProfileForm } from "@/lib/profile/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * Saves the user's own profile with their OWN client (RLS: own row only). Not an
 * upsert — users have no UPDATE right on the key column, which an upsert writes.
 */
export async function saveProfileAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const parsed = parseProfileForm(formData, new Date().getFullYear());
  if (!parsed.ok) redirect("/profile?error=err_profile_invalid");

  const supabase = await createClient();
  const update = () =>
    supabase
      .from("health_profiles")
      .update(parsed.profile)
      .eq("user_id", user.id)
      .select("user_id");

  let { data, error } = await update();
  if (!error && data?.length === 0) {
    const inserted = await supabase
      .from("health_profiles")
      .insert({ user_id: user.id, ...parsed.profile })
      .select("user_id");
    if (inserted.error?.code === "23505") {
      ({ data, error } = await update()); // a double submit won the race
    } else {
      data = inserted.data;
      error = inserted.error;
    }
  }
  // An UPDATE that matches nothing is "success" to PostgREST — count the rows.
  if (error || data?.length !== 1) redirect("/profile?error=err_save_failed");

  revalidatePath("/profile");
  revalidatePath("/today");
  redirect("/profile?saved=1");
}
