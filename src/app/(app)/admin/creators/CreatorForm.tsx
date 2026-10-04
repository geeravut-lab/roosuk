"use client";

import { useRef } from "react";
import { makeCreatorAction, type CreatorState } from "@/app/actions/creator";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: CreatorState = {};

export function CreatorForm() {
  const { t } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  const [state, onSubmit, pending] = useFormAction(
    async (prev: CreatorState, data: FormData) => {
      const r = await makeCreatorAction(prev, data);
      if (r.saved) form.current?.reset();
      return r;
    },
    initial,
  );
  return (
    <form method="post" ref={form} onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="cr-email" className="label">
          {t.adminCreatorEmail}
        </label>
        <input
          id="cr-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
          className="field"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="cr-slug" className="label">
            {t.adminCreatorSlug}
          </label>
          <input
            id="cr-slug"
            name="slug"
            required
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            className="field uppercase"
          />
        </div>
        <div>
          <label htmlFor="cr-name" className="label">
            {t.adminCreatorName}
          </label>
          <input
            id="cr-name"
            name="name"
            required
            maxLength={60}
            autoComplete="off"
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
          {t.adminCreatorAdded}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {t.adminCreatorAdd}
      </button>
    </form>
  );
}
