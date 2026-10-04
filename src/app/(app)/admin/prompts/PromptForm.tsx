"use client";

import { useState } from "react";
import {
  savePromptExtraAction,
  type PromptSaveState,
} from "@/app/actions/prompts";
import { PROMPT_EXTRA_MAX, type PromptReason } from "@/lib/ai/prompt-extra";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";
import { Spinner } from "@/components/Spinner";

const initial: PromptSaveState = {};

/** One task's addition: edit, "check and save", or cancel back to what is saved. */
export function PromptForm({
  task,
  saved,
}: {
  task: string;
  /** The text currently in force. */
  saved: string;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(saved);
  const [state, onSubmit, pending] = useFormAction(
    savePromptExtraAction,
    initial,
  );
  const id = `extra-${task}`;
  const dirty = text.trim() !== saved.trim();

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="task" value={task} />
      <label htmlFor={id} className="label">
        {t.promptExtraLabel}
      </label>
      <textarea
        id={id}
        name="body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={PROMPT_EXTRA_MAX + 200}
        className="field"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-muted text-sm">
        {fmt(t.promptExtraHint, { max: PROMPT_EXTRA_MAX })} ({text.length}/
        {PROMPT_EXTRA_MAX})
      </p>

      {state.status === "saved" || state.status === "cleared" ? (
        <p role="status" className="text-sm font-medium">
          {state.status === "saved" ? t.promptSaved : t.promptCleared}
        </p>
      ) : null}
      {state.status === "rejected" ||
      state.status === "risky" ||
      state.status === "unavailable" ||
      state.status === "invalid" ? (
        <div
          role="alert"
          className="bg-tint-warn space-y-1 rounded-xl px-3 py-2 text-sm"
        >
          <p className="font-medium">
            {state.status === "rejected"
              ? t.promptRejected
              : state.status === "risky"
                ? t.promptRisky
                : state.status === "unavailable"
                  ? t.promptUnavailable
                  : t.promptInvalid}
          </p>
          {state.reasons?.length ? (
            <ul className="list-disc pl-5">
              {state.reasons.map((r: PromptReason) => (
                <li key={r}>{t[`promptReason_${r}` as keyof Dict]}</li>
              ))}
            </ul>
          ) : null}
          {state.status === "risky" ? (
            state.notes?.length ? (
              <ul className="list-disc pl-5">
                {state.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : (
              <p>{t.promptRiskyGeneric}</p>
            )
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="btn btn-primary"
        >
          {pending ? <Spinner /> : null}
          {pending ? t.promptChecking : t.promptSave}
        </button>
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => setText(saved)}
          className="btn btn-secondary"
        >
          {t.promptCancel}
        </button>
      </div>
    </form>
  );
}
