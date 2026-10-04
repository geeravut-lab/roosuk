"use client";

import { useState, useTransition } from "react";
import {
  saveExtraAction,
  suggestDraftAction,
  type MarkerSaveState,
} from "@/app/actions/biomarkers";
import { errorText, fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

export interface MarkerFields {
  key: string;
  th: string;
  en: string;
  unit: string;
  normalLo: string;
  normalHi: string;
  watchLo: string;
  watchHi: string;
  aliases: string;
  conversions: string;
  sourceNote: string;
}

export const EMPTY_FIELDS: MarkerFields = {
  key: "",
  th: "",
  en: "",
  unit: "",
  normalLo: "",
  normalHi: "",
  watchLo: "",
  watchHi: "",
  aliases: "",
  conversions: "",
  sourceNote: "",
};

const initial: MarkerSaveState = {};

/** Create or edit one test. Always saved as a draft; the AI button only pre-fills the fields. */
export function MarkerForm({
  initialFields,
  editingKey,
  idPrefix,
  suggestName,
  suggestUnit,
}: {
  initialFields: MarkerFields;
  editingKey?: string;
  idPrefix: string;
  /** The printed name the AI draft should be about (the unknown test this form was opened from). */
  suggestName?: string;
  suggestUnit?: string;
}) {
  const { t } = useI18n();
  const [f, setF] = useState(initialFields);
  const [state, onSubmit, pending] = useFormAction(saveExtraAction, initial);
  const [suggesting, startSuggest] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const set =
    (k: keyof MarkerFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));
  const id = (k: string) => `${idPrefix}-${k}`;
  const field = (
    k: keyof MarkerFields,
    label: string,
    props: {
      inputMode?: "decimal";
      required?: boolean;
      disabled?: boolean;
    } = {},
  ) => (
    <div>
      <label htmlFor={id(k)} className="label">
        {label}
      </label>
      <input
        id={id(k)}
        name={k}
        value={f[k]}
        onChange={set(k)}
        className="field"
        autoComplete="off"
        {...props}
      />
    </div>
  );

  function suggest() {
    setNote(null);
    startSuggest(async () => {
      const r = await suggestDraftAction(
        suggestName || f.en || f.th,
        suggestUnit || f.unit,
      );
      if (!r.ok) {
        setNote(
          r.error === "unknown"
            ? t.bmSuggestUnknown
            : r.error === "known_already"
              ? t.bmSuggestKnown
              : t.bmSuggestUnavailable,
        );
        return;
      }
      const d = r.draft;
      const s = (n: number | null) => (n === null ? "" : String(n));
      setF((p) => ({
        ...p,
        th: p.th || d.th,
        en: p.en || d.en,
        unit: d.unit,
        normalLo: s(d.normalLo),
        normalHi: s(d.normalHi),
        watchLo: s(d.watchLo),
        watchHi: s(d.watchHi),
        aliases:
          p.aliases || [suggestName, ...d.aliases].filter(Boolean).join("\n"),
        sourceNote: p.sourceNote,
      }));
      setNote(t.bmSuggestFilled);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {editingKey ? (
        <input type="hidden" name="editingKey" value={editingKey} />
      ) : null}
      {editingKey ? (
        <input type="hidden" name="key" value={editingKey} />
      ) : (
        field("key", t.bmFieldKey)
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("th", t.bmFieldTh, { required: true })}
        {field("en", t.bmFieldEn, { required: true })}
      </div>
      {field("unit", t.bmFieldUnit, { required: true })}
      <div className="grid grid-cols-2 gap-3">
        {field("normalLo", t.bmNormalLo, { inputMode: "decimal" })}
        {field("normalHi", t.bmNormalHi, { inputMode: "decimal" })}
        {field("watchLo", t.bmWatchLo, { inputMode: "decimal" })}
        {field("watchHi", t.bmWatchHi, { inputMode: "decimal" })}
      </div>
      <div>
        <label htmlFor={id("aliases")} className="label">
          {t.bmAliases}
        </label>
        <textarea
          id={id("aliases")}
          name="aliases"
          value={f.aliases}
          onChange={set("aliases")}
          rows={3}
          className="field"
          required
        />
      </div>
      <div>
        <label htmlFor={id("conversions")} className="label">
          {t.bmConversions}
        </label>
        <textarea
          id={id("conversions")}
          name="conversions"
          value={f.conversions}
          onChange={set("conversions")}
          rows={2}
          className="field"
        />
      </div>
      {field("sourceNote", t.bmSource, { required: true })}

      {note ? (
        <p
          role="status"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {note} <span className="block font-normal">{t.bmDraftNote}</span>
        </p>
      ) : null}
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
          {fmt(t.bmSaved, { key: state.saved })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {t.bmSave}
        </button>
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting || !(suggestName || f.en || f.th)}
          className="btn btn-secondary"
        >
          {suggesting ? t.bmSuggesting : t.bmSuggest}
        </button>
      </div>
    </form>
  );
}
