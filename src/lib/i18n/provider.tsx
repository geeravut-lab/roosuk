"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fmt, type Dict, type Lang } from "./dict";

interface I18nValue {
  lang: Lang;
  t: Dict;
  /** Fill `{placeholders}` in a dictionary string. */
  fmt: typeof fmt;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * `dict` is the already-selected language, passed down from the server layout
 * so only one language is serialised into the page.
 */
export function I18nProvider({
  lang,
  dict,
  children,
}: {
  lang: Lang;
  dict: Dict;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ lang, t: dict, fmt }), [lang, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
