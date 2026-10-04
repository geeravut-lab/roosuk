"use client";

import { useRef, useState } from "react";
import { Unzip, UnzipInflate } from "fflate";
import { Download, FileUp } from "lucide-react";
import { importObservationsAction } from "@/app/actions/wearables";
import { Spinner } from "@/components/Spinner";
import { errorText, fmt, type Dict, type ErrorKey } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { addDays } from "@/lib/health/dates";
import { AppleHealthAggregator } from "@/lib/wearables/apple";
import { CSV_TEMPLATE, parseObservationCsv } from "@/lib/wearables/csv";
import type { BatchResult, RawObservation } from "@/lib/wearables/types";

const CHUNK = 400;
const APPLE_DAYS = 90;

type Phase =
  | { kind: "idle" }
  | { kind: "working"; mb: number }
  | { kind: "done"; total: BatchResult }
  | { kind: "error"; error: ErrorKey };

const empty = (): BatchResult => ({ accepted: 0, rejected: 0, reasons: {} });

/** Streams `export.zip` (or `export.xml`) through the day-by-day aggregator without holding the file in memory. */
async function readApple(
  file: File,
  today: string,
  onProgress: (mb: number) => void,
): Promise<RawObservation[]> {
  const agg = new AppleHealthAggregator(addDays(today, -APPLE_DAYS));
  const decoder = new TextDecoder();
  const reader = file.stream().getReader();
  let read = 0;
  const isZip = /\.zip$/i.test(file.name);
  let sawXml = !isZip;

  if (isZip) {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (f) => {
      if (!/(^|\/)export\.xml$/i.test(f.name)) return;
      sawXml = true;
      f.ondata = (err, chunk, final) => {
        if (err) throw err;
        agg.push(decoder.decode(chunk, { stream: !final }));
      };
      f.start();
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.length;
      onProgress(read / 1_048_576);
      unzip.push(value, false);
    }
    unzip.push(new Uint8Array(0), true);
  } else {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.length;
      onProgress(read / 1_048_576);
      agg.push(decoder.decode(value, { stream: true }));
    }
    agg.push(decoder.decode());
  }
  if (!sawXml) throw new Error("no export.xml");
  return agg.finish();
}

async function send(
  source: "apple_health" | "csv",
  rows: RawObservation[],
): Promise<{ total: BatchResult } | { error: ErrorKey }> {
  const total = empty();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const r = await importObservationsAction(source, rows.slice(i, i + CHUNK));
    if (r.error || !r.result) return { error: r.error ?? "err_unknown" };
    total.accepted += r.result.accepted;
    total.rejected += r.result.rejected;
    for (const [k, n] of Object.entries(r.result.reasons))
      total.reasons[k as keyof BatchResult["reasons"]] =
        (total.reasons[k as keyof BatchResult["reasons"]] ?? 0) + (n ?? 0);
  }
  return { total };
}

function Importer({
  id,
  label,
  hint,
  accept,
  enabled,
  today,
  source,
  extra,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  enabled: boolean;
  today: string;
  source: "apple_health" | "csv";
  extra?: React.ReactNode;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function run() {
    const file = input.current?.files?.[0];
    if (!file) return;
    setPhase({ kind: "working", mb: 0 });
    try {
      const rows =
        source === "apple_health"
          ? await readApple(file, today, (mb) =>
              setPhase({ kind: "working", mb }),
            )
          : await (async () => {
              const parsed = parseObservationCsv(await file.text());
              if (!parsed.ok) throw new Error(parsed.reason);
              return parsed.rows;
            })();
      if (rows.length === 0)
        return setPhase({ kind: "error", error: "err_wearable_nodata" });
      const out = await send(source, rows);
      setPhase(
        "error" in out
          ? { kind: "error", error: out.error }
          : { kind: "done", total: out.total },
      );
      if (!("error" in out) && input.current) input.current.value = "";
    } catch (err) {
      console.error("[wearables] could not read the file:", err);
      setPhase({ kind: "error", error: "err_wearable_file" });
    }
  }

  const working = phase.kind === "working";
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="label">
        <FileUp className="mr-1 inline size-4" aria-hidden />
        {label}
      </label>
      <p className="text-muted text-sm">{hint}</p>
      {extra}
      {enabled ? (
        <>
          <input
            id={id}
            ref={input}
            type="file"
            accept={accept}
            className="field"
            disabled={working}
          />
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={working}
            onClick={run}
          >
            {working ? <Spinner /> : null}
            {working ? t.wearImporting : t.wearImportRun}
          </button>
        </>
      ) : (
        <p className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
          {t.wearImportNeedConsent}
        </p>
      )}
      {phase.kind === "working" && phase.mb > 0 ? (
        <p role="status" className="text-muted text-sm">
          {fmt(t.wearImportProgress, { n: phase.mb.toFixed(1) })}
        </p>
      ) : null}
      {phase.kind === "error" ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(phase.error, t)}
        </p>
      ) : null}
      {phase.kind === "done" ? <Done t={t} total={phase.total} /> : null}
    </div>
  );
}

function Done({ t, total }: { t: Dict; total: BatchResult }) {
  const reasons = Object.entries(total.reasons)
    .map(([k, n]) => `${t[`wearReject_${k}` as keyof Dict]} ×${n}`)
    .join(" · ");
  return (
    <p
      role="status"
      className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
    >
      {fmt(t.wearImportDone, {
        accepted: total.accepted,
        rejected: total.rejected,
      })}
      {reasons ? ` (${reasons})` : ""}
    </p>
  );
}

export function ImportPanel({
  today,
  appleOn,
  csvOn,
}: {
  today: string;
  appleOn: boolean;
  csvOn: boolean;
}) {
  const { t } = useI18n();
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;
  return (
    <div className="space-y-6">
      <Importer
        id="wear-apple"
        label={t.wearImportApple}
        hint={t.wearImportAppleHint}
        accept=".zip,.xml,application/zip,text/xml,application/xml"
        enabled={appleOn}
        today={today}
        source="apple_health"
      />
      <Importer
        id="wear-csv"
        label={t.wearImportCsv}
        hint={t.wearImportCsvHint}
        accept=".csv,text/csv"
        enabled={csvOn}
        today={today}
        source="csv"
        extra={
          <a
            href={csvHref}
            download="roosuk-wearables-sample.csv"
            className="text-primary-strong inline-flex items-center gap-1 text-sm font-medium underline"
          >
            <Download className="size-4" aria-hidden />
            {t.wearImportCsvTemplate}
          </a>
        }
      />
    </div>
  );
}
