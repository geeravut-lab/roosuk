"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ScanBarcode } from "lucide-react";
import { lookupBarcodeAction, type BarcodeState } from "@/app/actions/barcode";
import { Spinner } from "@/components/Spinner";
import { parseBarcode } from "@/lib/barcode/barcode";
import { errorText, fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: BarcodeState = {};

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/**
 * Packaged food by its barcode: type the number, or scan it with the camera.
 * The camera uses the browser's own BarcodeDetector where there is one (fast,
 * no download) and the ZXing decoder otherwise (loaded only when the camera is
 * opened). The number is checked again on the server before anything is looked up.
 */
export function BarcodeForm() {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    lookupBarcodeAction,
    initial,
  );
  const form = useRef<HTMLFormElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState<"off" | "on" | "denied">("off");
  const [read, setRead] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => () => stop.current(), []);

  async function startCamera() {
    setRead(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch {
      setCamera("denied");
      return;
    }
    setCamera("on");
    let alive = true;
    let controls: { stop(): void } | undefined;
    const finish = (raw: string) => {
      const code = parseBarcode(raw);
      if (!code || !alive) return; // a misread number is ignored; keep looking
      alive = false;
      setValue(code);
      setRead(code);
      stop.current();
      setCamera("off");
      // the field is controlled: submit after React has put the number in it
      setTimeout(() => form.current?.requestSubmit(), 50);
    };
    stop.current = () => {
      alive = false;
      controls?.stop();
      stream.getTracks().forEach((tr) => tr.stop());
      stop.current = () => {};
    };
    // wait for the <video> element to exist
    await new Promise((r) => setTimeout(r, 0));
    const el = video.current;
    if (!el) return stop.current();
    el.srcObject = stream;
    await el.play().catch(() => undefined);

    const Native = (
      window as unknown as {
        BarcodeDetector?: new (o: { formats: string[] }) => DetectorLike;
      }
    ).BarcodeDetector;
    if (Native) {
      const detector = new Native({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
      });
      const tick = async () => {
        if (!alive) return;
        try {
          const found = await detector.detect(el);
          if (found[0]) finish(found[0].rawValue);
        } catch {
          /* a frame that cannot be read is skipped */
        }
        if (alive) setTimeout(tick, 250);
      };
      void tick();
    } else {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!alive) return;
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromVideoElement(el, (result) => {
        if (result) finish(result.getText());
      });
    }
  }

  return (
    <section className="card space-y-3" aria-labelledby="barcode-h">
      <h2 id="barcode-h" className="flex items-center gap-2 font-semibold">
        <ScanBarcode className="text-primary-strong size-5" aria-hidden />
        {t.barcodeTitle}
      </h2>
      <p className="text-muted text-sm">{t.barcodeHint}</p>

      {camera === "on" ? (
        <div className="space-y-2">
          <video
            ref={video}
            playsInline
            muted
            className="aspect-[4/3] w-full rounded-2xl bg-black object-cover"
            aria-label={t.barcodeCameraHint}
          />
          <p className="text-muted text-sm">{t.barcodeCameraHint}</p>
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => {
              stop.current();
              setCamera("off");
            }}
          >
            {t.barcodeCameraStop}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={startCamera}
        >
          <Camera className="size-5" aria-hidden />
          {t.barcodeCamera}
        </button>
      )}
      {camera === "denied" ? (
        <p
          role="status"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.barcodeCameraDenied}
        </p>
      ) : null}
      {read ? (
        <p role="status" className="text-sm font-medium">
          {fmt(t.barcodeFound, { code: read })}
        </p>
      ) : null}

      <form method="post" ref={form} onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="barcode" className="label">
          {t.barcodeNumber}
        </label>
        <input
          id="barcode"
          name="barcode"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="field"
        />
        {state.error ? (
          <p
            role="alert"
            className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
          >
            {errorText(state.error, t)}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || value.trim() === ""}
          className="btn btn-primary w-full"
        >
          {pending ? <Spinner /> : null}
          {pending ? t.barcodeLooking : t.barcodeLookup}
        </button>
      </form>
    </section>
  );
}
