import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { cookies } from "next/headers";
import { LangSwitch } from "@/components/LangSwitch";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
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
import { savePrefsAction } from "@/app/actions/notifications";
import { updateOptionalConsentAction } from "@/app/actions/privacy";
import Link from "next/link";
import { OWNED_TABLES } from "@/config/user-data";
import { summariseDeletion } from "@/lib/privacy/privacy";
import { DeleteAccount, ExportButton } from "./PrivacyCards";
import { SubmitButton } from "@/components/SubmitButton";

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

  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select("line_transactional, line_reminders")
    .eq("user_id", user.id)
    .maybeSingle<{ line_transactional: boolean; line_reminders: boolean }>();
  // Counts the way the user can see them (their own RLS-limited client): what a deletion would erase and what stays.
  const counts: Record<string, number> = {};
  await Promise.all(
    OWNED_TABLES.filter((tbl) => tbl.countable).map(async (tbl) => {
      const { count } = await supabase
        .from(tbl.table)
        .select("*", { count: "exact", head: true });
      counts[tbl.table] = count ?? 0;
    }),
  );
  const { erasedRows, retainedRows } = summariseDeletion(counts);
  const addFriendUrl = process.env.LINE_OA_ADD_FRIEND_URL?.trim();
  // A short diagnostic tag (letters, digits, underscore) so a failed sign-in step can be named.
  const rawReason = Array.isArray(params.reason)
    ? params.reason[0]
    : params.reason;
  const reason =
    rawReason && /^[a-z0-9_]{1,60}$/i.test(rawReason) ? rawReason : null;

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
          {reason ? (
            <span className="text-muted mt-1 block text-xs font-normal">
              {fmt(t.errorReasonCode, { reason })}
            </span>
          ) : null}
        </p>
      ) : null}
      {params.line === "linked" ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.settingsLineLinkedOk}
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
        <div>
          <p className="text-muted mb-1 text-sm">{t.settingsTheme}</p>
          <ThemeSwitch
            current={parseTheme((await cookies()).get(THEME_COOKIE)?.value)}
          />
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

      <section className="card space-y-3" aria-labelledby="notif-h">
        <h2 id="notif-h" className="font-semibold">
          {t.notifSettingsTitle}
        </h2>
        {params.notif === "saved" ? (
          <p
            role="status"
            className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
          >
            {t.notifSaved}
          </p>
        ) : null}
        {lineLink ? (
          <form action={savePrefsAction} className="space-y-3">
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                name="line_transactional"
                defaultChecked={prefs?.line_transactional ?? true}
                className="mt-1 size-5 shrink-0"
              />
              <span>{t.notifTransactional}</span>
            </label>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                name="line_reminders"
                defaultChecked={prefs?.line_reminders ?? false}
                className="mt-1 size-5 shrink-0"
              />
              <span>
                {t.notifReminders}
                <span className="text-muted block text-sm">
                  {t.notifRemindersHint}
                </span>
              </span>
            </label>
            <p className="text-muted text-sm">{t.notifSettingsFriend}</p>
            {addFriendUrl?.startsWith("https://") ? (
              <a
                href={addFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                {t.notifSettingsAddFriend}
              </a>
            ) : null}
            <SubmitButton className="btn btn-primary">{t.save}</SubmitButton>
          </form>
        ) : (
          <p className="text-muted text-sm">{t.notifSettingsNotLinked}</p>
        )}
      </section>

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

      {consent ? (
        <section
          className="card space-y-3"
          aria-labelledby="optional-consent-h"
        >
          <h2 id="optional-consent-h" className="font-semibold">
            {t.consentOptionalTitle}
          </h2>
          {params.consent === "saved" ? (
            <p
              role="status"
              className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
            >
              {t.consentOptionalSaved}
            </p>
          ) : null}
          <form action={updateOptionalConsentAction} className="space-y-3">
            {CONSENT_ITEMS.filter((i) => !i.required).map((item) => (
              <label key={item.key} className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  name={`consent_${item.key}`}
                  defaultChecked={consent.items[item.key] === true}
                  className="mt-1 size-5 shrink-0"
                />
                <span>{t[`consent_${item.key}` as const]}</span>
              </label>
            ))}
            <SubmitButton className="btn btn-secondary">
              {t.consentOptionalSave}
            </SubmitButton>
          </form>
        </section>
      ) : null}

      <section className="card space-y-3" aria-labelledby="rights-h">
        <h2 id="rights-h" className="font-semibold">
          {t.privacyRightsTitle}
        </h2>
        <p className="text-muted text-sm">{t.privacyRightsIntro}</p>
        <ExportButton />
        <p className="text-muted text-sm">{t.exportHint}</p>
        <Link href="/privacy" className="btn btn-secondary w-full sm:w-auto">
          {t.policyBtn}
        </Link>
      </section>

      <section className="card space-y-2" aria-labelledby="store-h">
        <h2 id="store-h" className="font-semibold">
          {t.dataStoreTitle}
        </h2>
        <dl className="text-sm">
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{t.dataStoreProvider}</dt>
            <dd className="font-medium">{DATA_REGION.provider}</dd>
          </div>
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{t.dataStoreRegion}</dt>
            <dd className="font-medium">{DATA_REGION.id}</dd>
          </div>
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{t.dataStoreCountry}</dt>
            <dd className="font-medium">{vars.country}</dd>
          </div>
        </dl>
        <p className="text-muted text-sm">{t.dataStoreAi}</p>
      </section>

      <section
        className="card border-danger space-y-3 border-2"
        aria-labelledby="danger-h"
      >
        <h2 id="danger-h" className="font-semibold">
          {t.dangerTitle}
        </h2>
        <p className="text-sm">{t.dangerWithdraw}</p>
        <DeleteAccount erasedRows={erasedRows} retainedRows={retainedRows} />
      </section>

      <form action={signOutAction}>
        <SubmitButton className="btn btn-secondary w-full md:w-auto">
          {t.authSignOut}
        </SubmitButton>
      </form>
    </div>
  );
}
