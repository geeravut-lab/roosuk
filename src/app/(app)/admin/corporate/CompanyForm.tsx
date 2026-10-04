"use client";

import { saveCompanyAction, type CompanyState } from "@/app/actions/corporate";
import { Spinner } from "@/components/Spinner";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

const initial: CompanyState = {};

export function CompanyForm({
  company,
}: {
  company?: {
    id: string;
    name: string;
    seats: number;
    tier: "gold" | "premium";
    valid_until: string;
    note: string | null;
    active: boolean;
  };
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(saveCompanyAction, initial);
  const k = company?.id ?? "new";
  const bad = (f: string) => state.field === f;
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      {company ? <input type="hidden" name="id" value={company.id} /> : null}
      <div>
        <label htmlFor={`cn-${k}`} className="label">
          {t.adminCorpName}
        </label>
        <input
          id={`cn-${k}`}
          name="name"
          required
          maxLength={100}
          defaultValue={company?.name}
          aria-invalid={bad("name") || undefined}
          className="field"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`cs-${k}`} className="label">
            {t.adminCorpSeats}
          </label>
          <input
            id={`cs-${k}`}
            name="seats"
            required
            inputMode="numeric"
            defaultValue={company?.seats}
            aria-invalid={bad("seats") || undefined}
            className="field"
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor={`ct-${k}`} className="label">
            {t.adminCorpTier}
          </label>
          <select
            id={`ct-${k}`}
            name="tier"
            defaultValue={company?.tier ?? "premium"}
            className="field"
          >
            <option value="premium">{t.planName_premium}</option>
            <option value="gold">{t.planName_gold}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`cu-${k}`} className="label">
            {t.adminCorpUntil}
          </label>
          <input
            id={`cu-${k}`}
            name="validUntil"
            type="date"
            required
            defaultValue={company?.valid_until}
            aria-invalid={bad("validUntil") || undefined}
            className="field"
          />
        </div>
      </div>
      <div>
        <label htmlFor={`cm-${k}`} className="label">
          {t.adminCorpNote}
        </label>
        <input
          id={`cm-${k}`}
          name="note"
          maxLength={300}
          defaultValue={company?.note ?? ""}
          className="field"
          autoComplete="off"
        />
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="active"
          defaultChecked={company ? company.active : true}
          className="size-5"
        />
        <span className="text-sm">{t.adminCorpActive}</span>
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
          {t.companySaved}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? <Spinner /> : null}
        {company ? t.adminCorpSave : t.adminCorpNew}
      </button>
    </form>
  );
}
