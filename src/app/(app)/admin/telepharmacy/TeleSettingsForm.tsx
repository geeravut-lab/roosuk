"use client";

import {
  saveTeleSettingsAction,
  type TeleSettingsState,
} from "@/app/actions/telepharmacy-admin";
import { Spinner } from "@/components/Spinner";
import {
  VIDEO_PROVIDERS,
  type TeleField,
  type TeleSettings,
} from "@/lib/telepharmacy/telepharmacy";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: TeleSettingsState = {};

export function TeleSettingsForm({
  current,
  videoReady,
}: {
  current: TeleSettings;
  /** which providers have what they need on the server */
  videoReady: Record<(typeof VIDEO_PROVIDERS)[number], boolean>;
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    saveTeleSettingsAction,
    initial,
  );
  const bad = (f: TeleField) => state.field === f || undefined;

  const check = (name: string, label: string, on: boolean) => (
    <label className="flex min-h-11 items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={on}
        className="mt-1 size-5"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
  const num = (
    name: TeleField,
    label: string,
    value: number,
    min: number,
    max: number,
  ) => (
    <div>
      <label htmlFor={`ts-${name}`} className="label">
        {label}
      </label>
      <input
        id={`ts-${name}`}
        name={name}
        type="number"
        inputMode="numeric"
        required
        min={min}
        max={max}
        step={1}
        defaultValue={value}
        aria-invalid={bad(name)}
        className="field"
      />
    </div>
  );
  const area = (
    name: string,
    label: string,
    value: string,
    field: TeleField,
    rows = 4,
  ) => (
    <div>
      <label htmlFor={`ts-${name}`} className="label">
        {label}
      </label>
      <textarea
        id={`ts-${name}`}
        name={name}
        rows={rows}
        defaultValue={value}
        aria-invalid={bad(field)}
        className="field py-2"
      />
    </div>
  );

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-5">
      <fieldset className="space-y-1">
        <legend className="label">{t.adminTeleSwitches}</legend>
        {check("enabled", t.adminTeleEnabled, current.enabled)}
        {check("instantEnabled", t.adminTeleInstant, current.instantEnabled)}
        {check(
          "scheduledEnabled",
          t.adminTeleScheduled,
          current.scheduledEnabled,
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="label">{t.adminTeleHours}</legend>
        <div className="flex flex-wrap gap-x-4">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d} className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name={`day${d}`}
                defaultChecked={current.openDays.includes(d)}
                className="size-5"
              />
              <span className="text-sm">
                {t[`teleDay_${d}` as "teleDay_0"]}
              </span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ts-from" className="label">
              {t.adminTeleOpenFrom}
            </label>
            <input
              id="ts-from"
              name="openFrom"
              type="time"
              required
              defaultValue={current.openFrom}
              aria-invalid={bad("openFrom")}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="ts-to" className="label">
              {t.adminTeleOpenTo}
            </label>
            <input
              id="ts-to"
              name="openTo"
              type="time"
              required
              defaultValue={current.openTo}
              aria-invalid={bad("openTo")}
              className="field"
            />
          </div>
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        {num(
          "slotMinutes",
          t.adminTeleSlotMinutes,
          current.slotMinutes,
          10,
          120,
        )}
        {num(
          "slotCapacity",
          t.adminTeleSlotCapacity,
          current.slotCapacity,
          1,
          20,
        )}
        {num(
          "bookingDaysAhead",
          t.adminTeleDaysAhead,
          current.bookingDaysAhead,
          1,
          60,
        )}
        {num(
          "bookingMinLeadMinutes",
          t.adminTeleLead,
          current.bookingMinLeadMinutes,
          0,
          1440,
        )}
        {num(
          "maxActiveBookings",
          t.adminTeleMaxBookings,
          current.maxActiveBookings,
          1,
          10,
        )}
        {num(
          "waitTimeoutSec",
          t.adminTeleWaitTimeout,
          current.waitTimeoutSec,
          30,
          1800,
        )}
        {num("maxWaiting", t.adminTeleMaxWaiting, current.maxWaiting, 1, 50)}
        {num(
          "maxCallMinutes",
          t.adminTeleMaxCall,
          current.maxCallMinutes,
          5,
          180,
        )}
      </div>

      <div>
        <label htmlFor="ts-video" className="label">
          {t.adminTeleVideo}
        </label>
        <select
          id="ts-video"
          name="videoProvider"
          defaultValue={current.videoProvider}
          aria-invalid={bad("videoProvider")}
          className="field"
        >
          {VIDEO_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {t[`adminTeleVideo_${p}` as "adminTeleVideo_jitsi"]}
              {videoReady[p] ? "" : ` — ${t.adminTeleVideoNotReady}`}
            </option>
          ))}
        </select>
        <p className="text-muted mt-1 text-xs">{t.adminTeleVideoHint}</p>
      </div>

      <fieldset className="space-y-1">
        <legend className="label">{t.adminTeleKycTitle}</legend>
        {check(
          "requireKycForConsult",
          t.adminTeleKycConsult,
          current.requireKycForConsult,
        )}
        {check(
          "requireKycForPharmacist",
          t.adminTeleKycPharmacist,
          current.requireKycForPharmacist,
        )}
        <p className="text-muted text-xs">{t.adminTeleKycHint}</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="label">{t.adminTeleTexts}</legend>
        <p className="bg-tint-warn rounded-xl px-3 py-2 text-xs">
          {t.adminTeleTextsReview}
        </p>
        <div>
          <label htmlFor="ts-ver" className="label">
            {t.adminTeleConsentVersion}
          </label>
          <input
            id="ts-ver"
            name="consentVersion"
            required
            maxLength={40}
            defaultValue={current.consentVersion}
            aria-invalid={bad("consentVersion")}
            className="field"
          />
          <p className="text-muted mt-1 text-xs">
            {t.adminTeleConsentVersionHint}
          </p>
        </div>
        {area(
          "consentTextTh",
          t.adminTeleConsentTh,
          current.consentTextTh,
          "consentText",
          6,
        )}
        {area(
          "consentTextEn",
          t.adminTeleConsentEn,
          current.consentTextEn,
          "consentText",
          6,
        )}
        {area(
          "disclaimerTh",
          t.adminTeleDisclaimerTh,
          current.disclaimerTh,
          "disclaimer",
          3,
        )}
        {area(
          "disclaimerEn",
          t.adminTeleDisclaimerEn,
          current.disclaimerEn,
          "disclaimer",
          3,
        )}
        <p className="text-muted text-xs">{t.adminTeleTextsEmpty}</p>
      </fieldset>

      {num(
        "retentionDays",
        t.adminTeleRetention,
        current.retentionDays,
        30,
        36500,
      )}

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
          {t.adminTeleSaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {t.save}
      </button>
    </form>
  );
}
