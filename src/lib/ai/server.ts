import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnthropicAdapter } from "./adapters/anthropic";
import { createGoogleAdapter } from "./adapters/google";
import { apiKeyFor } from "./registry";
import { errorReason, runAiWith, type AiEventInput, type RunDeps } from "./run";
import { DEFAULT_AI_SETTINGS, parseAiSettings, type AiSettings } from "./route";
import {
  AiError,
  type AiRequest,
  type AiResponse,
  type ProviderAdapter,
  type ProviderId,
  type TaskKind,
} from "./types";

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  anthropic: createAnthropicAdapter(),
  google: createGoogleAdapter(),
};

// 30 s: the promise made to the admin page ("takes effect within 1 minute").
// Each server instance keeps its own copy; there is no cross-instance
// invalidation, the TTL is what makes them converge (docs/11).
const SETTINGS_TTL_MS = 30_000;
let cache: { value: AiSettings; at: number } | undefined;

/** Reads ai_settings with a short cache. A failed read keeps the last known values (or the code defaults). */
export async function loadAiSettings(): Promise<AiSettings> {
  const now = Date.now();
  if (cache && now - cache.at < SETTINGS_TTL_MS) return cache.value;
  try {
    const { data, error } = await createAdminClient()
      .from("ai_settings")
      .select("*")
      .maybeSingle<Record<string, unknown>>();
    if (error) throw error;
    cache = { value: parseAiSettings(data), at: now };
  } catch (err) {
    console.warn(
      "[ai] could not read ai_settings, keeping previous values:",
      err,
    );
    cache = { value: cache?.value ?? DEFAULT_AI_SETTINGS, at: now };
  }
  return cache.value;
}

export function invalidateAiSettingsCache(): void {
  cache = undefined;
}

// A misconfiguration can fire on every call; one row per key per window is enough.
const lastLogged = new Map<string, number>();

/** Best-effort: failing to write the log must never mask the error being logged. */
async function logEvent(e: AiEventInput): Promise<void> {
  try {
    if (e.status === "error" && e.task === "config") {
      const k = `${e.provider}:${e.errorCode}`;
      const now = Date.now();
      if (now - (lastLogged.get(k) ?? 0) < SETTINGS_TTL_MS) return;
      lastLogged.set(k, now);
    }
    await createAdminClient().from("ai_events").insert({
      provider: e.provider,
      task: e.task,
      status: e.status,
      error_code: e.errorCode,
      message: e.message,
    });
  } catch (err) {
    console.error("[ai] could not write ai_events:", err);
  }
}

const deps: RunDeps = {
  loadSettings: loadAiSettings,
  apiKey: (p) => apiKeyFor(p),
  adapters: ADAPTERS,
  logEvent,
};

/**
 * THE way to call an AI model. Callers must already have passed
 * `checkAndConsume(userId, feature)` (src/lib/billing/quota.server.ts).
 */
export function runAi(task: TaskKind, req: AiRequest): Promise<AiResponse> {
  return runAiWith(deps, task, req);
}

// ── model lists + test (admin) ──────────────────────────────────────────────
const MODELS_TTL_MS = 60 * 60_000;
const modelCache = new Map<ProviderId, { ids: string[]; at: number }>();

/** What the provider really serves (cached 1 h). Empty when the key is missing or the call fails. */
export async function listProviderModels(
  provider: ProviderId,
): Promise<string[]> {
  const hit = modelCache.get(provider);
  if (hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.ids;
  const key = apiKeyFor(provider);
  if (!key) return [];
  try {
    const ids = (await ADAPTERS[provider].listModels(key)).sort();
    modelCache.set(provider, { ids, at: Date.now() });
    return ids;
  } catch (err) {
    console.warn(`[ai] could not list ${provider} models:`, err);
    return [];
  }
}

export interface ModelTestResult {
  ok: boolean;
  ms: number;
  /** A status code or short code; never provider text that could echo secrets. */
  error?: string;
}

/** Sends a tiny fixed prompt (128 tokens of headroom: Gemini counts its thinking tokens in the limit) to this exact provider+model, bypassing routing. No user data involved. */
export async function testModel(
  provider: ProviderId,
  model: string,
): Promise<ModelTestResult> {
  const key = apiKeyFor(provider);
  const started = Date.now();
  if (!key) return { ok: false, ms: 0, error: "no_api_key" };
  try {
    const res = await ADAPTERS[provider].call(
      { prompt: "Reply with the single word: OK", maxTokens: 128 },
      model,
      key,
    );
    return { ok: res.text.trim().length > 0, ms: Date.now() - started };
  } catch (err) {
    const status = (err as { status?: unknown })?.status;
    const reason = errorReason(err);
    const base =
      typeof status === "number"
        ? String(status)
        : err instanceof AiError
          ? err.code
          : "error";
    return {
      ok: false,
      ms: Date.now() - started,
      error: reason ? `${base} ${reason}` : base,
    };
  }
}
