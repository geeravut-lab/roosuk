"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, RefreshCw } from "lucide-react";
import { submitEkycAction, type EkycState } from "@/app/actions/ekyc";
import { Spinner } from "@/components/Spinner";
import { fileToJpeg, videoFrameToJpeg } from "@/lib/ekyc/resize";
import type { DocType } from "@/lib/ekyc/ekyc";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: EkycState = {};
type PhotoState = "empty" | "preparing" | "ready" | "failed";

/** Show a File in a form field the server action reads by name. */
function setFile(input: HTMLInputElement | null, file: File | null) {
  if (!input) return;
  const dt = new DataTransfer();
  if (file) dt.items.add(file);
  input.files = dt.files;
}

/**
 * The verification flow: a LIVE selfie from the camera (a gallery picture could be
 * anybody's, so the camera is the default and a file is only the fallback when the
 * camera cannot open), then the document photo, then consent. Both pictures are
 * shrunk to small JPEGs here, one after the other, and the server keeps neither.
 */
export function EkycFlow({
  docs,
  needSelfie,
  next,
}: {
  docs: DocType[];
  needSelfie: boolean;
  /** where to go after a pass (a path inside the app) */
  next: string | null;
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(submitEkycAction, initial);
  const selfieInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [selfie, setSelfie] = useState<PhotoState>("empty");
  const [doc, setDoc] = useState<PhotoState>("empty");
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [needPhotos, setNeedPhotos] = useState(false);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    setCameraOn(false);
  };
  useEffect(() => stopCamera, []);
  useEffect(
    () => () => {
      if (selfieUrl) URL.revokeObjectURL(selfieUrl);
    },
    [selfieUrl],
  );
  useEffect(
    () => () => {
      if (docUrl) URL.revokeObjectURL(docUrl);
    },
    [docUrl],
  );

  async function openCamera() {
    setCameraFailed(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraFailed(true);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      stream.current = s;
      setCameraOn(true);
      // the <video> exists only after the state change
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
      });
    } catch {
      setCameraFailed(true);
    }
  }

  async function takeSelfie() {
    if (!video.current) return;
    setSelfie("preparing");
    try {
      const file = await videoFrameToJpeg(video.current, 720, 0.7);
      setFile(selfieInput.current, file);
      setSelfieUrl(URL.createObjectURL(file));
      setSelfie("ready");
    } catch {
      setSelfie("failed");
    } finally {
      stopCamera();
    }
  }

  async function onPick(
    e: React.ChangeEvent<HTMLInputElement>,
    target: "selfie" | "doc",
  ) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const set = target === "selfie" ? setSelfie : setDoc;
    set("preparing");
    try {
      // 5.2: shrink as it is decoded, then let go of the original File
      const small = await fileToJpeg(
        picked,
        target === "selfie" ? 720 : 1280,
        target === "selfie" ? 0.7 : 0.75,
      );
      const ref = target === "selfie" ? selfieInput : docInput;
      setFile(ref.current, small);
      const url = URL.createObjectURL(small);
      if (target === "selfie") setSelfieUrl(url);
      else setDocUrl(url);
      set("ready");
    } catch {
      set("failed");
    }
    // the picker input only carries the original: its value is dropped, our named input holds the small one
    e.target.value = "";
  }

  function guard(e: React.FormEvent<HTMLFormElement>) {
    const missing = doc !== "ready" || (needSelfie && selfie !== "ready");
    if (missing) {
      e.preventDefault();
      setNeedPhotos(true);
      return;
    }
    setNeedPhotos(false);
    onSubmit(e);
  }

  if (state.result === "passed") {
    const go =
      next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    return (
      <div role="status" className="card space-y-3 text-center">
        <CheckCircle2
          className="text-primary-strong mx-auto size-10"
          aria-hidden
        />
        <h2 className="text-lg font-bold">{t.kycResultPassed}</h2>
        {go ? (
          <Link href={go} className="btn btn-primary w-full">
            {t.kycContinueTo}
          </Link>
        ) : null}
      </div>
    );
  }
  if (state.result === "review") {
    return (
      <div role="status" className="card space-y-3">
        <h2 className="text-lg font-bold">{t.kycPendingTitle}</h2>
        <p className="text-sm">{t.kycResultReview}</p>
        {state.reasons?.length ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t.kycReasonsTitle}</p>
            <ul className="list-disc pl-5 text-sm">
              {state.reasons.map((r) => (
                <li key={r}>{t[`kycReason_${r}` as const]}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const status = (s: PhotoState) =>
    s === "preparing" ? (
      <p role="status" className="text-muted flex items-center gap-2 text-sm">
        <Spinner /> {t.kycPhotoPreparing}
      </p>
    ) : s === "ready" ? (
      <p
        role="status"
        className="text-primary-strong flex items-center gap-2 text-sm font-semibold"
      >
        <CheckCircle2 className="size-4" aria-hidden /> {t.kycPhotoReady}
      </p>
    ) : s === "failed" ? (
      <p role="alert" className="text-sm font-medium">
        {t.kycPhotoFailed}
      </p>
    ) : null;

  return (
    <form method="post" onSubmit={guard} className="space-y-4" noValidate>
      {needSelfie ? (
        <section className="card space-y-3" aria-labelledby="kyc-selfie-h">
          <h2 id="kyc-selfie-h" className="font-semibold">
            {t.kycStepSelfie}
          </h2>
          <p className="text-muted text-sm">{t.kycSelfieHint}</p>
          {/* the named input the server action reads; filled by the camera or the fallback */}
          <input
            ref={selfieInput}
            name="selfie"
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          {cameraOn ? (
            <div className="space-y-2">
              <video
                ref={video}
                playsInline
                muted
                className="aspect-[4/3] w-full [transform:scaleX(-1)] rounded-2xl bg-black object-cover"
              />
              <button
                type="button"
                onClick={takeSelfie}
                className="btn btn-primary w-full"
              >
                <Camera className="size-5" aria-hidden /> {t.kycSelfieCapture}
              </button>
            </div>
          ) : (
            <>
              {selfieUrl && selfie === "ready" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selfieUrl}
                  alt={t.kycSelfieAlt}
                  className="mx-auto max-h-64 rounded-2xl"
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCamera}
                  className="btn btn-secondary flex-1"
                >
                  {selfie === "ready" ? (
                    <RefreshCw className="size-4" aria-hidden />
                  ) : (
                    <Camera className="size-4" aria-hidden />
                  )}
                  {selfie === "ready" ? t.kycSelfieRetake : t.kycSelfieOpen}
                </button>
              </div>
            </>
          )}
          {cameraFailed ? (
            <div className="space-y-2">
              <p
                role="alert"
                className="bg-tint-warn rounded-xl px-3 py-2 text-sm"
              >
                {t.kycSelfieNoCamera}
              </p>
              <label className="btn btn-secondary w-full cursor-pointer">
                {t.kycSelfieFallback}
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="sr-only"
                  onChange={(e) => onPick(e, "selfie")}
                />
              </label>
            </div>
          ) : null}
          {status(selfie)}
        </section>
      ) : null}

      <section className="card space-y-3" aria-labelledby="kyc-doc-h">
        <h2 id="kyc-doc-h" className="font-semibold">
          {t.kycStepDocument}
        </h2>
        <div>
          <label htmlFor="kyc-doctype" className="label">
            {t.kycDocType}
          </label>
          <select
            id="kyc-doctype"
            name="docType"
            defaultValue={docs[0]}
            className="field"
          >
            {docs.map((d) => (
              <option key={d} value={d}>
                {d === "thai_id" ? t.kycDocThaiId : t.kycDocPassport}
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted text-sm">{t.kycDocHint}</p>
        <input
          ref={docInput}
          name="document"
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        {docUrl && doc === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={docUrl}
            alt={t.kycDocAlt}
            className="mx-auto max-h-64 rounded-2xl"
          />
        ) : null}
        <label className="btn btn-secondary w-full cursor-pointer">
          <Camera className="size-4" aria-hidden />
          {doc === "ready" ? t.kycDocChange : t.kycDocTake}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => onPick(e, "doc")}
          />
        </label>
        {status(doc)}
      </section>

      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          name="consent"
          className="mt-1 size-5"
          required
        />
        <span className="text-sm">{t.kycConsent}</span>
      </label>

      {needPhotos ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.kycNeedPhotos}
        </p>
      ) : null}
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      {pending ? (
        <p role="status" className="text-muted text-sm">
          {t.kycSubmitting}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {t.kycSubmit}
      </button>
    </form>
  );
}
