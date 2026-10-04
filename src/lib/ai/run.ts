import {
  resolveRoute,
  shouldTryFallback,
  errorStatus,
  type AiSettings,
  type Route,
} from "./route";
import {
  AiError,
  type AiRequest,
  type AiResponse,
  type ProviderAdapter,
  type ProviderId,
  type TaskKind,
} from "./types";

export interface AiEventInput {
  provider: string;
  task: TaskKind | "config";
  status: "fallback" | "error";
  errorCode: string | null;
  /** Never put prompt or answer text here — it is health data. */
  message: string | null;
}

export interface RunDeps {
  loadSettings(): Promise<AiSettings>;
  apiKey(provider: ProviderId): string | null;
  adapters: Record<ProviderId, ProviderAdapter>;
  logEvent(event: AiEventInput): Promise<void>;
  /** Pause between a provider's "try again" answer and the single retry (tests inject a no-op). */
  sleep?(ms: number): Promise<void>;
}

const RETRY_PAUSE_MS = 1200;

/** 503 (overloaded) and 429 (rate limit) often clear in a second: worth ONE retry on the same provider before switching. */
function worthSameProviderRetry(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown };
  const status = typeof e?.status === "number" ? e.status : e?.statusCode;
  return status === 503 || status === 429;
}

/**
 * Providers' 429s name the tier ("generate_content_free_tier_requests"). A key on
 * Google's FREE tier may be used to improve their products, so it must never see
 * real health data; surfacing that as its own code lets /admin/ai warn about it.
 */
export function eventCode(error: unknown): string | null {
  const message = String((error as { message?: unknown })?.message ?? "");
  if (/free[_ ]tier/i.test(message)) return "free_tier";
  return errorStatus(error) ?? (error as AiError)?.code ?? null;
}

/**
 * A provider's machine-readable reason for an error (e.g. UNAUTHENTICATED,
 * API_KEY_INVALID, CREDENTIALS_MISSING), pulled from the JSON error body that
 * the SDKs put in `message`. Only upper-case/lower-case identifiers are returned
 * — never free text, which could echo request details — so it is safe to show
 * an admin when a "Test" fails with a bare 401/403.
 */
export function errorReason(error: unknown): string | null {
  const message = String((error as { message?: unknown })?.message ?? "");
  const start = message.indexOf("{");
  if (start < 0) return null;
  let body: unknown;
  try {
    body = JSON.parse(message.slice(start));
  } catch {
    return null;
  }
  const err = (body as { error?: Record<string, unknown> })?.error;
  if (!err || typeof err !== "object") return null;
  const id = /^[A-Za-z][A-Za-z0-9_]{2,60}$/;
  const details = Array.isArray(err.details) ? err.details : [];
  const reason = details
    .map((d) => (d as { reason?: unknown })?.reason)
    .find((r): r is string => typeof r === "string" && id.test(r));
  const status = typeof err.status === "string" && id.test(err.status);
  const type = typeof err.type === "string" && id.test(err.type);
  return (
    [status ? err.status : null, reason ?? (type ? err.type : null)]
      .filter(Boolean)
      .join(" / ") || null
  );
}

const short = (e: unknown) =>
  String((e as { message?: unknown })?.message ?? e).slice(0, 200);

/**
 * One call with the routing rules: primary → (one) fallback on an error worth
 * retrying → throw. Only fallbacks and errors are logged, never successes
 * (docs/11). The quota gate (`checkAndConsume`) is the CALLER's job and runs
 * before this, so a rejected user never costs a provider call.
 */
export async function runAiWith(
  deps: RunDeps,
  task: TaskKind,
  req: AiRequest,
): Promise<AiResponse> {
  const settings = await deps.loadSettings();
  const route = resolveRoute(task, settings, (p) => !!deps.apiKey(p));
  if (!route) {
    await deps.logEvent({
      provider: "none",
      task,
      status: "error",
      errorCode: "no_api_key",
      message: "no provider has an API key configured",
    });
    throw new AiError("not_configured");
  }
  if (route.primarySkipped) {
    await deps.logEvent({
      provider: route.primarySkipped,
      task: "config",
      status: "error",
      errorCode: "missing_api_key",
      message: `configured primary has no API key; using ${route.primary.provider}`,
    });
  }

  const attempt = async (target: NonNullable<Route["fallback"]>) => {
    const key = deps.apiKey(target.provider);
    if (!key) throw new AiError("not_configured");
    return deps.adapters[target.provider].call(req, target.model, key);
  };

  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const attemptWithRetry = async (target: NonNullable<Route["fallback"]>) => {
    try {
      return await attempt(target);
    } catch (error) {
      if (!worthSameProviderRetry(error)) throw error;
      await sleep(RETRY_PAUSE_MS);
      return attempt(target);
    }
  };

  try {
    return await attemptWithRetry(route.primary);
  } catch (error) {
    const retryable =
      shouldTryFallback(error) ||
      (error instanceof AiError && error.code === "bad_output");
    if (!route.fallback || !retryable) {
      await deps.logEvent({
        provider: route.primary.provider,
        task,
        status: "error",
        errorCode: eventCode(error),
        message: short(error),
      });
      throw error instanceof AiError
        ? error
        : new AiError("provider_failed", short(error), error);
    }

    await deps.logEvent({
      provider: route.primary.provider,
      task,
      status: "fallback",
      errorCode: eventCode(error),
      message: `${short(error)} → ${route.fallback.provider}`,
    });
    try {
      return await attemptWithRetry(route.fallback);
    } catch (fallbackError) {
      await deps.logEvent({
        provider: route.fallback.provider,
        task,
        status: "error",
        errorCode: eventCode(fallbackError),
        message: `fallback also failed: ${short(fallbackError)}`,
      });
      throw fallbackError instanceof AiError
        ? fallbackError
        : new AiError("provider_failed", short(fallbackError), fallbackError);
    }
  }
}
