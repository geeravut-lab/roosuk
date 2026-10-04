"use client";

import Link from "next/link";
import type { KeepMode } from "@/lib/files/types";
import { useI18n } from "@/lib/i18n/provider";

/**
 * The question asked for EVERY scan: keep the original file or not. There is no
 * pre-selected answer — the form cannot be submitted until the user picks one —
 * and the server re-checks the answer and the consent. When keeping is not
 * possible the answer is a fixed "don't keep" (so the action still gets one).
 */
export function KeepFileChoice({ mode }: { mode: KeepMode }) {
  const { t } = useI18n();
  if (mode !== "available")
    return (
      <>
        <input type="hidden" name="keepFile" value="discard" />
        {mode === "needs_consent" ? (
          <p className="text-muted text-sm">
            {t.keepNeedsConsent}{" "}
            <Link href="/settings" className="text-primary-strong underline">
              {t.keepNeedsConsentLink}
            </Link>
          </p>
        ) : null}
      </>
    );
  return (
    <fieldset className="card space-y-2">
      <legend className="font-semibold">{t.keepTitle}</legend>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="radio"
          name="keepFile"
          value="keep"
          required
          className="size-5 shrink-0"
        />
        <span>{t.keepYes}</span>
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="radio"
          name="keepFile"
          value="discard"
          required
          className="size-5 shrink-0"
        />
        <span>{t.keepNo}</span>
      </label>
      <p className="text-muted text-sm">{t.keepHint}</p>
    </fieldset>
  );
}
