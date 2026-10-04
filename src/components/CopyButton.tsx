"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

/** Copies a short text (a link or a code) and says so; where copying is blocked the text is selectable above it. */
export function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
        {t.copyBtn}
      </button>
      <span role="status" className="text-sm font-medium">
        {state === "copied"
          ? t.copyDone
          : state === "failed"
            ? t.copyFailed
            : ""}
      </span>
    </>
  );
}
