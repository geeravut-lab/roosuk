"use client";

import { useActionState, useRef } from "react";
import { agentAction, type AgentState } from "@/app/actions/agent";
import { Spinner } from "@/components/Spinner";
import { MAX_MESSAGE_CHARS } from "@/lib/ask/limits";
import { errorText } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";

const initial: AgentState = {};

export function AgentForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(agentAction, initial);
  const box = useRef<HTMLTextAreaElement>(null);
  const suggestions = [
    t.agentSuggest_month,
    t.agentSuggest_doctor,
    t.agentSuggest_remind,
  ];
  return (
    <form action={action} key={state.sent ?? 0} className="space-y-3">
      <div className="space-y-2">
        <p className="text-muted text-sm">{t.agentSuggest}</p>
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="border-line bg-surface min-h-11 rounded-full border-2 px-3.5 text-sm font-semibold"
                onClick={() => {
                  if (box.current) {
                    box.current.value = s;
                    box.current.focus();
                  }
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <label htmlFor="agent-message" className="sr-only">
        {t.agentPlaceholder}
      </label>
      <textarea
        ref={box}
        id="agent-message"
        name="message"
        rows={3}
        required
        maxLength={MAX_MESSAGE_CHARS}
        defaultValue={state.message ?? ""}
        placeholder={t.agentPlaceholder}
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
        {pending ? t.agentThinking : t.agentSend}
      </button>
      <p role="status" className="sr-only">
        {pending ? t.agentThinking : ""}
      </p>
    </form>
  );
}
