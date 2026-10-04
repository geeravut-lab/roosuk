"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { uploadProductImageAction } from "@/app/actions/shop-admin";
import { Spinner } from "@/components/Spinner";
import { errorText, fmt, type ErrorKey } from "@/lib/i18n/dict";
import { shrinkImage } from "@/lib/image-resize";
import { useI18n } from "@/lib/i18n/provider";

/** Several photos at once: each is shrunk on the device, then sent one by one (the server keeps its own limits). */
export function PhotoUploader({ productId }: { productId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ n: number; total: number } | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);

  async function run() {
    const files = [...(input.current?.files ?? [])];
    if (files.length === 0) return;
    setError(null);
    setDone(null);
    let ok = 0;
    for (const [i, f] of files.entries()) {
      setState({ n: i + 1, total: files.length });
      const small = await shrinkImage(f, { maxSide: 1200, quality: 0.85 });
      const data = new FormData();
      data.set("productId", productId);
      data.set("file", small);
      const r = await uploadProductImageAction(data);
      if (r.error) {
        setError(r.error);
        break;
      }
      ok++;
    }
    setState(null);
    setDone(ok);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <label htmlFor="photos" className="label">
        <ImagePlus className="mr-1 inline size-4" aria-hidden />
        {t.adminShopPhotosAdd}
      </label>
      <input
        id="photos"
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="field"
        disabled={!!state}
      />
      <button
        type="button"
        className="btn btn-secondary w-full"
        disabled={!!state}
        onClick={run}
      >
        {state ? <Spinner /> : null}
        {state ? fmt(t.adminShopPhotosUploading, state) : t.adminShopPhotosAdd}
      </button>
      {error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}
      {done !== null && !error ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {fmt(t.adminShopPhotosDone, { n: done })}
        </p>
      ) : null}
    </div>
  );
}
