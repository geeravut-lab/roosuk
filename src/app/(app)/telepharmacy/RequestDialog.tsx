"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Video, X } from "lucide-react";
import { requestConsultAction, type RequestState } from "@/app/actions/telepharmacy";
import { Spinner } from "@/components/Spinner";
import { TOPICS } from "@/lib/telepharmacy/telepharmacy";
import { errorText, fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: RequestState = {};

export interface SlotGroup {
  date: string;
  label: string;
  slots: { at: string; time: string; full: boolean }[];
}

type Mode = "instant" | "book";

/** Where the access key of a consult lives in THIS browser while the consult is live. */
export const keyStore = (id: string) => `tele-key:${id}`;

/**
 * The two ways in, and the consent screen both go through. The consent text shown is the
 * admin's current version (its label is shown and stored with the request); the two required
 * consents cannot be skipped, and each kind of sharing is its own optional tick.
 */
export function RequestDialog({
  canInstant,
  canBook,
  instantNote,
  slotGroups,
  consentText,
  consentVersion,
  productId,
  productName,
}: {
  canInstant: boolean;
  canBook: boolean;
  /** why "talk now" is off, when it is */
  instantNote: string | null;
  slotGroups: SlotGroup[];
  consentText: string;
  consentVersion: string;
  productId: string | null;
  productName: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [state, onSubmit, pending] = useFormAction(
    requestConsultAction,
    initial,
  );

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (mode && !d.open) d.showModal();
    if (!mode && d.open) d.close();
  }, [mode]);

  useEffect(() => {
    if (!state.started) return;
    try {
      sessionStorage.setItem(keyStore(state.started.id), state.started.key);
    } catch {
      /* private mode: the page offers to renew the key */
    }
    setMode(null);
    router.refresh();
  }, [state.started, router]);

  const hasSlots = slotGroups.some((g) => g.slots.some((s) => !s.full));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Video className="text-primary-strong size-5" aria-hidden />
            {t.teleTalkNow}
          </h2>
          <p className="text-muted text-sm">{instantNote ?? t.teleTalkNowHint}</p>
          <button
            type="button"
            disabled={!canInstant}
            onClick={() => setMode("instant")}
            className="btn btn-primary w-full"
          >
            {t.teleTalkNow}
          </button>
        </div>
        <div className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarClock className="text-primary-strong size-5" aria-hidden />
            {t.teleBookTime}
          </h2>
          <p className="text-muted text-sm">{t.teleBookHint}</p>
          <button
            type="button"
            disabled={!canBook || !hasSlots}
            onClick={() => setMode("book")}
            className="btn btn-secondary w-full"
          >
            {t.teleBookTime}
          </button>
        </div>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="tele-dialog-h"
        onClose={() => setMode(null)}
        className="bg-surface text-foreground m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl p-0 backdrop:bg-black/50"
      >
        {mode ? (
          <form method="post" onSubmit={onSubmit} className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 id="tele-dialog-h" className="text-lg font-bold">
                {mode === "instant"
                  ? t.teleDialogTitle_instant
                  : t.teleDialogTitle_book}
              </h2>
              <button
                type="button"
                onClick={() => setMode(null)}
                className="btn btn-ghost size-11 shrink-0 p-0"
                aria-label={t.close}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {productName ? (
              <p className="bg-tint-primary rounded-xl px-3 py-2 text-sm">
                {fmt(t.teleProductAbout, { name: productName })}
              </p>
            ) : null}
            {productId ? (
              <input type="hidden" name="productId" value={productId} />
            ) : null}

            {mode === "book" ? (
              <div>
                <label htmlFor="tele-slot" className="label">
                  {t.teleSlotLabel}
                </label>
                <select id="tele-slot" name="slot" required defaultValue="" className="field">
                  <option value="" disabled>
                    —
                  </option>
                  {slotGroups.map((g) => (
                    <optgroup key={g.date} label={g.label}>
                      {g.slots.map((s) => (
                        <option key={s.at} value={s.at} disabled={s.full}>
                          {s.time}
                          {s.full ? ` (${t.teleSlotFull})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label htmlFor="tele-topic" className="label">
                {t.teleTopicLabel}
              </label>
              <select
                id="tele-topic"
                name="topic"
                defaultValue={productId ? "product_choice" : "general"}
                className="field"
              >
                {TOPICS.map((k) => (
                  <option key={k} value={k}>
                    {t[`teleTopic_${k}` as const]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tele-meds" className="label">
                {t.teleMedicines}
              </label>
              <input id="tele-meds" name="medicines" maxLength={300} autoComplete="off" className="field" />
            </div>
            <div>
              <label htmlFor="tele-allergy" className="label">
                {t.teleAllergies}
              </label>
              <input id="tele-allergy" name="allergies" maxLength={300} autoComplete="off" className="field" />
              <p className="text-muted mt-1 text-xs">{t.teleIntakeHint}</p>
            </div>

            <fieldset className="space-y-1">
              <legend className="label">{t.teleShareTitle}</legend>
              {(["share_profile", "share_labs", "share_history"] as const).map((k) => (
                <label key={k} className="flex min-h-11 items-start gap-3">
                  <input type="checkbox" name={k} className="mt-1 size-5" />
                  <span className="text-sm">
                    {k === "share_profile"
                      ? t.teleShareProfile
                      : k === "share_labs"
                        ? t.teleShareLabs
                        : t.teleShareHistory}
                  </span>
                </label>
              ))}
              <p className="text-muted text-xs">{t.teleShareNote}</p>
            </fieldset>

            <section className="space-y-2" aria-labelledby="tele-consent-h">
              <h3 id="tele-consent-h" className="font-semibold">
                {t.teleConsentTitle}{" "}
                <span className="text-muted text-xs font-normal">
                  {fmt(t.teleConsentVersion, { v: consentVersion })}
                </span>
              </h3>
              <div
                tabIndex={0}
                role="region"
                aria-label={t.teleConsentTitle}
                className="border-line max-h-40 overflow-y-auto rounded-xl border p-3 text-sm whitespace-pre-wrap"
              >
                {consentText}
              </div>
              <label className="flex min-h-11 items-start gap-3">
                <input type="checkbox" name="consent_consult" required className="mt-1 size-5" />
                <span className="text-sm">{t.teleConsentConsult}</span>
              </label>
              <label className="flex min-h-11 items-start gap-3">
                <input type="checkbox" name="consent_record" required className="mt-1 size-5" />
                <span className="text-sm">{t.teleConsentRecord}</span>
              </label>
            </section>

            {state.error ? (
              <p role="alert" className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium">
                {errorText(state.error, t)}
              </p>
            ) : null}
            <button type="submit" disabled={pending} aria-busy={pending || undefined} className="btn btn-primary w-full">
              {pending ? <Spinner /> : null}
              {pending
                ? t.teleSending
                : mode === "instant"
                  ? t.teleSubmitInstant
                  : t.teleSubmitBook}
            </button>
          </form>
        ) : null}
      </dialog>
    </>
  );
}
