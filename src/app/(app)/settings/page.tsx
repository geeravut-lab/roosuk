import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { LangSwitch } from "@/components/LangSwitch";
import { CONSENT_ITEMS, POLICY_VERSION } from "@/config/legal";
import { DATA_REGION } from "@/config/data-region";
import { requireUser } from "@/lib/auth/server";
import { getLatestConsent } from "@/lib/consent/server";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { getLineLoginEnv } from "@/lib/env";
import { isLineSyntheticEmail } from "@/lib/line/login";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).settingsTitle };
}

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const user = await requireUser();
  const [t, lang, params, consent] = await Promise.all([
    getT(),
    getLang(),
    searchParams,
    getLatestConsent(user.id),
  ]);
  const supabase = await createClient();
  const { data: lineLink } = await supabase
    .from("line_links")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle<{ display_name: string | null }>();

  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const email = isLineSyntheticEmail(user.email) ? "—" : (user.email ?? "—");
  const vars = {
    country: lang === "en" ? DATA_REGION.countryEn : DATA_REGION.countryTh,
    region: DATA_REGION.id,
  };

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.settingsTitle}
      </h1>

      {isErrorKey(rawError) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(rawError, t)}
        </p>
      ) : null}

      <section className="card space-y-3" aria-labelledby="account-h">
        <h2 id="account-h" className="font-semibold">
          {t.settingsAccount}
        </h2>
        <dl className="text-sm">
          <dt className="text-muted">{t.settingsEmail}</dt>
          <dd className="font-medium break-all">{email}</dd>
        </dl>
        <div>
          <p className="text-muted mb-1 text-sm">{t.settingsLanguage}</p>
          <LangSwitch />
        </div>
      </section>

      {getLineLoginEnv() ? (
        <section className="card space-y-3" aria-labelledby="line-h">
          <h2 id="line-h" className="font-semibold">
            {t.settingsSignInMethods}
          </h2>
          <p className="text-muted text-sm">{t.settingsLineHint}</p>
          {lineLink ? (
            <p className="text-primary-strong inline-flex items-center gap-2 font-medium">
              <Check className="size-5" aria-hidden />
              {t.settingsLineLinked}
              {lineLink.display_name ? ` (${lineLink.display_name})` : ""}
            </p>
          ) : (
            <a
              href="/api/auth/line?mode=link&next=/settings"
              className="btn btn-secondary"
            >
              {t.settingsLinkLine}
            </a>
          )}
        </section>
      ) : null}

      <section className="card space-y-3" aria-labelledby="consent-h">
        <h2 id="consent-h" className="font-semibold">
          {t.settingsConsentTitle}
        </h2>
        {consent ? (
          <>
            <p className="text-muted text-sm">
              {t.settingsConsentVersion}{" "}
              {formatDate(lang, consent.policy_version)} ·{" "}
              {formatDateTime(lang, consent.accepted_at)}
            </p>
            <ul className="space-y-2 text-sm">
              {CONSENT_ITEMS.map((item) => {
                const granted = consent.items[item.key] === true;
                const label = t[`consent_${item.key}` as const];
                return (
                  <li key={item.key} className="flex items-start gap-2">
                    {granted ? (
                      <Check
                        className="text-primary-strong mt-0.5 size-5 shrink-0"
                        aria-label={t.settingsConsentGranted}
                      />
                    ) : (
                      <X
                        className="text-muted mt-0.5 size-5 shrink-0"
                        aria-label={t.settingsConsentDeclined}
                      />
                    )}
                    <span>
                      {item.key === "data_region" ? fmt(label, vars) : label}
                    </span>
                  </li>
                );
              })}
            </ul>
            {consent.policy_version !== POLICY_VERSION ? (
              <p className="text-muted text-sm">
                {t.consentPolicyVersion} {formatDate(lang, POLICY_VERSION)}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <form action={signOutAction}>
        <button type="submit" className="btn btn-secondary w-full md:w-auto">
          {t.authSignOut}
        </button>
      </form>
    </div>
  );
}
