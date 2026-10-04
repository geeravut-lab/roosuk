"use client";

import { useRef } from "react";
import { FileUp } from "lucide-react";
import { uploadVaultAction, type VaultState } from "@/app/actions/vault";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { VAULT_CATEGORIES, categoryKey } from "@/lib/vault/vault";
import { useFormAction } from "@/lib/use-form-action";

const initial: VaultState = {};

/** Add a document. The form is cleared only after a successful save (a failed one keeps what was typed). */
export function VaultUploadForm({ today }: { today: string }) {
  const { t } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  const [state, onSubmit, pending] = useFormAction(
    async (prev: VaultState, data: FormData) => {
      const r = await uploadVaultAction(prev, data);
      if (r.saved) form.current?.reset();
      return r;
    },
    initial,
  );

  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="vault-file" className="label">
          <FileUp className="mr-1 inline size-4" aria-hidden />
          {t.vaultFieldFile}
        </label>
        <input
          id="vault-file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          required
          className="field"
        />
      </div>
      <div>
        <label htmlFor="vault-title" className="label">
          {t.vaultFieldTitle}
        </label>
        <input
          id="vault-title"
          name="title"
          maxLength={80}
          required
          autoComplete="off"
          className="field"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="vault-category" className="label">
            {t.vaultFieldCategory}
          </label>
          <select
            id="vault-category"
            name="category"
            defaultValue="other"
            className="field"
          >
            {VAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t[categoryKey(c)]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="vault-date" className="label">
            {t.vaultFieldDate}
          </label>
          <input
            id="vault-date"
            name="docDate"
            type="date"
            max={today}
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
          {t.vaultSaved}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? t.vaultSaving : t.vaultSave}
      </button>
    </form>
  );
}
