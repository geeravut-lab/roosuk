import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown } from "lucide-react";
import {
  deletePassportAction,
  revokePassportAction,
} from "@/app/actions/passport";
import { SubmitButton } from "@/components/SubmitButton";
import { PLANS } from "@/config/plans";
import { requireUser } from "@/lib/auth/server";
import { tierFor } from "@/lib/billing/entitlement.server";
import { featureEnabled } from "@/lib/flags/server";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { linkStatus } from "@/lib/passport/passport";
import { createClient } from "@/lib/supabase/server";
import { PassportForm } from "./PassportForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).passportTitle };
}

interface Row {
  id: string;
  label: string;
  sections: string[];
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
}

export default async function PassportPage({
  searchParams,
}: PageProps<"/passport">) {
  if (!(await featureEnabled("health_passport"))) notFound();
  const user = await requireUser();
  const { error, sections: sectionsParam } = await searchParams;
  const supabase = await createClient();
  const [t, lang, tier, { data }, wearablesOn, liverOn] = await Promise.all([
    getT(),
    getLang(),
    tierFor(user.id),
    supabase
      .from("health_passports")
      .select(
        "id, label, sections, expires_at, revoked_at, view_count, last_viewed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Row[]>(),
    featureEnabled("wearables"),
    featureEnabled("liver_check"),
  ]);
  const allowed = PLANS[tier].healthPassport;
  const now = new Date();
  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.passportTitle}
      </h1>
      <p>{t.passportIntro}</p>

      {typeof error === "string" && isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}

      {allowed ? (
        <PassportForm
          wearablesOn={wearablesOn}
          liverOn={liverOn}
          preselect={
            sectionsParam === "liver" && liverOn ? ["liver"] : undefined
          }
        />
      ) : (
        <section className="card space-y-2" aria-labelledby="pp-plan">
          <h2
            id="pp-plan"
            className="inline-flex items-center gap-2 font-semibold"
          >
            <Crown className="text-primary-strong size-5" aria-hidden />
            {t.passportPlanTitle}
          </h2>
          <p>{t.passportPlanBody}</p>
          <Link href="/subscription" className="btn btn-primary">
            {t.passportUpgrade}
          </Link>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="pp-links">
        <h2 id="pp-links" className="font-semibold">
          {t.passportLinks}
        </h2>
        {rows.length === 0 ? (
          <p className="text-muted">{t.passportNoLinks}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const status = linkStatus(r, now);
              return (
                <li key={r.id} className="card space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{r.label}</p>
                    <span className="bg-tint-primary rounded-full px-2.5 py-0.5 text-sm font-semibold">
                      {t[`passportStatus_${status}` as const]}
                    </span>
                  </div>
                  <p className="text-muted text-sm">
                    {fmt(t.passportExpiresOn, {
                      date: formatDateTime(lang, r.expires_at),
                    })}{" "}
                    · {fmt(t.passportViews, { n: r.view_count })}
                    {r.last_viewed_at
                      ? ` · ${fmt(t.passportLastViewed, { date: formatDateTime(lang, r.last_viewed_at) })}`
                      : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/passport/${r.id}`}
                      className="btn btn-secondary"
                    >
                      {t.passportPreview}
                    </Link>
                    {status === "active" ? (
                      <form action={revokePassportAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton className="btn btn-secondary">
                          {t.passportRevoke}
                        </SubmitButton>
                      </form>
                    ) : (
                      <form action={deletePassportAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton className="btn btn-secondary">
                          {t.passportDelete}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
