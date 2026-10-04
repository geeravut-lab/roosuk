"use client";

import { useRef } from "react";
import { grantAdminAction, type GrantState } from "@/app/actions/admins";
import { Spinner } from "@/components/Spinner";
import { errorText, fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: GrantState = {};

/** Add an admin by the email of an existing account. A wrong email is an error here, not a new account. */
export function GrantAdminForm() {
  const { t } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  const [state, onSubmit, pending] = useFormAction(
    async (prev: GrantState, data: FormData) => {
      const r = await grantAdminAction(prev, data);
      if (r.granted) form.current?.reset();
      return r;
    },
    initial,
  );
  return (
    <form method="post" ref={form} onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="admin-email" className="label">
          {t.adminAdminsEmail}
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
          inputMode="email"
          className="field"
        />
      </div>
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      {state.granted ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {fmt(t.adminAdminsAdded, { email: state.granted })}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {pending ? t.adminAdminsAdding : t.adminAdminsAdd}
      </button>
    </form>
  );
}
