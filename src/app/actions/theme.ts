"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { THEME_COOKIE, THEMES, parseTheme } from "@/lib/theme";

/** Remember the colour theme in a cookie. A device-level preference: it is not stored on the profile. */
export async function setTheme(theme: string): Promise<{ ok: boolean }> {
  if (!(THEMES as readonly string[]).includes(theme)) return { ok: false };
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
