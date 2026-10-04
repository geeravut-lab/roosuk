"use client";

import { useActionState } from "react";
import { askAction, type AskState } from "@/app/actions/ask";
import { MAX_MESSAGE_CHARS } from "@/lib/ask/limits";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { Spinner } from "@/components/Spinner";

const initial: AskState = {};

export function AskForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(askAction, initial);

  return (
    // `key` remounts the form after a successful answer, which clears the box; a failure keeps the text.
    <form action={action} key={state.sent ?? 0} className="space-y-3">
      <label htmlFor="message" className="sr-only">
        {t.askPlaceholder}
      </label>
      <textarea
        id="message"
        name="message"
        rows={3}
        required
        maxLength={MAX_MESSAGE_CHARS}
        defaultValue={state.message ?? ""}
        placeholder={t.askPlaceholder}
        className="field py-2"
      />
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? <Spinner /> : null}
        {pending ? t.askThinking : t.askSend}
      </button>
      <p role="status" className="sr-only">
        {pending ? t.askThinking : ""}
      </p>
    </form>
  );
}
