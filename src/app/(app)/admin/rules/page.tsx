import type { Metadata } from "next";
import {
  saveLineSettingsAction,
  saveRuleAction,
} from "@/app/actions/notifications";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { bangkokDate } from "@/lib/health/dates";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminRulesTitle };
}

interface RuleRow {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
  params: Record<string, number>;
  last_run_at: string | null;
  last_count: number | null;
}

async function loadAll() {
  const db = createAdminClient();
  const monthStart = `${bangkokDate(new Date()).slice(0, 7)}-01T00:00:00+07:00`;
  const [rules, settings, sent, ticks] = await Promise.all([
    db
      .from("automation_rules")
      .select(
        "key, title, description, enabled, params, last_run_at, last_count",
      )
      .order("sort_order", { ascending: true })
      .returns<RuleRow[]>(),
    db
      .from("notification_settings")
      .select("line_monthly_cap, line_reserve, halted_until, halted_reason")
      .maybeSingle<{
        line_monthly_cap: number;
        line_reserve: number;
        halted_until: string | null;
        halted_reason: string | null;
      }>(),
    db
      .from("notification_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", monthStart),
    db
      .from("cron_ticks")
      .select("id, started_at, finished_at, summary")
      .order("started_at", { ascending: false })
      .limit(8)
      .returns<
        {
          id: number;
          started_at: string;
          finished_at: string | null;
          summary: unknown;
        }[]
      >(),
  ]);
  return {
    rules: rules.data ?? [],
    settings: settings.data,
    sent: sent.count ?? 0,
    ticks: ticks.data ?? [],
  };
}

export default async function AdminRulesPage() {
  const [t, lang, { rules, settings, sent, ticks }] = await Promise.all([
    getT(),
    getLang(),
    loadAll(),
  ]);
  const halted =
    settings?.halted_until && new Date(settings.halted_until) > new Date();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminRulesTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminRulesHint}</p>
      </div>

      {!process.env.CRON_SECRET?.trim() ? (
        <p
          role="alert"
          className="border-danger bg-tint-danger rounded-xl border-2 px-3 py-2 text-sm font-medium"
        >
          {t.adminCronNoSecret}
        </p>
      ) : null}
      {!process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim() ? (
        <p
          role="status"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.adminLineNoToken}
        </p>
      ) : null}
      {halted && settings?.halted_until ? (
        <p
          role="alert"
          className="border-danger bg-tint-danger rounded-xl border-2 px-3 py-2 text-sm font-medium"
        >
          {fmt(t.adminLineHalted, {
            when: formatDateTime(lang, settings.halted_until),
            reason: settings.halted_reason ?? "",
          })}
        </p>
      ) : null}

      <form action={saveLineSettingsAction} className="card space-y-3">
        <p className="font-semibold">
          {fmt(t.adminLineUsage, {
            used: sent,
            cap: settings?.line_monthly_cap ?? 200,
          })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cap" className="label">
              {t.adminLineCap}
            </label>
            <input
              id="cap"
              name="cap"
              type="number"
              min={0}
              max={1000000}
              defaultValue={settings?.line_monthly_cap ?? 200}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="reserve" className="label">
              {t.adminLineReserve}
            </label>
            <input
              id="reserve"
              name="reserve"
              type="number"
              min={0}
              max={1000000}
              defaultValue={settings?.line_reserve ?? 20}
              className="field"
            />
          </div>
        </div>
        {halted ? (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="resume" className="size-5" />
            <span>{t.adminLineResume}</span>
          </label>
        ) : null}
        <button type="submit" className="btn btn-primary">
          {t.save}
        </button>
      </form>

      <ul className="space-y-4">
        {rules.map((r) => (
          <li key={r.key}>
            <form action={saveRuleAction} className="card space-y-3">
              <input type="hidden" name="key" value={r.key} />
              <div>
                <h2 className="font-semibold">
                  {r.title} <code className="text-muted text-xs">{r.key}</code>
                </h2>
                <p className="text-muted text-sm">{r.description}</p>
                <p className="text-muted text-sm">
                  {r.last_run_at
                    ? fmt(t.adminRuleLast, {
                        when: formatDateTime(lang, r.last_run_at),
                        n: r.last_count ?? 0,
                      })
                    : t.adminRuleNever}
                </p>
              </div>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={r.enabled}
                  className="size-5"
                />
                <span className="font-medium">{t.adminRuleEnabled}</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(r.params).map(([name, value]) => (
                  <div key={name}>
                    <label htmlFor={`${r.key}-${name}`} className="label">
                      {t[`adminRuleParam_${name}` as keyof Dict] ?? name}
                    </label>
                    <input
                      id={`${r.key}-${name}`}
                      name={`param.${name}`}
                      type="number"
                      min={0}
                      max={10000}
                      defaultValue={value}
                      className="field"
                    />
                  </div>
                ))}
              </div>
              <button type="submit" className="btn btn-secondary">
                {t.save}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <section className="space-y-2" aria-labelledby="ticks-h">
        <h2 id="ticks-h" className="font-semibold">
          {t.adminTickTitle}
        </h2>
        {ticks.length === 0 ? (
          <p className="card">{t.adminTickNone}</p>
        ) : (
          <ul className="space-y-2">
            {ticks.map((k) => (
              <li key={k.id} className="card text-sm">
                <p className="font-medium">
                  {formatDateTime(lang, k.started_at)}
                  {k.finished_at ? "" : " …"}
                </p>
                <p className="text-muted break-words">
                  {JSON.stringify(k.summary)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
