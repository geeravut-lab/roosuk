"use client";

import { useActionState, useState, useTransition } from "react";
import { Download, Trash2 } from "lucide-react";
import {
  deleteAccountAction,
  exportMyDataAction,
  type DeleteState,
} from "@/app/actions/privacy";
import { DELETE_PHRASES, isDeletePhrase } from "@/lib/privacy/privacy";
import { errorText, fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { Spinner } from "@/components/Spinner";

/** "Download my data": the file is made on the server and saved by the browser — no copy stays on the server. */
export function ExportButton() {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-secondary w-full sm:w-auto"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await exportMyDataAction();
            if (!r.ok)
              return setMessage({ text: errorText(r.error, t), ok: false });
            const url = URL.createObjectURL(
              new Blob([r.json], { type: "application/json" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = r.filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage({
              ok: true,
              text:
                fmt(t.exportDone, { rows: r.rows }) +
                (r.skipped.length
                  ? ` ${fmt(t.exportSkipped, { tables: r.skipped.join(", ") })}`
                  : ""),
            });
          })
        }
      >
        {pending ? <Spinner /> : null}
        <Download className="size-5" aria-hidden />
        {pending ? t.exportBusy : t.exportBtn}
      </button>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className="text-sm font-medium"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

const initial: DeleteState = {};

/** Two steps: see exactly what goes (real counts), then type a phrase. The server checks the phrase again. */
export function DeleteAccount({
  erasedRows,
  retainedRows,
}: {
  erasedRows: number;
  retainedRows: number;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(deleteAccountAction, initial);
  const phrase = lang === "en" ? DELETE_PHRASES[1] : DELETE_PHRASES[0];

  if (!open)
    return (
      <button
        type="button"
        className="btn border-danger bg-surface w-full border-2 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-5" aria-hidden />
        {t.deleteOpen}
      </button>
    );

  return (
    <form
      action={action}
      className="border-danger space-y-3 rounded-2xl border-2 p-4"
      aria-labelledby="delete-h"
    >
      <h3 id="delete-h" className="font-semibold">
        {t.deletePreviewIntro}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>{fmt(t.deleteErased, { n: erasedRows })}</li>
        {retainedRows > 0 ? (
          <li>{fmt(t.deleteRetained, { n: retainedRows })}</li>
        ) : null}
        <li>{t.deleteIrreversible}</li>
      </ul>
      <p className="text-sm font-medium">{t.deleteDownloadFirst}</p>
      <div>
        <label htmlFor="phrase" className="label">
          {fmt(t.deleteTypePrompt, { phrase })}
        </label>
        <input
          id="phrase"
          name="phrase"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="field"
        />
      </div>
      {state.error ? (
        <p
          role="alert"
          className="bg-tint-danger rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(state.error, t)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !isDeletePhrase(typed)}
          className="btn bg-danger border-danger border-2 text-white"
        >
          {pending ? <Spinner /> : null}
          {t.deleteConfirm}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          {t.cancel}
        </button>
      </div>
    </form>
  );
}
