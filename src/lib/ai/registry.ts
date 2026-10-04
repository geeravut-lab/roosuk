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
 * Probed with the project's own paid key on 2026-10-07/08 (docs/11: the docs
 * and the live API disagree, the API wins): gemini-3-flash-preview and
 * gemini-flash-lite-latest answered every time (~1 s); gemini-flash-latest
 * returned 503 "high demand" for minutes on end; gemini-3.1-flash-lite was
 * slow (7–12 s) and flaky; gemini-2.5-flash returned 404 (closed to new users).
 * "-preview" ids can be retired without notice — /admin/ai exists so that a
 * change of model needs no deploy, and the router's fallback covers the gap.
 */
export interface ProviderInfo {
  envKey: string;
  label: string;
  capabilities: { images: boolean; pdf: boolean; audio: boolean };
  models: Record<TaskKind, string>;
}

const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-4-5";
const FLASH = "gemini-3-flash-preview";
const FLASH_LITE = "gemini-flash-lite-latest";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    label: "Anthropic Claude",
    capabilities: { images: true, pdf: true, audio: false },
    models: {
      food_scan: HAIKU,
      body_scan: SONNET,
      lab_extract: SONNET,
      lab_explain: SONNET,
      chat: SONNET,
      agent: SONNET,
      quick: HAIKU,
      safety: HAIKU,
      daily_plan: HAIKU,
      monthly_report: SONNET,
      prompt_review: HAIKU,
      voice_transcribe: HAIKU, // never used: this provider takes no audio
    },
  },
  google: {
    envKey: "GOOGLE_AI_API_KEY",
    label: "Google Gemini",
    capabilities: { images: true, pdf: true, audio: true },
    models: {
      food_scan: FLASH,
      body_scan: FLASH,
      lab_extract: FLASH,
      lab_explain: FLASH,
      chat: FLASH,
      agent: FLASH,
      quick: FLASH_LITE,
      safety: FLASH_LITE,
      daily_plan: FLASH_LITE,
      monthly_report: FLASH,
      prompt_review: FLASH_LITE,
      voice_transcribe: FLASH_LITE,
    },
  },
};

/** Default primary/fallback per task (§8.2). `null` fallback = none. */
export const TASK_ROUTES: Record<
  TaskKind,
  { primary: ProviderId; fallback: ProviderId | null }
> = {
  food_scan: { primary: "google", fallback: "anthropic" },
  body_scan: { primary: "google", fallback: "anthropic" },
  lab_extract: { primary: "anthropic", fallback: "google" },
  lab_explain: { primary: "anthropic", fallback: "google" },
  chat: { primary: "anthropic", fallback: "google" },
  agent: { primary: "anthropic", fallback: null },
  quick: { primary: "anthropic", fallback: "google" },
  safety: { primary: "anthropic", fallback: null },
  daily_plan: { primary: "anthropic", fallback: "google" },
  monthly_report: { primary: "anthropic", fallback: "google" },
  prompt_review: { primary: "anthropic", fallback: "google" },
  // Speech: Gemini Flash-Lite takes audio at a fraction of a cent a minute; Anthropic takes none, so no fallback.
  voice_transcribe: { primary: "google", fallback: null },
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
