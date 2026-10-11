"use client";

import type { ReactNode } from "react";
import { saveBrandAction, type BrandState } from "@/app/actions/brand";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { MAX_NAME_CHARS } from "@/lib/brand/brand";
import { useFormAction } from "@/lib/use-form-action";

const initial: BrandState = {};

export function BrandForm({
  nameTh,
  nameEn,
  logoPreview,
  faviconPreview,
}: {
  nameTh: string;
  nameEn: string;
  logoPreview: ReactNode;
  faviconPreview: ReactNode;
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(saveBrandAction, initial);
  return (
    <div className="space-y-5">
      <form method="post" onSubmit={onSubmit} className="card space-y-4">
        <div className="space-y-1">
          <label htmlFor="brand-th" className="label">
            {t.adminBrandNameTh}
          </label>
          <input
            id="brand-th"
            name="name_th"
            required
            maxLength={MAX_NAME_CHARS}
            defaultValue={nameTh}
            className="field"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="brand-en" className="label">
            {t.adminBrandNameEn}
          </label>
          <input
            id="brand-en"
            name="name_en"
            required
            maxLength={MAX_NAME_CHARS}
            defaultValue={nameEn}
            className="field"
          />
          <p className="text-muted text-xs">{t.adminBrandNameHint}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="brand-logo" className="label">
            {t.adminBrandLogo}
          </label>
          <input
            id="brand-logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="field py-2"
          />
          <p className="text-muted text-xs">{t.adminBrandLogoHint}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="brand-favicon" className="label">
            {t.adminBrandFavicon}
          </label>
          <input
            id="brand-favicon"
            name="favicon"
            type="file"
            accept="image/png"
            className="field py-2"
          />
          <p className="text-muted text-xs">{t.adminBrandFaviconHint}</p>
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
            {t.adminBrandSaved}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? <Spinner /> : null}
          {t.adminBrandSave}
        </button>
      </form>

      <div className="card space-y-3">
        <h2 className="font-semibold">{t.adminBrandLogo}</h2>
        {logoPreview}
        <h2 className="pt-2 font-semibold">{t.adminBrandFavicon}</h2>
        {faviconPreview}
      </div>
    </div>
  );
}
