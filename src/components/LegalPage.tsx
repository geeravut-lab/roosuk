import Link from "next/link";
import { DATA_REGION } from "@/config/data-region";
import { POLICY_VERSION } from "@/config/legal";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import type { Lang } from "@/lib/i18n/dict";

export interface LegalSection {
  title: keyof Dict;
  body: keyof Dict;
}

export function LegalPage({
  t,
  lang,
  title,
  sections,
}: {
  t: Dict;
  lang: Lang;
  title: string;
  sections: readonly LegalSection[];
}) {
  const vars = {
    country: lang === "en" ? DATA_REGION.countryEn : DATA_REGION.countryTh,
    region: DATA_REGION.id,
  };
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <Link
        href="/"
        className="text-primary-strong inline-flex min-h-11 items-center font-medium underline"
      >
        {t.authBackHome}
      </Link>
      <h1 className="text-primary-strong text-3xl font-bold">{title}</h1>
      <p
        role="note"
        className="bg-tint-primary rounded-xl px-3 py-2 text-sm font-medium"
      >
        {t.legalDraftNotice}
      </p>
      <p className="text-muted text-sm">
        {t.consentPolicyVersion} {formatDate(lang, POLICY_VERSION)}
      </p>
      {sections.map((s) => (
        <section key={s.title} className="space-y-1">
          <h2 className="text-lg font-semibold">{t[s.title]}</h2>
          <p className="leading-relaxed">{fmt(t[s.body], vars)}</p>
        </section>
      ))}
    </div>
  );
}
