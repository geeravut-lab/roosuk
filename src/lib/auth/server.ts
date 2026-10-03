import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user (verified with the auth server), or null. One lookup per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!hasPublicEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  return user;
}

export const isAdminUser = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createClient();
  // RLS lets a user read only their own row, so a hit means "I am an admin".
  const { data } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
});

/** Admin pages 404 for everyone else — they should not learn the page exists. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!(await isAdminUser(user.id))) notFound();
  return user;
}
