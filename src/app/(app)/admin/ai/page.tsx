import type { Metadata } from "next";
import { CircleCheck, CircleOff } from "lucide-react";
import { PROVIDERS, TASK_ROUTES, apiKeyFor } from "@/lib/ai/registry";
import { resolveRoute } from "@/lib/ai/route";
import {
  invalidateAiSettingsCache,
  listProviderModels,
  loadAiSettings,
} from "@/lib/ai/server";
import { PROVIDER_IDS, TASK_KINDS } from "@/lib/ai/types";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiForm, type ProviderView, type TaskView } from "./AiForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminAiTitle };
}

interface EventRow {
  id: number;
  provider: string;
  task: string;
  status: string;
  error_code: string | null;
  message: string | null;
  created_at: string;
}

/** Providers whose key was seen on a free tier in the last 7 days (see eventCode in src/lib/ai/run.ts). */
async function recentFreeTierProviders(): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await createAdminClient()
    .from("ai_events")
    .select("provider")
    .eq("error_code", "free_tier")
    .gte("created_at", since)
    .limit(50)
    .returns<{ provider: string }[]>();
  return [...new Set((data ?? []).map((e) => e.provider))];
}

export default async function AdminAiPage() {
  // The admin just changed something: show the truth, not a 30-second-old copy.
  invalidateAiSettingsCache();
  const [t, lang, settings, modelLists, events, freeTier] = await Promise.all([
    getT(),
    getLang(),
    loadAiSettings(),
    Promise.all(PROVIDER_IDS.map((p) => listProviderModels(p))),
    createAdminClient()
      .from("ai_events")
      .select("id, provider, task, status, error_code, message, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<EventRow[]>(),
    recentFreeTierProviders(),
  ]);
  const freeTierProviders = freeTier;

  const providers: ProviderView[] = PROVIDER_IDS.map((id, i) => ({
    id,
    label: PROVIDERS[id].label,
    hasKey: !!apiKeyFor(id),
    envKey: PROVIDERS[id].envKey,
    models: modelLists[i],
  }));

  const tasks: TaskView[] = TASK_KINDS.map((task) => {
    const route = resolveRoute(task, settings, (p) => !!apiKeyFor(p));
    const o = settings.routes[task];
    return {
      task,
      primary: o?.primary ?? "",
      fallback: o?.fallback ?? "",
      models: Object.fromEntries(
        PROVIDER_IDS.map((p) => [p, settings.models[p]?.[task] ?? ""]),
      ),
      defaultPrimary: TASK_ROUTES[task].primary,
      defaultFallback: TASK_ROUTES[task].fallback,
      defaultModels: Object.fromEntries(
        PROVIDER_IDS.map((p) => [p, PROVIDERS[p].models[task]]),
      ),
      effective: route
        ? {
            primary: route.primary.provider,
            fallback: route.fallback?.provider ?? null,
          }
        : null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminAiTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminAiHint}</p>
        {settings.updatedAt ? (
          <p className="text-muted text-sm">
            {fmt(t.adminAiUpdated, {
              when: formatDateTime(lang, settings.updatedAt),
            })}
          </p>
        ) : null}
      </div>

      {freeTierProviders.map((p) => (
        <p
          key={p}
          role="alert"
          className="border-danger bg-tint-danger rounded-xl border-2 px-3 py-2 text-sm font-medium"
        >
          {fmt(t.adminAiFreeTier, {
            provider: PROVIDERS[p as keyof typeof PROVIDERS]?.label ?? p,
          })}
        </p>
      ))}

      <section className="space-y-2" aria-labelledby="keys-h">
        <h2 id="keys-h" className="font-semibold">
          {t.adminAiKeysTitle}
        </h2>
        <ul className="space-y-2">
          {providers.map((p) => (
            <li key={p.id} className="card flex items-start gap-3">
              {p.hasKey ? (
                <CircleCheck
                  className="text-primary-strong mt-0.5 size-5 shrink-0"
                  aria-hidden
                />
              ) : (
                <CircleOff className="mt-0.5 size-5 shrink-0" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="font-semibold">{p.label}</p>
                <p className="text-muted text-sm">
                  {p.hasKey
                    ? `${t.adminAiKeySet} · ${p.models.length ? t.adminAiModelsFromApi : t.adminAiModelsFromCode}`
                    : fmt(t.adminAiKeyMissing, { env: p.envKey })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="routing-h">
        <h2 id="routing-h" className="font-semibold">
          {t.adminAiRouting}
        </h2>
        <AiForm tasks={tasks} providers={providers} />
      </section>

      <section className="space-y-2" aria-labelledby="events-h">
        <h2 id="events-h" className="font-semibold">
          {t.adminAiEvents}
        </h2>
        <p className="text-muted text-sm">{t.adminAiEventsNote}</p>
        {(events.data ?? []).length === 0 ? (
          <p className="card">{t.adminAiEventsNone}</p>
        ) : (
          <ul className="space-y-2">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="card text-sm">
                <p className="font-semibold">
                  {e.status} · {e.provider} · {e.task}
                  {e.error_code ? ` · ${e.error_code}` : ""}
                </p>
                {e.message ? <p className="break-words">{e.message}</p> : null}
                <p className="text-muted">
                  {formatDateTime(lang, e.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
