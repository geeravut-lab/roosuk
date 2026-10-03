import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { getLang, getT } from "@/lib/i18n/server";

const SECTIONS: readonly LegalSection[] = [
  { title: "terms_s1_title", body: "terms_s1_body" },
  { title: "terms_s2_title", body: "terms_s2_body" },
  { title: "terms_s3_title", body: "terms_s3_body" },
  { title: "terms_s4_title", body: "terms_s4_body" },
];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).termsTitle };
}

export default async function TermsPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  return (
    <LegalPage t={t} lang={lang} title={t.termsTitle} sections={SECTIONS} />
  );
}
