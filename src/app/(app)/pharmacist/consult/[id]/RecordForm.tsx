"use client";

import { useRef } from "react";
import { saveRecordAction, type RecordState } from "@/app/actions/pharmacist";
import { Spinner } from "@/components/Spinner";
import {
  MAX_SUGGESTED,
  type SuggestedProduct,
} from "@/lib/telepharmacy/telepharmacy";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: RecordState = {};

/**
 * The pharmacist's service record. Products listed here are ONES THE PHARMACIST CHOSE to
 * suggest — the system never proposes a medicine. "Save draft" can be repeated; "Finalise"
 * makes it the record of the service and locks it (only the follow-up outcome can still be added).
 */
export function RecordForm({
  consultId,
  callEnded,
  defaults,
  catalog,
}: {
  consultId: string;
  callEnded: boolean;
  defaults: {
    advice: string;
    referDoctor: boolean;
    products: SuggestedProduct[];
    followUpOn: string | null;
    followUpNote: string | null;
  };
  catalog: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const intent = useRef<HTMLInputElement>(null);
  const [state, onSubmit, pending] = useFormAction(saveRecordAction, initial);
  const bad = (f: string) => state.field === f || undefined;
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="id" value={consultId} />
      <input ref={intent} type="hidden" name="intent" defaultValue="draft" />
      <div>
        <label htmlFor="rec-advice" className="label">
          {t.teleAdvice}
        </label>
        <textarea
          id="rec-advice"
          name="advice"
          rows={6}
          maxLength={4000}
          defaultValue={defaults.advice}
          aria-invalid={bad("advice")}
          className="field py-2"
        />
        <p className="text-muted mt-1 text-xs">{t.pharmAdviceHint}</p>
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          name="referDoctor"
          defaultChecked={defaults.referDoctor}
          className="mt-1 size-5"
        />
        <span className="text-sm">{t.pharmReferDoctor}</span>
      </label>

      <fieldset className="space-y-3" aria-invalid={bad("products")}>
        <legend className="label">{t.pharmProductsTitle}</legend>
        <p className="text-muted text-xs">{t.pharmProductsNote}</p>
        {Array.from({ length: MAX_SUGGESTED }, (_, i) => {
          const p = defaults.products[i];
          return (
            <div key={i} className="grid gap-2 sm:grid-cols-3">
              <div>
                <label htmlFor={`rec-pid-${i}`} className="sr-only">
                  {t.pharmProductPick}
                </label>
                <select
                  id={`rec-pid-${i}`}
                  name={`product_id_${i}`}
                  defaultValue={p?.product_id ?? ""}
                  className="field"
                >
                  <option value="">{t.pharmProductPick}</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`rec-pn-${i}`} className="sr-only">
                  {t.pharmProductName}
                </label>
                <input
                  id={`rec-pn-${i}`}
                  name={`product_name_${i}`}
                  placeholder={t.pharmProductName}
                  maxLength={120}
                  defaultValue={p?.name ?? ""}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor={`rec-pt-${i}`} className="sr-only">
                  {t.pharmProductNote}
                </label>
                <input
                  id={`rec-pt-${i}`}
                  name={`product_note_${i}`}
                  placeholder={t.pharmProductNote}
                  maxLength={200}
                  defaultValue={p?.note ?? ""}
                  className="field"
                />
              </div>
            </div>
          );
        })}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="rec-fu" className="label">
            {t.pharmFollowUpOn}
          </label>
          <input
            id="rec-fu"
            name="followUpOn"
            type="date"
            defaultValue={defaults.followUpOn ?? ""}
            aria-invalid={bad("followUpOn")}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="rec-fun" className="label">
            {t.pharmFollowUpNote}
          </label>
          <input
            id="rec-fun"
            name="followUpNote"
            maxLength={500}
            defaultValue={defaults.followUpNote ?? ""}
            className="field"
          />
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      {state.saved ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {state.saved === "final" ? t.pharmSavedFinal : t.pharmSavedDraft}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="submit"
          disabled={pending}
          onClick={() => {
            if (intent.current) intent.current.value = "draft";
          }}
          className="btn btn-secondary"
        >
          {pending ? <Spinner /> : null}
          {t.pharmSaveDraft}
        </button>
        <button
          type="submit"
          disabled={pending || !callEnded}
          onClick={(e) => {
            if (!window.confirm(t.pharmFinalizeConfirm)) {
              e.preventDefault();
              return;
            }
            if (intent.current) intent.current.value = "final";
          }}
          className="btn btn-primary"
        >
          {pending ? <Spinner /> : null}
          {t.pharmFinalize}
        </button>
      </div>
      {!callEnded ? (
        <p className="text-muted text-xs">{t.pharmEndFirst}</p>
      ) : null}
    </form>
  );
}
