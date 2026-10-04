import Link from "next/link";
import { redirect } from "next/navigation";
import { LangSwitch } from "@/components/LangSwitch";
import { LogoMark } from "@/components/Logo";
import { POST_LOGIN_PATH } from "@/config/routes";
import { getCurrentUser } from "@/lib/auth/server";
import { getT } from "@/lib/i18n/server";

export default async function Home() {
  if (await getCurrentUser()) redirect(POST_LOGIN_PATH);
  const t = await getT();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8">
      <header className="flex h-14 items-center justify-between">
        <span className="text-primary-strong font-bold">{t.appName}</span>
        <LangSwitch />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center">
        <LogoMark size={160} priority />
        <div className="space-y-2">
          <h1 className="text-primary-strong text-3xl font-bold">
            {t.landingHeadline}
          </h1>
          <p className="text-foreground text-lg">{t.landingSub}</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Link href="/auth?mode=signup" className="btn btn-primary w-full">
            {t.landingCtaStart}
          </Link>
          <Link href="/quiz" className="btn btn-secondary w-full">
            {t.landingQuizCta}
          </Link>
          <Link href="/auth" className="btn btn-ghost w-full">
            {t.landingCtaLogin}
          </Link>
          <p className="text-muted text-sm">{t.landingTrial}</p>
        </div>
      </main>

      <footer className="text-muted space-y-3 text-center text-sm">
        <p>{t.landingDisclaimer}</p>
        <p className="flex justify-center gap-4">
          <Link
            href="/privacy"
            className="text-primary-strong font-medium underline"
          >
            {t.landingPrivacy}
          </Link>
          <Link
            href="/terms"
            className="text-primary-strong font-medium underline"
          >
            {t.landingTerms}
          </Link>
        </p>
      </footer>
    </div>
  );
}
