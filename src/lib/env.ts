import { z } from "zod";

// Next.js only inlines NEXT_PUBLIC_* vars referenced statically, so each one is
// read by name here rather than by iterating over process.env. Everything is
// validated lazily so `next build`, tests and the UI preview run without a
// populated .env.

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

function readPublicEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** True when the Supabase URL + publishable key are configured. */
export function hasPublicEnv(): boolean {
  return publicSchema.safeParse(readPublicEnv()).success;
}

export function getPublicEnv(): PublicEnv {
  return publicSchema.parse(readPublicEnv());
}

/** Service-role access (bypasses RLS). Server-only callers. */
export function getSupabaseAdminEnv() {
  const serviceRoleKey = z
    .string()
    .min(1)
    .parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { url: getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey };
}

export function getAiEnv() {
  return z
    .object({
      ANTHROPIC_API_KEY: z.string().min(1),
      GOOGLE_AI_API_KEY: z.string().min(1).optional(),
    })
    .parse({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || undefined,
    });
}

export function getLineLoginEnv() {
  const parsed = z
    .object({
      LINE_LOGIN_CHANNEL_ID: z.string().min(1),
      LINE_LOGIN_CHANNEL_SECRET: z.string().min(1),
    })
    .safeParse({
      LINE_LOGIN_CHANNEL_ID: process.env.LINE_LOGIN_CHANNEL_ID,
      LINE_LOGIN_CHANNEL_SECRET: process.env.LINE_LOGIN_CHANNEL_SECRET,
    });
  if (!parsed.success) return null;
  return {
    channelId: parsed.data.LINE_LOGIN_CHANNEL_ID,
    channelSecret: parsed.data.LINE_LOGIN_CHANNEL_SECRET,
  };
}

/** Canonical public URL if configured (otherwise derive it from the request). */
export function getConfiguredSiteUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : undefined;
}
