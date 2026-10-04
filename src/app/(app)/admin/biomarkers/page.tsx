import type { Metadata } from "next";
import {
  approveExtraAction,
  deleteExtraAction,
  setUnknownStatusAction,
  withdrawExtraAction,
} from "@/app/actions/biomarkers";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMPTY_FIELDS, MarkerForm, type MarkerFields } from "./MarkerForm";
import { SubmitButton } from "@/components/SubmitButton";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminBiomarkersTitle };
}

interface UnknownRow {
  normalized_name: string;
  display_name: string;
  unit_sample: string;
  times_seen: number;
  status: "new" | "resolved" | "ignored";
}

interface ExtraDbRow {
  key: string;
  th: string;
  en: string;
  unit: string;
  normal_lo: number | string | null;
  normal_hi: number | string | null;
  watch_lo: number | string | null;
  watch_hi: number | string | null;
  aliases: string[];
  conversions: { unit: string; factor: number }[] | null;
  source_note: string;
  status: "draft" | "approved";
  approved_at: string | null;
}

const text = (v: number | string | null) =>
  v === null || v === undefined ? "" : String(Number(v));

function toFields(r: ExtraDbRow): MarkerFields {
  return {
    key: r.key,
    th: r.th,
    en: r.en,
    unit: r.unit,
    normalLo: text(r.normal_lo),
    normalHi: text(r.normal_hi),
    watchLo: text(r.watch_lo),
    watchHi: text(r.watch_hi),
    aliases: r.aliases.join("\n"),
    conversions: (r.conversions ?? [])
      .map((c) => `${c.unit} = ${c.factor}`)
      .join("\n"),
    sourceNote: r.source_note,
  };
}

