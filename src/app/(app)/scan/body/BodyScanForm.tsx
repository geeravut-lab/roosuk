"use client";

import { scanBodyAction, type BodyScanState } from "@/app/actions/body";
import { KeepFileChoice } from "@/components/KeepFileChoice";
import { PhotoSlot } from "@/components/PhotoSlot";
import type { AdultStatus } from "@/lib/body/body";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import type { KeepMode } from "@/lib/files/types";
import { useFormAction } from "@/lib/use-form-action";
import { Spinner } from "@/components/Spinner";

const initial: BodyScanState = {};

export function BodyScanForm({
  keepMode,
  ageStatus,
}: {
  keepMode: KeepMode;
  /** From the profile's birth year; "unknown" means the person must confirm they are an adult. */
  ageStatus: Exclude<AdultStatus, "minor">;
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(scanBodyAction, initial);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="card space-y-3">
        <div>
          <label htmlFor="height" className="label">
            {t.bodyHeight}
          </label>
          <input
            id="height"
            name="height"
            type="text"
            inputMode="decimal"
            required
            autoComplete="off"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="weight" className="label">
            {t.bodyWeight}
          </label>
          <input
            id="weight"
            name="weight"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="field"
            aria-describedby="weight-hint"
          />
          <p id="weight-hint" className="text-muted mt-1 text-sm">
            {t.bodyWeightHint}
          </p>
        </div>
      </div>

      <PhotoSlot
        name="photoBody"
        label={t.bodyPhotoBody}
        hint={t.bodyPhotoBodyHint}
        required
      />
      <PhotoSlot
        name="photoFace"
        label={t.bodyPhotoFace}
        hint={t.bodyPhotoFaceHint}
        camera="user"
      />
      <PhotoSlot
        name="photoPalm"
        label={t.bodyPhotoPalm}
        hint={t.bodyPhotoPalmHint}
      />

      <KeepFileChoice mode={keepMode} />

      <div className="card space-y-2">
        {ageStatus === "unknown" ? (
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="adult"
              required
              className="size-5 shrink-0"
            />
            <span>{t.bodyAdult}</span>
          </label>
        ) : null}
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="ack"
            required
            className="mt-1 size-5 shrink-0"
          />
          <span className="text-sm">{t.bodyAck}</span>
        </label>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {pending ? t.bodyAnalyzing : t.bodyAnalyze}
      </button>
      <p role="status" className="sr-only">
        {pending ? t.bodyAnalyzing : ""}
      </p>
      <p className="text-muted text-sm">{t.bodyPrivacy}</p>
    </form>
  );
}
