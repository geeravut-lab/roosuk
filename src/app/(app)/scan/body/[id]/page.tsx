import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteBodyFileAction,
  deleteBodyScanAction,
  updateBodyWeightAction,
} from "@/app/actions/body";
import {
  SourceFileCard,
  type SourceFileRef,
} from "@/components/SourceFileCard";
import { requireUser } from "@/lib/auth/server";
import { bandsTouched, type BmiBand, type VisualNote } from "@/lib/body/body";
import { errorText, fmt, type Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).bodyResultTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ScanRow {
  id: string;
  height_cm: number;
  weight_kg: number | null;
  est_weight_low: number | null;
  est_weight_high: number | null;
  bmi_low: number;
  bmi_high: number;
  bmi_band: BmiBand;
  bmi_basis: "measured" | "estimated";
  face_note: VisualNote;
  palm_note: VisualNote;
  created_at: string;
  source_file: SourceFileRef | null;
}

export default async function BodyResultPage({
  params,
  searchParams,
}: PageProps<"/scan/body/[id]">) {
  const { id } = await params;
  const { error, file: fileNote } = await searchParams;
  const user = await requireUser();
  if (!UUID.test(id)) notFound();

  // The user's own client: RLS only returns their rows.
  const supabase = await createClient();
  const [t, lang, { data: scan }] = await Promise.all([
    getT(),
    getLang(),
    supabase
      .from("body_scans")
      .select(
        "id, height_cm, weight_kg, est_weight_low, est_weight_high, bmi_low, bmi_high, bmi_band, bmi_basis, face_note, palm_note, created_at, source_file:source_files(id, mime)",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<ScanRow>(),
  ]);
  if (!scan) notFound();

  const bmiLow = Number(scan.bmi_low);
  const bmiHigh = Number(scan.bmi_high);
  const touched = bandsTouched(bmiLow, bmiHigh);
  const bandLabel = (b: BmiBand) => t[`bodyBand_${b}` as keyof Dict];
  const bmiText = bmiLow === bmiHigh ? `${bmiLow}` : `${bmiLow}–${bmiHigh}`;
  const height = Number(scan.height_cm);
  const notes = (
    [
      ["bodyFace", scan.face_note],
      ["bodyPalm", scan.palm_note],
    ] as const
  ).filter(([, v]) => v !== "not_provided");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.bodyResultTitle}
        </h1>
        <p className="text-muted">{formatDate(lang, scan.created_at)}</p>
      </div>

      {typeof error === "string" ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}
      {fileNote === "failed" ? (
        <p role="status" className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
          {t.sourceFileFailed}
        </p>
      ) : null}

      <section
        className={`card space-y-2 ${scan.bmi_band === "healthy" ? "bg-tint-secondary" : "bg-tint-warn"}`}
        aria-labelledby="bmi-h"
      >
        <h2 id="bmi-h" className="text-muted text-sm font-semibold">
          {t.bodyBmi}
        </h2>
        <p className="text-primary-strong text-4xl font-bold">{bmiText}</p>
        <p className="font-semibold">
          {fmt(t.bodyBandIs, {
            band:
              touched.length === 1
                ? bandLabel(touched[0])
                : fmt(t.bodyBandRange, {
                    a: bandLabel(touched[0]),
                    b: bandLabel(touched[1]),
                  }),
          })}
        </p>
        <p className="text-sm">
          {scan.bmi_basis === "measured"
            ? fmt(t.bodyBmiMeasured, { w: Number(scan.weight_kg), h: height })
            : fmt(t.bodyBmiEstimated, { h: height })}
        </p>
        {scan.est_weight_low !== null && scan.est_weight_high !== null ? (
          <p className="text-muted text-sm">
            {fmt(t.bodyEstWeight, {
              low: Number(scan.est_weight_low),
              high: Number(scan.est_weight_high),
            })}
            {scan.bmi_basis === "estimated" ? ` · ${t.bodyEstNote}` : ""}
          </p>
        ) : null}
        <p className="font-medium">
          {t[`bodyAdvice_${scan.bmi_band}` as keyof Dict]}
        </p>
        <p className="text-muted text-xs">{t.bodyAsianNote}</p>
      </section>

      {notes.length > 0 ? (
        <section className="card space-y-2" aria-labelledby="notes-h">
          <h2 id="notes-h" className="font-semibold">
            {t.bodyNotesTitle}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {notes.map(([prefix, v]) => (
              <li key={prefix}>{t[`${prefix}_${v}` as keyof Dict]}</li>
            ))}
          </ul>
          <p className="text-muted text-xs">{t.bodyNotesCaveat}</p>
        </section>
      ) : null}

      <form action={updateBodyWeightAction} className="card space-y-2">
        <input type="hidden" name="scanId" value={scan.id} />
        <label htmlFor="weight" className="label">
          {t.bodySetWeight}
        </label>
        <input
          id="weight"
          name="weight"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={scan.weight_kg ?? ""}
          className="field"
        />
        <p className="text-muted text-sm">{t.bodyWeightHint}</p>
        <button type="submit" className="btn btn-secondary w-full">
          {t.bodySaveWeight}
        </button>
      </form>

      <SourceFileCard t={t} file={scan.source_file}>
        <form action={deleteBodyFileAction}>
          <input type="hidden" name="scanId" value={scan.id} />
          <button type="submit" className="btn btn-ghost w-full">
            {t.sourceFileDelete}
          </button>
        </form>
      </SourceFileCard>

      <p className="text-muted text-sm">{t.bodyDisclaimer}</p>
      {scan.bmi_band !== "healthy" ? (
        <Link
          href="/checkup-interest"
          className="card hover:bg-tint-primary block"
        >
          <span className="block font-semibold">{t.leadCta}</span>
          <span className="text-muted block text-sm">{t.leadCtaHint}</span>
        </Link>
      ) : null}
      <Link href="/scan/body" className="btn btn-primary w-full">
        {t.scanBodyTitle}
      </Link>
      <form action={deleteBodyScanAction}>
        <input type="hidden" name="scanId" value={scan.id} />
        <button type="submit" className="btn btn-ghost w-full">
          {t.bodyDelete}
        </button>
      </form>
    </div>
  );
}
