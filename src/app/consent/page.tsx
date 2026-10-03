import { redirect } from "next/navigation";
import { POLICY_VERSION } from "@/config/legal";
import { requireUser } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/utils";
import { isConsentCurrent } from "@/lib/consent/consent";
import { getLatestConsent } from "@/lib/consent/server";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { LogoMark } from "@/components/Logo";
import { ConsentForm } from "./ConsentForm";

export default async function ConsentPage({
  searchParams,
}: PageProps<"/consent">) {
  const user = await requireUser();
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(rawNext);

  if (isConsentCurrent(await getLatestConsent(user.id))) redirect(next);

  const [t, lang] = await Promise.all([getT(), getLang()]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <div className="flex items-center gap-2">
        <LogoMark size={36} />
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.consentTitle}
        </h1>
      </div>
      <p>{t.consentIntro}</p>
      <p className="text-muted text-sm">
        {t.consentPolicyVersion} {formatDate(lang, POLICY_VERSION)} ·{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-primary-strong font-medium underline"
        >
          {t.consentReadPrivacy}
        </a>{" "}
        ·{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="text-primary-strong font-medium underline"
        >
          {t.consentReadTerms}
        </a>
      </p>
      <ConsentForm next={next} />
    </div>
  );
}
