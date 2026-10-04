"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { scanLabAction, type LabScanState } from "@/app/actions/lab";
import { shrinkImage } from "@/lib/image-resize";
import { errorText, fmt } from "@/lib/i18n/dict";
import { KeepFileChoice } from "@/components/KeepFileChoice";
import type { KeepMode } from "@/lib/files/types";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";
import { Spinner } from "@/components/Spinner";

const initial: LabScanState = {};

export function LabScanForm({ keepMode }: { keepMode: KeepMode }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(scanLabAction, initial);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    let file = picked;
    if (picked.type.startsWith("image/")) {
      // Text must stay legible: a larger long side and higher quality than for food.
      file = await shrinkImage(picked, { maxSide: 2000, quality: 0.85 });
      const dt = new DataTransfer();
      dt.items.add(file);
      if (input.current) input.current.files = dt.files;
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
    setName(picked.name);
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <input
        ref={input}
        id="file"
        name="file"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onPick}
        required
      />

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={t.labPreviewAlt}
          className="mx-auto max-h-80 w-full rounded-2xl object-contain"
        />
      ) : null}
      {name && !preview ? (
        <p className="card font-medium break-all">
          {fmt(t.labFileSelected, { name })}
        </p>
      ) : null}

      <label
        htmlFor="file"
        className="btn btn-secondary w-full cursor-pointer has-[:focus-visible]:outline-2"
      >
        <FileUp className="size-5" aria-hidden />
        {name ? t.labChooseAnother : t.labChoose}
      </label>

      <KeepFileChoice mode={keepMode} />

      {state.error ? (
        <p
          role="alert"
          className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}

      {name ? (
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary w-full"
        >
          {pending ? <Spinner /> : null}
          {pending ? t.labAnalyzing : t.labAnalyze}
        </button>
      ) : null}
      <p role="status" className="sr-only">
        {pending ? t.labAnalyzing : ""}
      </p>
      <p className="text-muted text-sm">{t.labPrivacy}</p>
    </form>
  );
}
