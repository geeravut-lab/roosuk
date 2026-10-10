"use client";

import {
  savePharmacistProfileAction,
  type ProfileState,
} from "@/app/actions/pharmacist";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: ProfileState = {};

export function ProfileForm({
  displayName,
  licenseNo,
}: {
  displayName: string;
  licenseNo: string | null;
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    savePharmacistProfileAction,
    initial,
  );
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="ph-name" className="label">
          {t.pharmDisplayName}
        </label>
        <input
          id="ph-name"
          name="displayName"
          required
          maxLength={80}
          defaultValue={displayName}
          className="field"
        />
      </div>
      <div>
        <label htmlFor="ph-lic" className="label">
          {t.pharmLicenseNo}
        </label>
        <input
          id="ph-lic"
          name="licenseNo"
          maxLength={40}
          defaultValue={licenseNo ?? ""}
          autoComplete="off"
          className="field"
        />
        <p className="text-muted mt-1 text-xs">{t.pharmLicenseNote}</p>
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
          {t.pharmProfileSaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-secondary">
        {pending ? <Spinner /> : null}
        {t.save}
      </button>
    </form>
  );
}
