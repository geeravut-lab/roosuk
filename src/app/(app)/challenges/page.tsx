import type { Metadata } from "next";
import { Trophy, Users } from "lucide-react";
import {
  joinChallengeAction,
  startChallengeAction,
} from "@/app/actions/challenges";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth/server";
import {
  CHALLENGE_TEMPLATES,
  TEMPLATE_KEYS,
  daysLeft,
  joinPath,
  progressPercent,
} from "@/lib/challenges/challenges";
import {
  bangkokToday,
  loadChallenges,
  type ChallengeView,
} from "@/lib/challenges/server";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { getOrigin } from "@/lib/http/origin";
import { normalizeReferralCode } from "@/lib/rewards/rewards";
import { loadPlatformSettings } from "@/lib/settings/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).challengesTitle };
}

const NOTES = [
  "started",
  "invalid",
  "failed",
  "too_many",
  "duplicate",
  "joined",
  "join_invalid",
  "join_already",
  "join_late",
  "join_full",
  "join_too_many",
] as const;
const GOOD = new Set(["started", "joined"]);

function Progress({ t, c }: { t: Dict; c: ChallengeView }) {
  const unit = t[`challengeUnit_${c.metric}` as keyof Dict] as string;
  return (
    <div className="space-y-1">
      <progress
        className="h-2 w-full"
        value={c.mine}
        max={c.target}
        aria-label={t[`challenge_${c.template}_name` as keyof Dict] as string}
      />
      <p className="text-sm font-medium">
        {fmt(t.challengeYou, {
          have: Math.min(c.mine, c.target),
          target: c.target,
          unit,
        })}{" "}
        <span className="text-muted">
          ({progressPercent(c.mine, c.target)}%)
        </span>
      </p>
    </div>
  );
}

