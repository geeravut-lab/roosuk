"use client";

import { recordConsentAction, type ConsentState } from "@/app/actions/consent";
import { CONSENT_ITEMS } from "@/config/legal";
import { DATA_REGION } from "@/config/data-region";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";
import { Spinner } from "@/components/Spinner";

const initial: ConsentState = {};

export function ConsentForm({ next }: { next: string }) {
  const { t, lang, fmt } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    recordConsentAction,
    initial,
  );

  const vars = {
    country: lang === "en" ? DATA_REGION.countryEn : DATA_REGION.countryTh,
    region: DATA_REGION.id,
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {state.error ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}

      <ul className="space-y-3">
        {CONSENT_ITEMS.map((item) => {
          const id = `consent_${item.key}`;
          const key = id as keyof typeof t;
          const label = item.key === "data_region" ? fmt(t[key], vars) : t[key];
          return (
            <li key={item.key} className="card">
              <label
                htmlFor={id}
                className="flex cursor-pointer items-start gap-3"
              >
                <input
                  id={id}
                  name={id}
                  type="checkbox"
                  required={item.required}
                  className="accent-primary-strong mt-1 size-6 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-[15px] leading-relaxed">
                    {label}
                  </span>
                  <span className="bg-tint-primary text-primary-strong mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold">
                    {item.required
                      ? t.consentRequiredTag
                      : t.consentOptionalTag}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {t.consentSubmit}
      </button>
    </form>
  );
}
