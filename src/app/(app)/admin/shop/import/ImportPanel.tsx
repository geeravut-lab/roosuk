"use client";

import { useRef, useState } from "react";
import { unzipSync } from "fflate";
import { Download, FileUp } from "lucide-react";
import {
  clearProductImagesAction,
  importProductsAction,
  uploadProductImageAction,
} from "@/app/actions/shop-admin";
import { Spinner } from "@/components/Spinner";
import { errorText, fmt, type Dict, type ErrorKey } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { shrinkImage } from "@/lib/image-resize";
import { PRODUCT_CSV_TEMPLATE, imageSkuOf } from "@/lib/shop/product";

interface Source {
  csv: string;
  /** lower-case base name → the photo */
  photos: Map<string, File>;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const base = (name: string) => (name.split("/").pop() ?? name).toLowerCase();
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** A ZIP (a CSV and the photos), or a CSV and photos chosen together, in one list of files. */
async function readSource(files: File[]): Promise<Source | null> {
  const photos = new Map<string, File>();
  let csv: string | null = null;
  const take = (name: string, bytes: Uint8Array | File) => {
    const ext = extOf(name);
    if (ext === "csv" && csv === null)
      return bytes instanceof File
        ? bytes.text().then((s) => void (csv = s))
        : void (csv = new TextDecoder().decode(bytes));
    if (MIME[ext]) {
      const file =
        bytes instanceof File
          ? bytes
          : new File([bytes as BlobPart], base(name), { type: MIME[ext] });
      photos.set(base(name), file);
    }
  };
  for (const f of files) {
    if (extOf(f.name) === "zip") {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [name, bytes] of Object.entries(entries))
        if (!name.endsWith("/") && !name.includes("__MACOSX"))
          await take(name, bytes);
    } else await take(f.name, f);
  }
  return csv === null ? null : { csv, photos };
}

type Phase =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | {
      kind: "done";
      saved: number;
      created: number;
      images: number;
      issues: { line: number; sku: string; fields: string[] }[];
      missing: string[];
    }
  | { kind: "error"; error: ErrorKey };

export function ImportPanel() {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [replace, setReplace] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + PRODUCT_CSV_TEMPLATE)}`;

  async function run() {
    const files = [...(input.current?.files ?? [])];
    if (files.length === 0) return;
    setPhase({ kind: "working", step: t.adminShopImporting });
    try {
      const src = await readSource(files);
      if (!src)
        return setPhase({ kind: "error", error: "err_shop_import_file" });
      const res = await importProductsAction(src.csv);
      if (res.error || !res.saved)
        return setPhase({
          kind: "error",
          error: res.error ?? "err_save_failed",
        });

      let images = 0;
      const missing: string[] = [];
      for (const p of res.saved) {
        // the CSV's own list of file names, else every photo named after the SKU
        const named = p.images.length
          ? p.images.map((n) => ({ name: n, file: src.photos.get(base(n)) }))
          : [...src.photos.entries()]
              .filter(
                ([n]) => imageSkuOf(n)?.toLowerCase() === p.sku.toLowerCase(),
              )
              .sort(([a], [b]) =>
                a.localeCompare(b, undefined, { numeric: true }),
              )
              .map(([n, file]) => ({ name: n, file }));
        const found = named.filter(
          (x): x is { name: string; file: File } => !!x.file,
        );
        missing.push(...named.filter((x) => !x.file).map((x) => x.name));
        if (found.length && replace) await clearProductImagesAction(p.id);
        for (const x of found) {
          setPhase({ kind: "working", step: `${p.sku} · ${x.name}` });
          const small = await shrinkImage(x.file, {
            maxSide: 1200,
            quality: 0.85,
          });
          const data = new FormData();
          data.set("productId", p.id);
          data.set("file", small);
          const r = await uploadProductImageAction(data);
          if (r.error) missing.push(`${x.name} (${errorText(r.error, t)})`);
          else images++;
        }
      }
      setPhase({
        kind: "done",
        saved: res.saved.length,
        created: res.saved.filter((s) => s.created).length,
        images,
        issues: res.issues ?? [],
        missing,
      });
      if (input.current) input.current.value = "";
    } catch (err) {
      console.error("[shop import] failed:", err);
      setPhase({ kind: "error", error: "err_shop_import_file" });
    }
  }

  const working = phase.kind === "working";
  return (
    <div className="space-y-3">
      <p className="text-sm">{t.adminShopImportHow}</p>
      <a
        href={href}
        download="roosuk-products-sample.csv"
        className="text-primary-strong inline-flex items-center gap-1 text-sm font-medium underline"
      >
        <Download className="size-4" aria-hidden />
        {t.adminShopImportTemplate}
      </a>
      <div>
        <label htmlFor="imp-files" className="label">
          <FileUp className="mr-1 inline size-4" aria-hidden />
          {t.adminShopImportFiles}
        </label>
        <input
          id="imp-files"
          ref={input}
          type="file"
          multiple
          accept=".zip,.csv,image/jpeg,image/png,image/webp"
          className="field"
          disabled={working}
        />
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
        />
        <span className="text-sm">{t.adminShopImportReplace}</span>
      </label>
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={working}
        onClick={run}
      >
        {working ? <Spinner /> : null}
        {working ? t.adminShopImporting : t.adminShopImportRun}
      </button>
      {phase.kind === "working" ? (
        <p role="status" className="text-muted text-sm">
          {phase.step}
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
      {phase.kind === "done" ? (
        <div
          role="status"
          className="bg-tint-secondary space-y-1 rounded-xl px-3 py-2 text-sm"
        >
          <p className="font-medium">
            {fmt(t.adminShopImportResult, {
              saved: phase.saved,
              created: phase.created,
              images: phase.images,
              issues: phase.issues.length,
            })}
          </p>
          {phase.issues.length ? (
            <ul className="list-disc pl-5">
              {phase.issues.map((i) => (
                <li key={`${i.line}-${i.sku}`}>
                  {fmt(t.adminShopImportIssue, {
                    line: i.line,
                    sku: i.sku || "—",
                    fields: i.fields
                      .map(
                        (f) =>
                          (t[`adminShopField_${f}` as keyof Dict] as
                            string | undefined) ?? f,
                      )
                      .join(", "),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          {phase.missing.length ? (
            <p>
              {fmt(t.adminShopImportNoPhoto, {
                names: phase.missing.join(", "),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
