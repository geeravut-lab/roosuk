"use server";

import { redirect } from "next/navigation";
import { hasPublicEnv } from "@/lib/env";
import { getOrigin } from "@/lib/http/origin";
import {
  loginSchema,
  mapAuthError,
  safeNextPath,
  signupSchema,
} from "@/lib/auth/utils";
import type { ErrorKey } from "@/lib/i18n/dict";
import { resolvePostLoginPath } from "@/lib/consent/server";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: ErrorKey;
  needsEmailConfirmation?: boolean;
}

function text(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!hasPublicEnv()) return { error: "err_not_configured" };

  const parsed = loginSchema.safeParse({
    email: text(formData.get("email")),
    password: text(formData.get("password")),
  });
  if (!parsed.success) return { error: "err_invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user)
    return { error: error ? mapAuthError(error) : "err_unknown" };

  redirect(
    await resolvePostLoginPath(
      supabase,
      data.user.id,
      safeNextPath(formData.get("next")),
    ),
  );
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!hasPublicEnv()) return { error: "err_not_configured" };

  const parsed = signupSchema.safeParse({
    email: text(formData.get("email")),
    password: text(formData.get("password")),
    displayName: text(formData.get("displayName")),
  });
  if (!parsed.success) {
    const weak = parsed.error.issues.some((i) => i.path[0] === "password");
    return { error: weak ? "err_weak_password" : "err_invalid_input" };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: parsed.data.displayName
        ? { full_name: parsed.data.displayName }
        : {},
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: mapAuthError(error) };

  // With "Confirm email" on, signing up an existing address returns no error
  // (to avoid leaking which emails exist) but a user with no identities.
  if (data.user && data.user.identities?.length === 0)
    return { error: "err_email_taken" };
  if (!data.session || !data.user) return { needsEmailConfirmation: true };

  redirect(
    await resolvePostLoginPath(
      supabase,
      data.user.id,
      safeNextPath(formData.get("next")),
    ),
  );
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  if (!hasPublicEnv()) redirect("/auth?error=err_not_configured");

  const supabase = await createClient();
  const origin = await getOrigin();
  const next = safeNextPath(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) redirect("/auth?error=err_oauth_failed");
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  if (hasPublicEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
