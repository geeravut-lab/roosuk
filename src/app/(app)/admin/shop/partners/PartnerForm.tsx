"use client";

import { savePartnerAction, type SimpleState } from "@/app/actions/shop-admin";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: SimpleState = {};

export function PartnerForm({
  partner,
}: {
  partner?: {
    id: string;
    name: string;
    contact: string | null;
    note: string | null;
    active: boolean;
  };
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(savePartnerAction, initial);
  const k = partner?.id ?? "new";
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      {partner ? <input type="hidden" name="id" value={partner.id} /> : null}
      <div>
        <label htmlFor={`pn-${k}`} className="label">
          {t.adminShopPartnerName}
        </label>
        <input
          id={`pn-${k}`}
          name="name"
          required
          maxLength={80}
          defaultValue={partner?.name}
          className="field"
          autoComplete="off"
        />
      </div>
      <div>
        <label htmlFor={`pc-${k}`} className="label">
          {t.adminShopPartnerContact}
        </label>
        <input
          id={`pc-${k}`}
          name="contact"
          maxLength={200}
          defaultValue={partner?.contact ?? ""}
          className="field"
          autoComplete="off"
        />
      </div>
      <div>
        <label htmlFor={`pt-${k}`} className="label">
          {t.adminShopPartnerNote}
        </label>
        <input
          id={`pt-${k}`}
          name="note"
          maxLength={500}
          defaultValue={partner?.note ?? ""}
          className="field"
          autoComplete="off"
        />
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          name="active"
          defaultChecked={partner ? partner.active : true}
          className="mt-1 size-5"
        />
        <span className="text-sm">{t.adminShopPartnerActive}</span>
      </label>
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
          {t.adminShopSaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {partner ? t.adminShopSave : t.adminShopPartnerAdd}
      </button>
    </form>
  );
}
