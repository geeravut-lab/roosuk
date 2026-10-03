// Pure helpers for scripts/check-deploy-env.mjs.

/** Variables the production build/runtime cannot work without. */
export const REQUIRED_PRODUCTION_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL", // inlined into the browser bundle at BUILD time
  "NEXT_PUBLIC_SUPABASE_ANON_KEY", // inlined at build time
  "SUPABASE_SERVICE_ROLE_KEY", // server-only
];

/** Worth setting but the app still works without them. */
export const RECOMMENDED_PRODUCTION_ENV = [
  "NEXT_PUBLIC_SITE_URL",
  "LINE_LOGIN_CHANNEL_ID",
  "LINE_LOGIN_CHANNEL_SECRET",
];

/** Names (never values) of variables that are unset or blank. */
export function missingEnv(env, names) {
  return names.filter((name) => !String(env[name] ?? "").trim());
}

/** The check only applies to the real production build on Netlify. */
export function isNetlifyProductionBuild(env) {
  return env.NETLIFY === "true" && env.CONTEXT === "production";
}
