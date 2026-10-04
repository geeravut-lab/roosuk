"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTheme } from "@/app/actions/theme";
import { THEMES, type Theme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n/provider";

/** Three-way theme choice, same look as the language switch. */
export function ThemeSwitch({ current }: { current: Theme }) {
  const { t } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();

  const choose = (next: Theme) => {
    if (next === value) return;
    setValue(next);
    startTransition(async () => {
      await setTheme(next);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={t.themeLabel}
      className="border-line bg-surface inline-flex rounded-xl border p-0.5"
    >
      {THEMES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={code === value}
          disabled={pending}
          onClick={() => choose(code)}
          className={`min-h-9 min-w-11 rounded-[10px] px-3 text-sm font-semibold transition-colors ${
            code === value
              ? "bg-primary-strong text-on-primary"
              : "text-muted hover:bg-tint-primary"
          }`}
        >
          {t[`theme_${code}` as const]}
        </button>
      ))}
    </div>
  );
}
