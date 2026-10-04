import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  joinCompanyAction,
  leaveCompanyAction,
  setCompanyStatsAction,
} from "@/app/actions/corporate";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import { loadMembership } from "@/lib/corporate/server";
import { featureEnabled } from "@/lib/flags/server";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navCompany };
}

export default async function CompanyPage({
  searchParams,
}: PageProps<"/company">) {
  if (!(await featureEnabled("corporate"))) notFound();
  const user = await requireUser();
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const [t, lang, m] = await Promise.all([
    getT(),
    getLang(),
    loadMembership(user.id),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.companyTitle}
      </h1>
      <p>{t.companyIntro}</p>
      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}
      {[
        [sp.joined, t.companyJoined],
        [sp.left, t.companyLeft],
        [sp.saved, t.companySaved],
      ].map(([flag, text]) =>
        flag ? (
          <p
            key={String(text)}
            role="status"
            className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
          >
            {text as string}
          </p>
        ) : null,
      )}

      {!m ? (
        <section className="card space-y-3" aria-labelledby="co-join">
          <h2
            id="co-join"
            className="inline-flex items-center gap-2 font-semibold"
          >
            <Building2 className="text-primary-strong size-5" aria-hidden />
            {t.companyJoinTitle}
          </h2>
          <form action={joinCompanyAction} className="space-y-3">
            <div>
              <label htmlFor="co-code" className="label">
                {t.companyJoinField}
              </label>
              <input
                id="co-code"
                name="code"
                required
                maxLength={20}
                autoComplete="off"
                autoCapitalize="characters"
                className="field tracking-widest uppercase"
              />
            </div>
            <SubmitButton className="btn btn-primary w-full">
              {t.companyJoinBtn}
            </SubmitButton>
          </form>
        </section>
      ) : (
        <>
          <section className="card space-y-2" aria-labelledby="co-yours">
            <h2 id="co-yours" className="font-semibold">
              {t.companyYours}
            </h2>
            <p className="text-lg font-bold">{m.company.name}</p>
            <p className="text-sm">
              {fmt(t.companyPlan, {
                plan: t[`planName_${m.company.tier}` as const],
                date: formatDate(lang, m.company.validUntil),
              })}
            </p>
            {!m.live ? (
              <p className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
                {t.companyInactiveNow}
              </p>
            ) : null}
            <form action={leaveCompanyAction}>
              <SubmitButton className="btn btn-secondary">
                {t.companyLeave}
              </SubmitButton>
            </form>
            <p className="text-muted text-sm">{t.companyLeaveNote}</p>
          </section>

          <section className="card space-y-3" aria-labelledby="co-stats">
            <h2 id="co-stats" className="font-semibold">
              {t.companyStatsTitle}
            </h2>
            <p className="text-sm">{t.companyStatsBody}</p>
            <p className="text-sm font-medium">
              {m.shareStats ? t.companyStatsOn : t.companyStatsOff}
            </p>
            <form action={setCompanyStatsAction} className="space-y-3">
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  name="share"
                  defaultChecked={m.shareStats}
                  className="mt-1 size-5"
                />
                <span className="text-sm">{t.companyStatsAck}</span>
              </label>
              <SubmitButton className="btn btn-primary">
                {t.companyStatsSave}
              </SubmitButton>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
