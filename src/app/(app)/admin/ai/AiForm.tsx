"use client";

import { useState, useTransition } from "react";
import {
  saveAiSettingsAction,
  testModelAction,
  type AiFormState,
} from "@/app/actions/ai";
import { errorText, fmt, type Dict } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { useFormAction } from "@/lib/use-form-action";

export interface TaskView {
  task: string;
  /** Saved values ("" = use the default). */
  primary: string;
  fallback: string;
  models: Record<string, string>;
  /** Code defaults, shown as placeholders. */
  defaultPrimary: string;
  defaultFallback: string | null;
  defaultModels: Record<string, string>;
  /** What is in effect right now (after key checks), for the summary line. */
  effective: { primary: string; fallback: string | null } | null;
}

export interface ProviderView {
  id: string;
  label: string;
  hasKey: boolean;
  envKey: string;
  /** Dropdown options: the API's list, or the code's known models when it could not be listed. */
  models: string[];
  fromApi: boolean;
}

const initial: AiFormState = {};

function TestButton({
  provider,
  model,
  fallbackModel,
}: {
  provider: string;
  /** Current field value ("" = the code default). */
  model: string;
  fallbackModel: string;
}) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await testModelAction(
              provider,
              model.trim() || fallbackModel,
            );
            setOk(r.ok);
            setResult(
              r.ok
                ? fmt(t.adminAiTestOk, { ms: r.ms })
                : fmt(t.adminAiTestFail, { error: r.error ?? "?" }),
            );
          })
        }
      >
        {pending ? t.adminAiTesting : t.adminAiTest}
      </button>
      <span
        role="status"
        className={`text-sm font-medium ${ok ? "" : "text-muted"}`}
      >
        {result}
      </span>
    </span>
  );
}

function ModelField({
  task,
  provider,
  value,
  defaultModel,
}: {
  task: string;
  provider: ProviderView;
  value: string;
  defaultModel: string;
}) {
  const { t } = useI18n();
  const [model, setModel] = useState(value);
  const id = `m-${provider.id}-${task}`;
  // A saved value the provider no longer lists must stay visible, or saving would silently drop it.
  const extra = model && !provider.models.includes(model);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">
        {provider.label}
      </label>
      <select
        id={id}
        name={`model.${provider.id}.${task}`}
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="field"
      >
        <option value="">
          {fmt(t.adminAiModelPlaceholder, { model: defaultModel })}
        </option>
        {extra ? (
          <option value={model}>
            {fmt(t.adminAiModelNotListed, { model })}
          </option>
        ) : null}
        {provider.models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <TestButton
        provider={provider.id}
        model={model}
        fallbackModel={defaultModel}
      />
    </div>
  );
}

export function AiForm({
  tasks,
  providers,
}: {
  tasks: TaskView[];
  providers: ProviderView[];
}) {
  const { t } = useI18n();
  const [state, onSubmit, pending] = useFormAction(
    saveAiSettingsAction,
    initial,
  );
  const label = (id: string) => providers.find((p) => p.id === id)?.label ?? id;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ul className="space-y-4">
        {tasks.map((v) => (
          <li key={v.task} className="card space-y-3">
            <div>
              <h3 className="font-semibold">
                {t[`aiTask_${v.task}` as keyof Dict]}
              </h3>
              <p className="text-muted text-sm">
                {v.effective
                  ? fmt(t.adminAiEffective, {
                      primary: label(v.effective.primary),
                      fallback: v.effective.fallback
                        ? fmt(t.adminAiEffectiveFallback, {
                            fallback: label(v.effective.fallback),
                          })
                        : "",
                    })
                  : t.adminAiNoRoute}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`p-${v.task}`} className="label">
                  {t.adminAiPrimary}
                </label>
                <select
                  id={`p-${v.task}`}
                  name={`primary.${v.task}`}
                  defaultValue={v.primary}
                  className="field"
                >
                  <option value="">
                    {fmt(t.adminAiDefault, {
                      provider: label(v.defaultPrimary),
                    })}
                  </option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.hasKey}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`f-${v.task}`} className="label">
                  {t.adminAiFallback}
                </label>
                <select
                  id={`f-${v.task}`}
                  name={`fallback.${v.task}`}
                  defaultValue={v.fallback}
                  className="field"
                >
                  <option value="">
                    {v.defaultFallback
                      ? fmt(t.adminAiDefault, {
                          provider: label(v.defaultFallback),
                        })
                      : t.adminAiFallbackDefaultNone}
                  </option>
                  <option value="none">{t.adminAiFallbackNone}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.hasKey}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <details>
              <summary className="text-primary-strong min-h-11 cursor-pointer py-2 font-semibold">
                {t.adminAiModels}
              </summary>
              <div className="space-y-4 pt-2">
                {providers.map((p) => (
                  <ModelField
                    key={p.id}
                    task={v.task}
                    provider={p}
                    value={v.models[p.id] ?? ""}
                    defaultModel={v.defaultModels[p.id]}
                  />
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>

      {state.error ? (
        <p
          role="alert"
          className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm font-medium">
          {t.adminSaved}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full sm:w-auto"
      >
        {t.save}
      </button>
    </form>
  );
}
