"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLang, LANG_COOKIE } from "@/lib/i18n/dict";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Remember the language in a cookie (so SSR matches) and on the profile (so it follows the user). */
export async function setLanguage(lang: string): Promise<{ ok: boolean }> {
  if (!isLang(lang)) return { ok: false };

  (await cookies()).set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  if (hasPublicEnv()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      // Best-effort: the cookie already did the job, a profile write failure must not break the switch.
      await supabase
        .from("profiles")
        .update({ language: lang })
        .eq("id", data.user.id);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
