import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CopyButton } from "@/components/CopyButton";
import { requireUser } from "@/lib/auth/server";
import { shareMessages } from "@/lib/creator/creator";
import { featureEnabled } from "@/lib/flags/server";
import { getOrigin } from "@/lib/http/origin";
import { getLang, getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).creatorTitle };
}

export default async function CreatorPage() {
  if (!(await featureEnabled("creator"))) notFound();
  const user = await requireUser();
  const db = createAdminClient();
  const { data: creator } = await db
    .from("creators")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator) notFound(); // the page exists only for people the admin made creators
  const [t, lang, origin, { data: code }, { data: refs }, { data: ledger }] =
    await Promise.all([
      getT(),
      getLang(),
      getOrigin(),
      db.from("referral_codes").select("code").eq("user_id", user.id).single(),
      db
        .from("referrals")
        .select("qualified_at")
        .eq("referrer_id", user.id)
        .limit(100_000),
      db
        .from("reward_ledger")
        .select("amount_thb")
        .eq("user_id", user.id)
        .eq("kind", "referral_reward")
        .limit(100_000),
    ]);
  const link = `${origin}/r/${code!.code}`;
  const qr = await QRCode.toString(link, {
    type: "svg",
    margin: 1,
    width: 192,
    color: { dark: "#1F2A30", light: "#FFFFFF" },
  });
  const invited = refs?.length ?? 0;
  const done = (refs ?? []).filter((r) => r.qualified_at).length;
  const earned = (ledger ?? []).reduce((n, r) => n + r.amount_thb, 0);
  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.creatorTitle}
      </h1>
      <p>{t.creatorIntro}</p>

      <section className="card space-y-3" aria-labelledby="cr-link">
        <h2 id="cr-link" className="font-semibold">
          {t.creatorYourLink}
        </h2>
        <p className="text-muted text-sm">
          {creator.display_name} · {t.creatorYourCode}
        </p>
        <p
          className="text-primary-strong text-3xl font-bold tracking-widest select-all"
          data-testid="creator-code"
        >
          {code!.code}
        </p>
        <p className="bg-surface border-field-border rounded-xl border px-3 py-2 text-sm break-all select-all">
          {link}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton text={link} />
        </div>
        <div
          className="mx-auto size-48 rounded-xl bg-white p-1 [&>svg]:size-full"
          role="img"
          aria-label={t.creatorQrAlt}
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      </section>

      <section className="card space-y-1" aria-labelledby="cr-num">
        <h2 id="cr-num" className="font-semibold">
          {t.creatorNumbers}
        </h2>
        <dl className="divide-line divide-y text-sm">
          <div className="flex justify-between py-1.5">
            <dt>{t.creatorInvited}</dt>
            <dd className="font-medium" data-testid="cr-invited">
              {invited}
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt>{t.creatorQualified}</dt>
            <dd className="font-medium" data-testid="cr-qualified">
              {done}
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt>{t.creatorEarned}</dt>
            <dd className="font-medium">฿{earned.toLocaleString("en-US")}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3" aria-labelledby="cr-share">
        <h2 id="cr-share" className="font-semibold">
          {t.creatorShareTitle}
        </h2>
        <ul className="space-y-3">
          {shareMessages(lang, link).map((m) => (
            <li key={m.key} className="card space-y-2">
              <p className="text-muted text-sm font-semibold">
                {t[`creatorShare_${m.key}` as const]}
              </p>
              <p className="text-sm whitespace-pre-wrap">{m.text}</p>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton text={m.text} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-muted text-sm">{t.creatorRules}</p>
    </div>
  );
}
