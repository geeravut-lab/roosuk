import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmLabAction, deleteLabReportAction } from "@/app/actions/lab";
import { LabStatusChip } from "@/components/LabStatusChip";
import { biomarkerByKey } from "@/config/biomarkers";
import { requireUser } from "@/lib/auth/server";
import { bangkokDate } from "@/lib/health/dates";
import { errorText, fmt } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import {
  countOutOfRange,
  formatRange,
  parseStoredLabItems,
  sortBySeverity,
} from "@/lib/lab/lab";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).labReviewTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LabReportPage({
  params,
  searchParams,
}: PageProps<"/scan/lab/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  if (!UUID.test(id)) notFound();

  // The user's own client: RLS only returns their rows.
  const supabase = await createClient();
  const [t, lang, { data: report }] = await Promise.all([
    getT(),
    getLang(),
    supabase
      .from("lab_reports")
      .select("id, status, collected_on, items")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<{
        id: string;
        status: "draft" | "confirmed";
        collected_on: string | null;
        items: unknown;
      }>(),
  ]);
  if (!report) notFound();

  const items = parseStoredLabItems(report.items);
  const today = bangkokDate(new Date());

  if (report.status === "draft") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-primary-strong text-2xl font-bold">
            {t.labReviewTitle}
          </h1>
          <p className="text-muted">{t.labReviewHint}</p>
        </div>

        {typeof error === "string" ? (
          <p
            role="alert"
            className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
          >
            {errorText(error, t)}
          </p>
        ) : null}

        <form action={confirmLabAction} className="space-y-4">
          <input type="hidden" name="reportId" value={report.id} />
          <div className="card">
            <label htmlFor="collectedOn" className="label">
              {t.labDate}
            </label>
            <input
              id="collectedOn"
              name="collectedOn"
              type="date"
              required
              max={today}
              defaultValue={report.collected_on ?? ""}
              className="field"
            />
          </div>

          <ul className="space-y-3">
            {items.map((it, i) => (
              <li key={i} className="card space-y-3">
                <div>
                  <p className="text-lg font-semibold">{it.name}</p>
                  {it.printed_range ? (
                    <p className="text-muted text-sm">
                      {fmt(t.labRefPrinted, { range: it.printed_range })}
                    </p>
                  ) : null}
                  {it.confidence < 0.7 ? (
                    <p className="text-sm font-medium">{t.labLowConfidence}</p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor={`value-${i}`} className="label">
                    {t.labValue}{" "}
                    <span className="text-muted font-normal">
                      (
                      {it.unit
                        ? fmt(t.labUnit, { unit: it.unit })
                        : t.labNoUnit}
                      )
                    </span>
                  </label>
                  <input
                    id={`value-${i}`}
                    name={`value.${i}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    defaultValue={it.value}
                    className="field"
                  />
                </div>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name={`remove.${i}`}
                    className="size-5 shrink-0"
                  />
                  <span>{t.labRemove}</span>
                </label>
              </li>
            ))}
          </ul>

          <p className="text-muted text-sm">{t.labDisclaimer}</p>
          <button type="submit" className="btn btn-primary w-full">
            {t.labConfirm}
          </button>
        </form>

        <form action={deleteLabReportAction}>
          <input type="hidden" name="reportId" value={report.id} />
          <button type="submit" className="btn btn-ghost w-full">
            {t.labDiscard}
          </button>
        </form>
      </div>
    );
  }

  // Previous value of each marker (latest result before this report's date), for a gentle comparison.
  const keys = [
    ...new Set(items.map((i) => i.marker_key).filter((k): k is string => !!k)),
  ];
  const previous = new Map<
    string,
    { value: number; unit: string; date: string }
  >();
  if (keys.length && report.collected_on) {
    const { data: older } = await supabase
      .from("lab_results")
      .select("marker_key, value, unit, collected_on")
      .in("marker_key", keys)
      .lt("collected_on", report.collected_on)
      .order("collected_on", { ascending: false })
      .limit(300)
      .returns<
        {
          marker_key: string;
          value: number;
          unit: string;
          collected_on: string;
        }[]
      >();
    for (const r of older ?? [])
      if (!previous.has(r.marker_key))
        previous.set(r.marker_key, {
          value: r.value,
          unit: r.unit,
          date: r.collected_on,
        });
  }

  const outside = countOutOfRange(items);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.labSavedTitle}
        </h1>
        {report.collected_on ? (
          <p className="text-muted">{formatDate(lang, report.collected_on)}</p>
        ) : null}
      </div>

      <p className="card font-medium">
        {outside > 0 ? fmt(t.labSummary, { n: outside }) : t.labSummaryNone}
      </p>

      <ul className="space-y-3">
        {sortBySeverity(items).map((it, i) => {
          const marker = biomarkerByKey(it.marker_key);
          const prev = it.marker_key ? previous.get(it.marker_key) : undefined;
          return (
            <li key={i} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{marker ? marker.th : it.name}</p>
                <LabStatusChip t={t} status={it.status} />
              </div>
              <p className="text-2xl font-bold">
                {it.value}{" "}
                <span className="text-muted text-base font-medium">
                  {it.unit}
                </span>
              </p>
              {marker && it.status !== "unknown" ? (
                <p className="text-muted text-sm">
                  {fmt(t.labRefOurs, { range: formatRange(marker) })}
                </p>
              ) : (
                <p className="text-muted text-sm">{t.labUnknownNote}</p>
              )}
              {it.printed_range ? (
                <p className="text-muted text-sm">
                  {fmt(t.labRefPrinted, { range: it.printed_range })}
                </p>
              ) : null}
              {prev ? (
                <p className="text-sm">
                  {fmt(t.labPrevious, {
                    value: `${prev.value} ${prev.unit}`.trim(),
                    date: formatDate(lang, prev.date),
                  })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-muted text-sm">{t.labDisclaimer}</p>
      <Link href="/scan/lab" className="btn btn-primary w-full">
        {t.labScanAnother}
      </Link>
      <Link href="/timeline" className="btn btn-secondary w-full">
        {t.foodGoTimeline}
      </Link>
      <form action={deleteLabReportAction}>
        <input type="hidden" name="reportId" value={report.id} />
        <button type="submit" className="btn btn-ghost w-full">
          {t.labDelete}
        </button>
      </form>
    </div>
  );
}
