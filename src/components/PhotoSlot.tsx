"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Images } from "lucide-react";
import { shrinkImage } from "@/lib/image-resize";
import { useI18n } from "@/lib/i18n/provider";

/**
 * One photo field: a camera button (opens the camera directly) and a gallery
 * button. Both end up in the single named `<input type=file>`, with the picture
 * shrunk first (phone photos are 3–8 MB; the server limit is 3 MB).
 */
export function PhotoSlot({
  name,
  label,
  hint,
  required = false,
  camera = "environment",
}: {
  name: string;
  label: string;
  hint: string;
  required?: boolean;
  /** Which camera to prefer: the back one for a body or palm, the front one for a face. */
  camera?: "environment" | "user";
}) {
  const { t } = useI18n();
  const main = useRef<HTMLInputElement>(null);
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
    const small = await shrinkImage(picked);
    const dt = new DataTransfer();
    dt.items.add(small);
    if (main.current) main.current.files = dt.files;
    setPreview(URL.createObjectURL(small));
  }

  return (
    <fieldset className="card space-y-2">
      <legend className="font-semibold">{label}</legend>
      <p className="text-muted text-sm">{hint}</p>
      <input
        ref={main}
        id={`${name}-file`}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onPick}
        required={required}
        aria-label={label}
      />
      {/* no name: only a hand-over to the named input above */}
      <input
        id={`${name}-camera`}
        type="file"
        accept="image/*"
        capture={camera}
        className="sr-only"
        onChange={onPick}
        aria-label={`${label}: ${t.bodyTakePhoto}`}
      />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={t.bodyPhotoAlt}
          className="mx-auto max-h-64 w-full rounded-2xl object-contain"
        />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label
          htmlFor={`${name}-camera`}
          className="btn btn-secondary w-full cursor-pointer has-[:focus-visible]:outline-2"
        >
          <Camera className="size-5" aria-hidden />
          {t.bodyTakePhoto}
        </label>
        <label
          htmlFor={`${name}-file`}
          className="btn btn-secondary w-full cursor-pointer has-[:focus-visible]:outline-2"
        >
          <Images className="size-5" aria-hidden />
          {preview ? t.bodyPhotoChosen : t.bodyChoosePhoto}
        </label>
      </div>
    </fieldset>
  );
}