export default async function AdminBiomarkersPage() {
  const db = createAdminClient();
  const [t, lang, unknown, extras] = await Promise.all([
    getT(),
    getLang(),
    db
      .from("lab_unknown_markers")
      .select("normalized_name, display_name, unit_sample, times_seen, status")
      .neq("status", "resolved")
      .order("times_seen", { ascending: false })
      .limit(100)
      .returns<UnknownRow[]>(),
    db
      .from("biomarker_extras")
      .select(
        "key, th, en, unit, normal_lo, normal_hi, watch_lo, watch_hi, aliases, conversions, source_note, status, approved_at",
      )
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<ExtraDbRow[]>(),
  ]);
  const queue = (unknown.data ?? []).filter((u) => u.status === "new");
  const ignored = (unknown.data ?? []).filter((u) => u.status === "ignored");
  const open = t.bmOpen;
  const bounds = (lo: number | string | null, hi: number | string | null) =>
    lo === null && hi === null
      ? open
      : `${lo === null ? open : text(lo)} – ${hi === null ? open : text(hi)}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminBiomarkersTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminBiomarkersHint}</p>
      </div>

      <section className="space-y-3" aria-labelledby="bm-unknown">
        <h2 id="bm-unknown" className="text-lg font-semibold">
          {t.bmUnknownTitle}
        </h2>
        <p className="text-muted text-sm">{t.bmUnknownHint}</p>
        {queue.length === 0 ? (
          <p className="card text-sm">{t.bmUnknownNone}</p>
        ) : (
          <ul className="space-y-3">
            {queue.map((u) => (
              <li key={u.normalized_name} className="card space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="font-semibold">{u.display_name}</p>
                  <p className="text-muted text-sm">
                    {fmt(t.bmSeen, { n: u.times_seen })}
                    {u.unit_sample
                      ? ` · ${fmt(t.bmUnitSeen, { unit: u.unit_sample })}`
                      : ""}
                  </p>
                </div>
                <details className="space-y-3">
                  <summary className="btn btn-secondary inline-flex cursor-pointer">
                    {t.bmCreate}
                  </summary>
                  <div className="pt-3">
                    <MarkerForm
                      idPrefix={`u-${u.normalized_name.replace(/[^a-z0-9]/gi, "_")}`}
                      initialFields={{
                        ...EMPTY_FIELDS,
                        en: u.display_name,
                        unit: u.unit_sample,
                        aliases: u.display_name,
                      }}
                      suggestName={u.display_name}
                      suggestUnit={u.unit_sample}
                    />
                  </div>
                </details>
                <form action={setUnknownStatusAction}>
                  <input type="hidden" name="name" value={u.normalized_name} />
                  <input type="hidden" name="status" value="ignored" />
                  <SubmitButton className="btn btn-ghost">
                    {t.bmIgnore}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        {ignored.length > 0 ? (
          <details className="card">
            <summary className="cursor-pointer text-sm font-semibold">
              {t.bmIgnoredTitle} ({ignored.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {ignored.map((u) => (
                <li
                  key={u.normalized_name}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span>
                    {u.display_name} · {fmt(t.bmSeen, { n: u.times_seen })}
                  </span>
                  <form action={setUnknownStatusAction} className="ml-auto">
                    <input
                      type="hidden"
                      name="name"
                      value={u.normalized_name}
                    />
                    <input type="hidden" name="status" value="new" />
                    <SubmitButton className="btn btn-ghost">
                      {t.bmRestore}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="bm-extras">
        <h2 id="bm-extras" className="text-lg font-semibold">
          {t.bmExtrasTitle}
        </h2>
        {(extras.data ?? []).length === 0 ? (
          <p className="card text-sm">{t.bmExtrasNone}</p>
        ) : (
          <ul className="space-y-3">
            {(extras.data ?? []).map((r) => (
              <li key={r.key} className="card space-y-2">
                <div>
                  <p className="font-semibold">
                    {lang === "th" ? r.th : r.en}{" "}
                    <span className="text-muted text-sm font-normal">
                      ({r.key}, {r.unit})
                    </span>
                  </p>
                  <p className="text-sm">
                    {fmt(t.bmRange, {
                      normal: bounds(r.normal_lo, r.normal_hi),
                      watch: bounds(
                        r.watch_lo ?? r.normal_lo,
                        r.watch_hi ?? r.normal_hi,
                      ),
                    })}
                  </p>
                  <p className="text-muted text-sm">
                    {fmt(t.bmSourceShown, { source: r.source_note })}
                  </p>
                  <p
                    className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                      r.status === "approved"
                        ? "bg-tint-secondary"
                        : "bg-tint-warn"
                    }`}
                  >
                    {r.status === "approved"
                      ? t.bmStatusApproved
                      : t.bmStatusDraft}
                  </p>
                  {r.status === "approved" && r.approved_at ? (
                    <p className="text-muted text-xs">
                      {fmt(t.bmApprovedAt, {
                        when: formatDateTime(lang, r.approved_at),
                      })}
                    </p>
                  ) : null}
                </div>

                {r.status === "draft" ? (
                  <form
                    action={approveExtraAction}
                    className="space-y-2 rounded-xl border border-black/10 p-3"
                  >
                    <input type="hidden" name="key" value={r.key} />
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="doctor"
                        required
                        className="mt-1"
                      />
                      <span>{t.bmDoctor}</span>
                    </label>
                    <SubmitButton className="btn btn-primary">
                      {t.bmApprove}
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={withdrawExtraAction}>
                    <input type="hidden" name="key" value={r.key} />
                    <SubmitButton className="btn btn-secondary">
                      {t.bmWithdraw}
                    </SubmitButton>
                  </form>
                )}

                <details>
                  <summary className="cursor-pointer text-sm font-semibold">
                    {t.bmEdit}
                  </summary>
                  <div className="space-y-3 pt-3">
                    <p className="text-muted text-sm">{t.bmEditNote}</p>
                    <MarkerForm
                      idPrefix={`e-${r.key}`}
                      editingKey={r.key}
                      initialFields={toFields(r)}
                    />
                  </div>
                </details>

                <form action={deleteExtraAction}>
                  <input type="hidden" name="key" value={r.key} />
                  <SubmitButton className="btn btn-ghost">
                    {t.bmDelete}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="bm-new">
        <h2 id="bm-new" className="text-lg font-semibold">
          {t.bmFormNew}
        </h2>
        <div className="card">
          <MarkerForm idPrefix="new" initialFields={EMPTY_FIELDS} />
        </div>
      </section>
    </div>
  );
}