export default async function ChallengesPage({
  searchParams,
}: PageProps<"/challenges">) {
  const sp = await searchParams;
  const user = await requireUser();
  const today = bangkokToday();
  const [t, lang, { rewards }, list, origin] = await Promise.all([
    getT(),
    getLang(),
    loadPlatformSettings(),
    loadChallenges(user.id, today),
    getOrigin(),
  ]);
  const note = NOTES.find((n) => n === sp.note);
  const joinCode =
    normalizeReferralCode(typeof sp.join === "string" ? sp.join : "") ?? "";
  const active = list.filter((c) => c.phase === "active");
  const past = list.filter((c) => c.phase !== "active");
  const openTemplates = new Set(active.map((c) => c.template));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.challengesTitle}
        </h1>
        <p className="text-muted text-sm">
          {fmt(t.challengesIntro, { n: rewards.challengeThb })}
        </p>
      </div>

      {note ? (
        <p
          role={GOOD.has(note) ? "status" : "alert"}
          className={`${GOOD.has(note) ? "bg-tint-secondary" : "bg-tint-warn"} rounded-xl px-3 py-2 text-sm font-medium`}
        >
          {t[`challengeNote_${note}` as keyof Dict] as string}
        </p>
      ) : null}

      <section className="space-y-3" aria-labelledby="act-h">
        <h2 id="act-h" className="font-semibold">
          {t.challengesActive}
        </h2>
        {active.length === 0 ? (
          <p className="card text-sm">{t.challengesNone}</p>
        ) : (
          <ul className="space-y-3">
            {active.map((c) => (
              <li key={c.id} className="card space-y-3">
                <div className="flex items-start gap-3">
                  {c.mode === "friend" ? (
                    <Users
                      className="text-primary-strong mt-0.5 size-5 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <Trophy
                      className="text-primary-strong mt-0.5 size-5 shrink-0"
                      aria-hidden
                    />
                  )}
                  <div>
                    <h3 className="font-semibold">
                      {
                        t[
                          `challenge_${c.template}_name` as keyof Dict
                        ] as string
                      }
                    </h3>
                    <p className="text-muted text-sm">
                      {fmt(t.challengeDaysLeft, {
                        n: daysLeft(c.endsOn, today),
                        date: formatDate(lang, c.endsOn),
                      })}
                    </p>
                  </div>
                </div>
                <Progress t={t} c={c} />
                {c.mode === "friend" ? (
                  c.friend ? (
                    <p className="bg-tint-primary rounded-xl px-3 py-2 text-sm">
                      {fmt(t.challengeFriend, {
                        name: c.friend.name ?? t.challengeFriendFallback,
                        have: Math.min(c.friend.have, c.target),
                        target: c.target,
                      })}
                      {c.friend.completed ? ` ${t.challengeFriendDone}` : ""}
                    </p>
                  ) : c.inviteCode ? (
                    <div className="bg-tint-primary space-y-2 rounded-xl p-3">
                      <p className="text-sm">{t.challengeInviteHint}</p>
                      <p className="text-center text-xl font-bold tracking-widest">
                        <span className="sr-only">{t.challengeCode}: </span>
                        {c.inviteCode}
                      </p>
                      <p className="text-muted text-sm break-all select-all">{`${origin}${joinPath(c.inviteCode)}`}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <CopyButton
                          text={`${origin}${joinPath(c.inviteCode)}`}
                        />
                      </div>
                    </div>
                  ) : null
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="new-h">
        <h2 id="new-h" className="font-semibold">
          {t.challengesStart}
        </h2>
        <ul className="space-y-3">
          {TEMPLATE_KEYS.map((key) => (
            <li key={key} className="card space-y-2">
              <h3 className="font-semibold">
                {t[`challenge_${key}_name` as keyof Dict] as string}
              </h3>
              <p className="text-muted text-sm">
                {t[`challenge_${key}_desc` as keyof Dict] as string}
              </p>
              <p className="text-sm">
                {fmt(t.challengeDuration, {
                  days: CHALLENGE_TEMPLATES[key].days,
                })}
              </p>
              {openTemplates.has(key) ? (
                <p className="text-sm font-medium">{t.challengeAlreadyOpen}</p>
              ) : (
                <form
                  action={startChallengeAction}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <input type="hidden" name="template" value={key} />
                  <SubmitButton
                    name="mode"
                    value="solo"
                    className="btn btn-primary"
                  >
                    {t.challengeSolo}
                  </SubmitButton>
                  <SubmitButton
                    name="mode"
                    value="friend"
                    className="btn btn-secondary"
                  >
                    {t.challengeWithFriend}
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-2" aria-labelledby="join-h">
        <h2 id="join-h" className="font-semibold">
          {t.challengesJoin}
        </h2>
        <form action={joinChallengeAction} className="flex gap-2">
          <label htmlFor="join-code" className="sr-only">
            {t.challengeCodeLabel}
          </label>
          <input
            id="join-code"
            name="code"
            defaultValue={joinCode}
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            className="field uppercase"
          />
          <SubmitButton className="btn btn-primary">
            {t.challengeJoinBtn}
          </SubmitButton>
        </form>
        <p className="text-muted text-xs">{t.challengeJoinHint}</p>
      </section>

      {past.length > 0 ? (
        <section className="space-y-2" aria-labelledby="past-h">
          <h2 id="past-h" className="font-semibold">
            {t.challengesPast}
          </h2>
          <ul className="space-y-2">
            {past.map((c) => (
              <li
                key={c.id}
                className="card flex items-center justify-between gap-3"
              >
                <span>
                  <span className="block font-medium">
                    {t[`challenge_${c.template}_name` as keyof Dict] as string}
                  </span>
                  <span className="text-muted block text-sm">
                    {formatDate(lang, c.startsOn)} –{" "}
                    {formatDate(lang, c.endsOn)}
                  </span>
                </span>
                <span className="text-sm font-semibold">
                  {c.phase === "done"
                    ? t.challengeDone
                    : fmt(t.challengeEnded, {
                        have: Math.min(c.mine, c.target),
                        target: c.target,
                      })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
