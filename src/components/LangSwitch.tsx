"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLanguage } from "@/app/actions/language";
import { LANGS, type Lang } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";

/** Two-button language toggle. Writes a cookie (+ profile when signed in) and refreshes the page. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: Lang) => {
    if (next === lang) return;
    startTransition(async () => {
      await setLanguage(next);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={t.language}
      className={`border-line bg-surface inline-flex rounded-xl border p-0.5 ${className}`}
    >
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === lang}
          disabled={pending}
          onClick={() => choose(code)}
          className={`min-h-9 min-w-11 rounded-[10px] px-3 text-sm font-semibold transition-colors ${
            code === lang
              ? "bg-primary-strong text-on-primary"
              : "text-muted hover:bg-tint-primary"
          }`}
        >
          {code === "th" ? t.langThai : t.langEnglish}
        </button>
      ))}
    </div>
  );
}
