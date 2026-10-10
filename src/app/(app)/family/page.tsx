import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, UsersRound } from "lucide-react";
import {
  acceptFamilyInviteAction,
  cancelFamilyInviteAction,
  createFamilyInviteAction,
  endFamilyLinkAction,
  setFamilySharesAction,
} from "@/app/actions/family";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { planSpec } from "@/lib/billing/specs.server";
import { requireUser } from "@/lib/auth/server";
import { tierFor } from "@/lib/billing/entitlement.server";
import { FAMILY_SCOPES, cleanInviteCode } from "@/lib/family/family";
import { loadFamily, loadSharedWithMe } from "@/lib/family/server";
import { featureEnabled } from "@/lib/flags/server";
import { getOrigin } from "@/lib/http/origin";
import { errorText, fmt, isErrorKey, type Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navFamily };
}

export default async function FamilyPage({
  searchParams,
}: PageProps<"/family">) {
  if (!(await featureEnabled("family"))) notFound();
  const user = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const error = one(sp.error);
  const typedCode = cleanInviteCode(one(sp.code)) ?? "";
  const [t, lang, tier, state, origin] = await Promise.all([
    getT(),
    getLang(),
    tierFor(user.id),
    loadFamily(user.id),
    getOrigin(),
  ]);
  const shared = await loadSharedWithMe(state);
  const canInvite =
    (await planSpec(tier)).familyMembers >= 1 && state.role !== "member";
  const other = state.other;
  const who = other?.name ?? other?.email ?? t.familyPerson;

  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.familyTitle}
      </h1>
      <p>{t.familyIntro}</p>

      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="border-field-border bg-surface rounded-xl border px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}
      {[
        [sp.joined, t.familyJoined],
        [sp.left, t.familyLeft],
        [sp.saved, t.familySaved],
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

      {state.role === "none" ? (
        <>
          {canInvite ? (
            <section className="card space-y-3" aria-labelledby="fam-inv">
              <h2
                id="fam-inv"
                className="inline-flex items-center gap-2 font-semibold"
              >
                <UsersRound
                  className="text-primary-strong size-5"
                  aria-hidden
                />
                {t.familyInviteTitle}
              </h2>
              <p className="text-sm">{t.familyInviteBody}</p>
              {state.invite ? (
                <div className="space-y-2">
                  <p className="text-muted text-sm">{t.familyInviteCode}</p>
                  <p
                    className="text-primary-strong text-3xl font-bold tracking-widest select-all"
                    data-testid="family-code"
                  >
                    {state.invite.code}
                  </p>
                  <p className="text-sm">{t.familyInviteLink}</p>
                  <p className="bg-surface border-field-border rounded-xl border px-3 py-2 text-sm break-all select-all">
                    {`${origin}/family?code=${state.invite.code}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton
                      text={`${origin}/family?code=${state.invite.code}`}
                    />
                    <form action={cancelFamilyInviteAction}>
                      <SubmitButton className="btn btn-secondary">
                        {t.familyInviteCancel}
                      </SubmitButton>
                    </form>
                  </div>
                  <p className="text-muted text-sm">
                    {fmt(t.familyInviteUntil, {
                      date: formatDate(lang, state.invite.expiresAt),
                    })}
                  </p>
                </div>
              ) : null}
              <form action={createFamilyInviteAction}>
                <SubmitButton
                  className={
                    state.invite ? "btn btn-secondary" : "btn btn-primary"
                  }
                >
                  {state.invite ? t.familyInviteNew : t.familyInviteMake}
                </SubmitButton>
              </form>
              <p className="text-muted text-sm">{t.familyPaidNote}</p>
            </section>
          ) : (
            <section className="card space-y-2" aria-labelledby="fam-plan">
              <h2
                id="fam-plan"
                className="inline-flex items-center gap-2 font-semibold"
              >
                <Crown className="text-primary-strong size-5" aria-hidden />
                {t.familyPlanTitle}
              </h2>
              <p>{t.familyPlanBody}</p>
              <Link href="/subscription" className="btn btn-secondary">
                {t.passportUpgrade}
              </Link>
            </section>
          )}

          <section className="card space-y-3" aria-labelledby="fam-join">
            <h2 id="fam-join" className="font-semibold">
              {t.familyJoinTitle}
            </h2>
            <form action={acceptFamilyInviteAction} className="space-y-3">
              <div>
                <label htmlFor="fam-code" className="label">
                  {t.familyJoinField}
                </label>
                <input
                  id="fam-code"
                  name="code"
                  required
                  maxLength={80}
                  defaultValue={typedCode}
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="field tracking-widest uppercase"
                />
              </div>
              <SubmitButton className="btn btn-primary w-full">
                {t.familyJoinBtn}
              </SubmitButton>
              <p className="text-muted text-sm">{t.familyJoinNote}</p>
            </form>
          </section>
        </>
      ) : (
        <>
          <section className="card space-y-3" aria-labelledby="fam-link">
            <h2 id="fam-link" className="font-semibold">
              {state.role === "owner" ? t.familyOwnerOf : t.familyMemberOf}
            </h2>
            <p className="text-lg font-bold">{who}</p>
            {other?.name && other.email ? (
              <p className="text-muted text-sm">{other.email}</p>
            ) : null}
            <p className="text-muted text-sm">
              {fmt(t.familySince, { date: formatDate(lang, other!.since) })}
            </p>
            {state.role === "owner" ? (
              <p className="text-sm">{t.familyPaidNote}</p>
            ) : null}
            <form action={endFamilyLinkAction}>
              <input type="hidden" name="other" value={other!.id} />
              <SubmitButton className="btn btn-secondary">
                {state.role === "owner" ? t.familyRemove : t.familyLeave}
              </SubmitButton>
            </form>
            <p className="text-muted text-sm">{t.familyEndNote}</p>
          </section>

          <section className="card space-y-3" aria-labelledby="fam-share">
            <h2 id="fam-share" className="font-semibold">
              {t.familyShareTitle}
            </h2>
            <p className="text-sm">{t.familyShareIntro}</p>
            <form action={setFamilySharesAction} className="space-y-3">
              {FAMILY_SCOPES.map((s) => (
                <label key={s} className="flex min-h-11 items-start gap-3">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={s}
                    defaultChecked={state.iShare.includes(s)}
                    className="mt-1 size-5"
                  />
                  <span className="text-sm">
                    {t[`familyScope_${s}` as keyof Dict]}
                  </span>
                </label>
              ))}
              <p className="text-muted text-sm">{t.familyShareNever}</p>
              <label className="flex min-h-11 items-start gap-3">
                <input type="checkbox" name="ack" className="mt-1 size-5" />
                <span className="text-sm">{t.familyShareAck}</span>
              </label>
              <SubmitButton className="btn btn-primary w-full">
                {t.familyShareSave}
              </SubmitButton>
            </form>
          </section>

          <section className="card space-y-2" aria-labelledby="fam-theirs">
            <h2 id="fam-theirs" className="font-semibold">
              {t.familyTheirsTitle}
            </h2>
            {!shared ? (
              <p className="text-muted text-sm">{t.familyTheirsNone}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {shared.checkin ? (
                  <li>
                    <p className="font-medium">
                      {shared.checkin.checkedToday
                        ? t.familyTheirsCheckinToday
                        : t.familyTheirsCheckinNot}
                    </p>
                    <p className="text-muted">
                      {fmt(t.familyTheirsStreak, {
                        n: shared.checkin.streak,
                        d: shared.checkin.daysLast7,
                      })}
                    </p>
                  </li>
                ) : null}
                {shared.score ? (
                  <li>
                    <p className="font-medium">
                      {shared.score.overall === null
                        ? t.familyTheirsScoreNone
                        : fmt(t.familyTheirsScore, { n: shared.score.overall })}
                    </p>
                    {shared.score.focus ? (
                      <p className="text-muted">
                        {fmt(t.familyTheirsFocus, {
                          area: t[`cat_${shared.score.focus}` as keyof Dict],
                        })}
                      </p>
                    ) : null}
                  </li>
                ) : null}
              </ul>
            )}
            <p className="text-muted text-xs">{t.familyTheirsNote}</p>
          </section>
        </>
      )}
    </div>
  );
}
