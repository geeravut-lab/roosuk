import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { getLang, getT } from "@/lib/i18n/server";

const SECTIONS: readonly LegalSection[] = [
  { title: "privacy_s1_title", body: "privacy_s1_body" },
  { title: "privacy_s2_title", body: "privacy_s2_body" },
  { title: "privacy_s3_title", body: "privacy_s3_body" },
  { title: "privacy_s4_title", body: "privacy_s4_body" },
  { title: "privacy_s5_title", body: "privacy_s5_body" },
  { title: "privacy_s6_title", body: "privacy_s6_body" },
];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).privacyTitle };
}

export default async function PrivacyPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  return (
    <LegalPage t={t} lang={lang} title={t.privacyTitle} sections={SECTIONS} />
  );
}
