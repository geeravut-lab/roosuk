"use client";

import { useState } from "react";
import { submitLeadAction, type LeadState } from "@/app/actions/leads";
import { INTERESTS } from "@/lib/leads/leads";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: LeadState = {};

export function LeadForm({ addFriendUrl }: { addFriendUrl: string | null }) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(submitLeadAction, initial);
  const [method, setMethod] = useState<"line" | "phone">("line");

  if (state.ok)
    return (
      <p role="status" className="card font-medium">
        {t.leadSent}
      </p>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset className="card space-y-1">
        <legend className="font-semibold">{t.leadInterestTitle}</legend>
        {INTERESTS.map((k, i) => (
          <label key={k} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="interest"
              value={k}
              required
              defaultChecked={i === 0}
              className="size-5 shrink-0"
            />
            <span>{t[`leadInterest_${k}` as const]}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="card space-y-1">
        <legend className="font-semibold">{t.leadContactTitle}</legend>
        {(["line", "phone"] as const).map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="contactMethod"
              value={m}
              required
              checked={method === m}
              onChange={() => setMethod(m)}
              className="size-5 shrink-0"
            />
            <span>{t[`leadContact_${m}` as const]}</span>
          </label>
        ))}
        {method === "line" ? (
          <p className="text-muted text-sm">
            {t.leadLineHint}{" "}
            {addFriendUrl ? (
              <a
                href={addFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary-strong underline"
              >
                {t.leadAddFriend}
              </a>
            ) : null}
          </p>
        ) : (
          <div className="pt-1">
            <label htmlFor="phone" className="label">
              {t.leadPhone}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              maxLength={20}
              className="field"
            />
          </div>
        )}
      </fieldset>

      <div className="card">
        <label htmlFor="note" className="label">
          {t.leadNote}
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={300}
          className="field"
        />
      </div>

      <label className="card flex items-start gap-3">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-1 size-5 shrink-0"
        />
        <span className="text-sm">{t.leadConsent}</span>
      </label>
      <p className="text-muted text-sm">{t.leadNoHealthData}</p>

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
        {pending ? t.leadSending : t.leadSubmit}
      </button>
    </form>
  );
}
