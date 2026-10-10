"use client";

import {
  createPassportAction,
  type PassportState,
} from "@/app/actions/passport";
import { CopyButton } from "@/components/CopyButton";
import { Spinner } from "@/components/Spinner";
import { EXPIRY_DAYS, SECTIONS } from "@/lib/passport/passport";
import { errorText, fmt, type Dict } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: PassportState = {};

/** Make a link. The result (the link and its QR) is shown once, here, and never again. */
export function PassportForm({
  wearablesOn,
  liverOn,
  preselect = [],
}: {
  wearablesOn: boolean;
  liverOn: boolean;
  /** sections ticked from the start, e.g. "liver" when arriving from the liver brief */
  preselect?: string[];
}) {
  const { t, lang } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    createPassportAction,
    initial,
  );
  const sections = SECTIONS.filter(
    (s) => (s !== "wearables" || wearablesOn) && (s !== "liver" || liverOn),
  );

  if (state.created) {
    const c = state.created;
    return (
      <div className="card space-y-3" role="status">
        <h2 className="text-primary-strong text-lg font-bold">
          {t.passportCreatedTitle}
        </h2>
        <p className="font-medium">{c.label}</p>
        <p className="text-sm">{t.passportCreatedBody}</p>
        <div
          className="mx-auto size-48 rounded-xl bg-white p-1 [&>svg]:size-full"
          role="img"
          aria-label={t.passportQrAlt}
          dangerouslySetInnerHTML={{ __html: c.qrSvg }}
        />
        <p
          className="bg-surface border-field-border rounded-xl border px-3 py-2 text-sm break-all select-all"
          data-testid="passport-url"
        >
          {c.url}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton text={c.url} />
        </div>
        <p className="text-muted text-sm">
          {fmt(t.passportLinkValidUntil, {
            date: formatDateTime(lang, c.expiresAt),
          })}
        </p>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="card space-y-4">
      <h2 className="font-semibold">{t.passportFormTitle}</h2>
      <div>
        <label htmlFor="pp-label" className="label">
          {t.passportFieldLabel}
        </label>
        <input
          id="pp-label"
          name="label"
          required
          maxLength={60}
          autoComplete="off"
          className="field"
          placeholder={t.passportFieldLabelHint}
        />
      </div>
      <div>
        <label htmlFor="pp-holder" className="label">
          {t.passportFieldHolder}
        </label>
        <input
          id="pp-holder"
          name="holderName"
          maxLength={60}
          autoComplete="off"
          className="field"
        />
        <p className="text-muted mt-1 text-xs">{t.passportFieldHolderHint}</p>
      </div>
      <div>
        <label htmlFor="pp-expiry" className="label">
          {t.passportFieldExpiry}
        </label>
        <select
          id="pp-expiry"
          name="expiryDays"
          defaultValue="7"
          className="field"
        >
          {EXPIRY_DAYS.map((d) => (
            <option key={d} value={d}>
              {t[`passportExpiry_${d}` as keyof Dict]}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="label">{t.passportSections}</legend>
        {sections.map((s) => (
          <label key={s} className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              name="sections"
              value={s}
              defaultChecked={
                preselect.length
                  ? preselect.includes(s)
                  : s === "profile" || s === "labs" || s === "checkins"
              }
              className="mt-1 size-5"
            />
            <span>
              <span className="font-medium">
                {t[`passportSection_${s}` as keyof Dict]}
              </span>
              <span className="text-muted block text-sm">
                {t[`passportSectionHint_${s}` as keyof Dict]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="withBrief" className="mt-1 size-5" />
        <span>
          <span className="font-medium">{t.passportWithBrief}</span>
          <span className="text-muted block text-sm">
            {t.passportWithBriefHint}
          </span>
        </span>
      </label>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="ack" required className="mt-1 size-5" />
        <span className="text-sm">{t.passportAck}</span>
      </label>
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
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {pending ? t.passportCreating : t.passportCreate}
      </button>
    </form>
  );
}
