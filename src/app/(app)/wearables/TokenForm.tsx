"use client";

import {
  createIngestTokenAction,
  type TokenState,
} from "@/app/actions/wearables";
import { CopyButton } from "@/components/CopyButton";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: TokenState = {};

/** Make a token. It is shown here once and never again (only its hash is kept). */
export function TokenForm() {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    createIngestTokenAction,
    initial,
  );
  return (
    <div className="space-y-3">
      <form method="post" onSubmit={onSubmit} className="space-y-3">
        <div>
          <label htmlFor="tok-label" className="label">
            {t.wearTokenLabel}
          </label>
          <input
            id="tok-label"
            name="label"
            required
            maxLength={60}
            autoComplete="off"
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
        <button
          type="submit"
          disabled={pending}
          className="btn btn-secondary w-full"
        >
          {pending ? <Spinner /> : null}
          {t.wearTokenCreate}
        </button>
      </form>
      {state.token ? (
        <div className="card space-y-2" role="status">
          <p className="text-sm font-semibold">{t.wearTokenShown}</p>
          <p
            className="bg-surface border-field-border rounded-xl border px-3 py-2 font-mono text-sm break-all select-all"
            data-testid="ingest-token"
          >
            {state.token}
          </p>
          <CopyButton text={state.token} />
        </div>
      ) : null}
    </div>
  );
}
