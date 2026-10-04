"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Images } from "lucide-react";
import { scanFoodAction, type ScanState } from "@/app/actions/food";
import { shrinkImage } from "@/lib/image-resize";
import { errorText } from "@/lib/i18n/dict";
import { KeepFileChoice } from "@/components/KeepFileChoice";
import type { KeepMode } from "@/lib/files/types";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";
import { Spinner } from "@/components/Spinner";

const initial: ScanState = {};

export function FoodScanForm({ keepMode }: { keepMode: KeepMode }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(scanFoodAction, initial);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  // Both pickers (camera / gallery) end up in the single named `photo` input.
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const small = await shrinkImage(picked);
    // Swap the (possibly 8 MB) original for the shrunken copy in the same input.
    const dt = new DataTransfer();
    dt.items.add(small);
    if (input.current) input.current.files = dt.files;
    setPreview(URL.createObjectURL(small));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        ref={input}
        id="photo"
        name="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onPick}
        required
      />

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={t.foodPreviewAlt}
          className="mx-auto max-h-80 w-full rounded-2xl object-contain"
        />
      ) : null}

      {/* No name/required: only a hand-over to the `photo` input above. capture opens the camera directly. */}
      <input
        id="photo-camera"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={onPick}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <label
          htmlFor="photo-camera"
          className="btn btn-secondary w-full cursor-pointer has-[:focus-visible]:outline-2"
        >
          <Camera className="size-5" aria-hidden />
          {t.foodTakePhoto}
        </label>
        <label
          htmlFor="photo"
          className="btn btn-secondary w-full cursor-pointer has-[:focus-visible]:outline-2"
        >
          <Images className="size-5" aria-hidden />
          {preview ? t.foodChooseAnother : t.foodChoose}
        </label>
      </div>

      <KeepFileChoice mode={keepMode} />

      {state.error ? (
        <p
          role="alert"
          className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}

      {preview ? (
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary w-full"
        >
          {pending ? <Spinner /> : null}
          {pending ? t.foodAnalyzing : t.foodAnalyze}
        </button>
      ) : null}
      <p role="status" className="sr-only">
        {pending ? t.foodAnalyzing : ""}
      </p>

      <p className="text-muted text-sm">{t.foodPrivacy}</p>
    </form>
  );
}
