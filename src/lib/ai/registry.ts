import {
  PROVIDER_IDS,
  TASK_KINDS,
  type ProviderId,
  type TaskKind,
} from "./types";

/**
 * What the code knows about each provider: the env var holding its key, the
 * capabilities the router must respect, and a known-good default model per task.
 *
 * Model ids go stale faster than code (docs/11-ai-provider-settings.md), so
 * admins can override any of them in /admin/ai, which lists what each provider
 * really serves and tests a model before saving. Defaults are checked against
 * the providers' docs:
 *   Anthropic  https://docs.anthropic.com/en/docs/about-claude/models
 *   Gemini     https://ai.google.dev/gemini-api/docs/models (the "-latest"
 *              alias follows the current Flash, so the default does not rot)
 *
 * Probed with the project's own paid key on 2026-10-07 (docs/11: the docs and
 * the live API disagree, the API wins): gemini-flash-latest, gemini-3-flash-preview,
 * gemini-3.1-flash-lite and gemini-flash-lite-latest answered; gemini-2.5-flash
 * returned 404 (closed to new users); a 503 "high demand" was seen once on
 * gemini-flash-latest — which is what the fallback is for.
 */
export interface ProviderInfo {
  envKey: string;
  label: string;
  capabilities: { images: boolean; pdf: boolean };
  models: Record<TaskKind, string>;
}

const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-4-5";
const FLASH = "gemini-flash-latest";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    label: "Anthropic Claude",
    capabilities: { images: true, pdf: true },
    models: {
      food_scan: HAIKU,
      lab_extract: SONNET,
      lab_explain: SONNET,
      chat: SONNET,
      agent: SONNET,
      quick: HAIKU,
      safety: HAIKU,
      daily_plan: HAIKU,
      monthly_report: SONNET,
    },
  },
  google: {
    envKey: "GOOGLE_AI_API_KEY",
    label: "Google Gemini",
    capabilities: { images: true, pdf: true },
    models: {
      food_scan: FLASH,
      lab_extract: FLASH,
      lab_explain: FLASH,
      chat: FLASH,
      agent: FLASH,
      quick: FLASH,
      safety: FLASH,
      daily_plan: FLASH,
      monthly_report: FLASH,
    },
  },
};

/** Default primary/fallback per task (§8.2). `null` fallback = none. */
export const TASK_ROUTES: Record<
  TaskKind,
  { primary: ProviderId; fallback: ProviderId | null }
> = {
  food_scan: { primary: "google", fallback: "anthropic" },
  lab_extract: { primary: "anthropic", fallback: "google" },
  lab_explain: { primary: "anthropic", fallback: "google" },
  chat: { primary: "anthropic", fallback: "google" },
  agent: { primary: "anthropic", fallback: null },
  quick: { primary: "anthropic", fallback: "google" },
  safety: { primary: "anthropic", fallback: null },
  daily_plan: { primary: "anthropic", fallback: "google" },
  monthly_report: { primary: "anthropic", fallback: "google" },
};

export function isProviderId(v: unknown): v is ProviderId {
  return (
    typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v)
  );
}

export function isTaskKind(v: unknown): v is TaskKind {
  return typeof v === "string" && (TASK_KINDS as readonly string[]).includes(v);
}

/** The key is read by name at call time (never cached), so rotating it needs no redeploy of code. */
export function apiKeyFor(
  provider: ProviderId,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const v = env[PROVIDERS[provider].envKey]?.trim();
  return v ? v : null;
}
