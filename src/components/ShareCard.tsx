"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { Spinner } from "@/components/Spinner";

/**
 * A preview of the card and a share button. The preview is the very image that
 * gets shared, so the person sees what leaves the app. Sharing uses the
 * device's share sheet (LINE, social apps…) when it can send an image, and
 * saves the PNG otherwise.
 */
export function ShareCard({
  src,
  text,
  filename,
}: {
  /** The card URL (same-origin). The button adds share=1 so a real share is counted. */
  src: string;
  /** The caption that goes with the image; "{url}" becomes this site's address. */
  text: string;
  filename: string;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "busy" | "saved" | "failed">(
    "idle",
  );

  async function share() {
    setState("busy");
    try {
      const url = `${src}${src.includes("?") ? "&" : "?"}share=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const file = new File([await res.blob()], filename, {
        type: "image/png",
      });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            text: text.replace("{url}", location.host),
          });
          setState("idle");
        } catch (err) {
          // Closing the share sheet is not an error.
          setState((err as Error).name === "AbortError" ? "idle" : "failed");
        }
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setState("saved");
    } catch {
      setState("failed");
    }
  }

  return (
    <section className="card space-y-3" aria-labelledby="share-h">
      <h2 id="share-h" className="font-semibold">
        {t.shareTitle}
      </h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={t.shareImageAlt}
        width={540}
        height={540}
        className="mx-auto w-full max-w-72 rounded-2xl border"
        loading="lazy"
      />
      <p className="text-muted text-sm">{t.shareHint}</p>
      <button
        type="button"
        onClick={share}
        disabled={state === "busy"}
        className="btn btn-secondary w-full"
      >
        {state === "busy" ? <Spinner /> : null}
        <Share2 className="size-5" aria-hidden />
        {state === "busy" ? t.shareBusy : t.shareBtn}
      </button>
      <p role="status" className="text-sm font-medium">
        {state === "failed"
          ? t.shareFailed
          : state === "saved"
            ? t.shareSaved
            : ""}
      </p>
    </section>
  );
}
