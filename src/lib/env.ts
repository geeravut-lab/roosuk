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

/**
 * e-KYC provider (iApp Technology). Null when the key is not set: identity
 * verification then shows "not available yet" and never pretends to succeed.
 * `IAPP_BASE_URL` exists so tests can point at a local stub.
 */
export function getIappEnv(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env.IAPP_API_KEY?.trim();
  if (!apiKey) return null;
  const base = process.env.IAPP_BASE_URL?.trim();
  return {
    apiKey,
    baseUrl: (base || "https://api.iapp.co.th").replace(/\/+$/, ""),
  };
}

/**
 * Video room providers beyond the public Jitsi default. JaaS needs all three
 * of app id, key id and private key (PEM, `\n` escaped); "custom" needs a base URL.
 */
export function getVideoEnv(): {
  jaas: { appId: string; keyId: string; privateKey: string } | null;
  customBaseUrl: string | null;
  jitsiBaseUrl: string;
} {
  const appId = process.env.JAAS_APP_ID?.trim();
  const keyId = process.env.JAAS_KEY_ID?.trim();
  const privateKey = process.env.JAAS_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  const custom = process.env.VIDEO_BASE_URL?.trim();
  const jitsi = process.env.JITSI_BASE_URL?.trim();
  return {
    jaas: appId && keyId && privateKey ? { appId, keyId, privateKey } : null,
    customBaseUrl:
      custom && /^https:\/\//.test(custom) ? custom.replace(/\/+$/, "") : null,
    jitsiBaseUrl: (jitsi && /^https:\/\//.test(jitsi)
      ? jitsi
      : "https://meet.jit.si"
    ).replace(/\/+$/, ""),
  };
}
