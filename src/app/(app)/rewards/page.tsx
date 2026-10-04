import type { Metadata } from "next";
import Link from "next/link";
import { Gift, Megaphone } from "lucide-react";
import { applyReferralCodeAction } from "@/app/actions/rewards";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import { fmt } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { getOrigin } from "@/lib/http/origin";
import { loadWallet } from "@/lib/rewards/server";
import { featureEnabled } from "@/lib/flags/server";
import { loadPlatformSettings } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).rewardsTitle };
}

const CODE_NOTES = ["ok", "invalid", "self", "already", "too_late"] as const;

export default async function RewardsPage({
  searchParams,
}: PageProps<"/rewards">) {
  const sp = await searchParams;
  const user = await requireUser();
  const [t, lang, { rewards }, wallet, origin] = await Promise.all([
    getT(),
    getLang(),
    loadPlatformSettings(),
    loadWallet(user.id),
    getOrigin(),
  ]);
  const link = `${origin}/r/${wallet.code}`;
  // people the admin made creators get a link to their toolkit
  const isCreator =
    (await featureEnabled("creator")) &&
    !!(
      await createAdminClient()
        .from("creators")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()
    ).data;
  const note = CODE_NOTES.find((n) => n === sp.code);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.rewardsTitle}
        </h1>
        <p className="text-muted text-sm">{t.rewardsIntro}</p>
      </div>

      {isCreator ? (
        <Link
          href="/creator"
          className="card hover:bg-tint-primary flex items-center gap-3"
        >
          <Megaphone className="text-primary-strong size-6" aria-hidden />
          <span className="font-semibold">{t.creatorLink}</span>
        </Link>
      ) : null}

      {note ? (
        <p
          role={note === "ok" ? "status" : "alert"}
          className={`${note === "ok" ? "bg-tint-secondary" : "bg-tint-warn"} rounded-xl px-3 py-2 text-sm font-medium`}
        >
          {t[`rewardsCode_${note}` as const]}
        </p>
      ) : null}

      <section className="card space-y-1" aria-labelledby="bal-h">
        <h2 id="bal-h" className="text-muted text-sm font-semibold">
          {t.rewardsBalance}
        </h2>
        <p className="text-primary-strong flex items-center gap-2 text-3xl font-bold">
          <Gift className="size-7" aria-hidden />฿
          {wallet.balance.toLocaleString("en-US")}
        </p>
        <ul className="text-muted list-disc space-y-1 pl-5 text-sm">
          <li>
            {fmt(t.rewardsUseSubscription, {
              n: rewards.redeemMaxSubscriptionThb,
            })}
          </li>
          <li>{fmt(t.rewardsUseOther, { n: rewards.redeemMaxOtherThb })}</li>
        </ul>
      </section>

      <section className="card space-y-3" aria-labelledby="inv-h">
        <h2 id="inv-h" className="font-semibold">
          {t.rewardsInviteTitle}
        </h2>
        <p className="text-sm">
          {fmt(t.rewardsInviteBody, {
            n: rewards.referralThb,
            days: rewards.referralMinCheckinDays,
          })}
          {rewards.refereeThb > 0
            ? ` ${fmt(t.rewardsInviteFriendGets, { n: rewards.refereeThb })}`
            : ""}
        </p>
        <p className="bg-tint-primary rounded-xl px-3 py-2 text-center text-xl font-bold tracking-widest">
          <span className="sr-only">{t.rewardsYourCode}: </span>
          {wallet.code}
        </p>
        <p className="text-muted text-sm break-all select-all">{link}</p>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={link} />
        </div>
        <p className="text-sm font-medium">
          {fmt(t.rewardsInviteStats, {
            invited: wallet.invited,
            done: wallet.qualified,
          })}
        </p>
      </section>

      {!wallet.referred ? (
        <section className="card space-y-2" aria-labelledby="code-h">
          <h2 id="code-h" className="font-semibold">
            {t.rewardsHaveCode}
          </h2>
          <form action={applyReferralCodeAction} className="flex gap-2">
            <label htmlFor="ref-code" className="sr-only">
              {t.rewardsCodeLabel}
            </label>
            <input
              id="ref-code"
              name="code"
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              className="field uppercase"
            />
            <SubmitButton className="btn btn-primary">
              {t.rewardsApplyCode}
            </SubmitButton>
          </form>
          <p className="text-muted text-xs">{t.rewardsCodeHint}</p>
        </section>
      ) : null}

      <section className="space-y-2" aria-labelledby="hist-h">
        <h2 id="hist-h" className="font-semibold">
          {t.rewardsHistory}
        </h2>
        {wallet.ledger.length === 0 ? (
          <p className="card text-sm">{t.rewardsHistoryNone}</p>
        ) : (
          <ul className="space-y-2">
            {wallet.ledger.map((r) => (
              <li
                key={r.id}
                className="card flex items-center justify-between gap-3"
              >
                <span>
                  <span className="block font-medium">
                    {t[`rewardsKind_${r.kind}` as const]}
                  </span>
                  <span className="text-muted block text-sm">
                    {formatDate(lang, r.created_at)}
                  </span>
                </span>
                <span
                  className={`font-bold ${r.amount_thb > 0 ? "text-primary-strong" : ""}`}
                >
                  {r.amount_thb > 0 ? "+" : "−"}฿{Math.abs(r.amount_thb)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
