import { z } from "zod";
import { PROVIDERS, TASK_ROUTES, isProviderId, isTaskKind } from "./registry";
import { TASK_KINDS, type ProviderId, type TaskKind } from "./types";

/**
 * Admin-editable routing (table `ai_settings`). Everything is optional and
 * parsed tolerantly: a bad or half-edited row degrades to the code defaults
 * instead of taking AI down (docs/11, rule 1–2).
 */
export interface AiSettings {
  /** Per task: replace the primary and/or fallback; fallback "none" turns it off. */
  routes: Partial<
    Record<TaskKind, { primary?: ProviderId; fallback?: ProviderId | "none" }>
  >;
  /** provider → task → model id */
  models: Partial<Record<ProviderId, Partial<Record<TaskKind, string>>>>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  routes: {},
  models: {},
  updatedAt: null,
  updatedBy: null,
};

const MODEL_ID = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:/-]+$/);

export function parseAiSettings(
  row: Record<string, unknown> | null | undefined,
): AiSettings {
  const out: AiSettings = { ...DEFAULT_AI_SETTINGS, routes: {}, models: {} };
  if (!row) return out;

  const routes = row.route_overrides;
  if (routes && typeof routes === "object") {
    for (const [task, v] of Object.entries(routes)) {
      if (!isTaskKind(task) || !v || typeof v !== "object") continue;
      const r = v as Record<string, unknown>;
      const entry: NonNullable<AiSettings["routes"][TaskKind]> = {};
      if (isProviderId(r.primary)) entry.primary = r.primary;
      if (isProviderId(r.fallback) || r.fallback === "none")
        entry.fallback = r.fallback as ProviderId | "none";
      if (Object.keys(entry).length) out.routes[task] = entry;
    }
  }

  const models = row.model_overrides;
  if (models && typeof models === "object") {
    for (const [provider, byTask] of Object.entries(models)) {
      if (!isProviderId(provider) || !byTask || typeof byTask !== "object")
        continue;
      for (const [task, id] of Object.entries(byTask)) {
        const parsed = MODEL_ID.safeParse(id);
        if (isTaskKind(task) && parsed.success)
          (out.models[provider] ??= {})[task] = parsed.data;
      }
    }
  }

  out.updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;
  out.updatedBy = typeof row.updated_by === "string" ? row.updated_by : null;
  return out;
}

export interface Route {
  task: TaskKind;
  primary: { provider: ProviderId; model: string };
  fallback: { provider: ProviderId; model: string } | null;
  /** Set when the configured primary had no API key and was replaced. */
  primarySkipped: ProviderId | null;
}

/**
 * Three layers: ai_settings (admin) → code defaults, with a guard for
 * "configured but its key is missing": use the other provider rather than fail
 * a user's request over a configuration problem (and say so via primarySkipped
 * so it gets logged).
 */
export function resolveRoute(
  task: TaskKind,
  settings: AiSettings,
  hasKey: (p: ProviderId) => boolean,
): Route | null {
  const base = TASK_ROUTES[task];
  const o = settings.routes[task];
  let primary = o?.primary ?? base.primary;
  const fb = o?.fallback === "none" ? null : (o?.fallback ?? base.fallback);
  let fallback = fb && fb !== primary ? fb : null;

  const model = (p: ProviderId) =>
    settings.models[p]?.[task] ?? PROVIDERS[p].models[task];

  let primarySkipped: ProviderId | null = null;
  if (!hasKey(primary)) {
    primarySkipped = primary;
    if (fallback && hasKey(fallback)) {
      primary = fallback;
      fallback = null;
    } else {
      // Last resort: any other provider that has a key.
      const other = (Object.keys(PROVIDERS) as ProviderId[]).find(
        (p) => p !== primary && hasKey(p),
      );
      if (!other) return null;
      primary = other;
      fallback = null;
    }
  } else if (fallback && !hasKey(fallback)) {
    fallback = null;
  }

  return {
    task,
    primary: { provider: primary, model: model(primary) },
    fallback: fallback ? { provider: fallback, model: model(fallback) } : null,
    primarySkipped,
  };
}

/**
 * Which errors are worth the one fallback call. 429/5xx/network are transient;
 * 401/403 mean the primary's key died — exactly when a second provider keeps
 * the app alive (and every switch is logged, so a dead key is never hidden).
 * Other 4xx are OUR request or model name being wrong and would fail the same
 * way on the fallback.
 */
export function shouldTryFallback(error: unknown): boolean {
  const e = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    name?: unknown;
    message?: unknown;
  };
  const status = typeof e?.status === "number" ? e.status : e?.statusCode;
  if (typeof status === "number")
    return status === 429 || status === 401 || status === 403 || status >= 500;
  return /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|overloaded/i.test(
    `${e?.name ?? ""} ${e?.code ?? ""} ${e?.message ?? ""}`,
  );
}

export function errorStatus(error: unknown): string | null {
  const e = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  const s = e?.status ?? e?.statusCode ?? e?.code;
  return typeof s === "number" || typeof s === "string" ? String(s) : null;
}

export { TASK_KINDS };
