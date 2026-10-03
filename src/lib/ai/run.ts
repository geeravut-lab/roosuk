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

  try {
    return await attempt(route.primary);
  } catch (error) {
    const retryable =
      shouldTryFallback(error) ||
      (error instanceof AiError && error.code === "bad_output");
    if (!route.fallback || !retryable) {
      await deps.logEvent({
        provider: route.primary.provider,
        task,
        status: "error",
        errorCode: errorStatus(error) ?? (error as AiError).code ?? null,
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
      errorCode: errorStatus(error) ?? (error as AiError).code ?? null,
      message: `${short(error)} → ${route.fallback.provider}`,
    });
    try {
      return await attempt(route.fallback);
    } catch (fallbackError) {
      await deps.logEvent({
        provider: route.fallback.provider,
        task,
        status: "error",
        errorCode:
          errorStatus(fallbackError) ?? (fallbackError as AiError).code ?? null,
        message: `fallback also failed: ${short(fallbackError)}`,
      });
      throw fallbackError instanceof AiError
        ? fallbackError
        : new AiError("provider_failed", short(fallbackError), fallbackError);
    }
  }
}
