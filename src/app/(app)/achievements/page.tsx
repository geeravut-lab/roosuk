import type { Metadata } from "next";
import { Award, Lock } from "lucide-react";
import {
  ACHIEVEMENTS,
  GROUPS,
  descKey,
  isNew,
  nameKey,
  progress,
} from "@/lib/achievements/achievements";
import { loadAchievements } from "@/lib/achievements/server";
import { requireUser } from "@/lib/auth/server";
import { bangkokDate } from "@/lib/health/dates";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).achievementsTitle };
}

export default async function AchievementsPage() {
  const user = await requireUser();
  const today = bangkokDate(new Date());
  const [t, lang, view] = await Promise.all([
    getT(),
    getLang(),
    loadAchievements(user.id, today),
  ]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.achievementsTitle}
        </h1>
        <p className="text-muted text-sm">{t.achievementsIntro}</p>
        <p className="font-semibold">
          {fmt(t.achievementsCount, {
            n: view.earned.size,
            total: ACHIEVEMENTS.length,
          })}
        </p>
      </div>

      {GROUPS.map((group) => (
        <section
          key={group}
          className="space-y-3"
          aria-labelledby={`g-${group}`}
        >
          <h2 id={`g-${group}`} className="font-semibold">
            {t[`achievementsGroup_${group}` as keyof Dict]}
          </h2>
          <ul className="space-y-2">
            {ACHIEVEMENTS.filter((a) => a.group === group).map((a) => {
              const on = view.earned.get(a.key);
              const prog = on ? null : progress(a, view.stats);
              return (
                <li key={a.key} className="card flex items-start gap-3">
                  <span
                    className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
                      on
                        ? "bg-tint-secondary"
                        : "bg-surface border-line border-2"
                    }`}
                  >
                    {on ? (
                      <Award
                        className="text-primary-strong size-6"
                        aria-hidden
                      />
                    ) : (
                      <Lock className="text-muted size-5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {t[nameKey(a.key)]}
                      {on && isNew(on, today) ? (
                        <span className="bg-coral text-foreground ml-2 rounded-full px-2 py-0.5 text-xs font-semibold">
                          {t.achievementsNew}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted text-sm">{t[descKey(a.key)]}</p>
                    {on ? (
                      <p className="text-primary-strong text-sm font-medium">
                        {fmt(t.achievementsEarnedOn, {
                          date: formatDate(lang, on),
                        })}
                      </p>
                    ) : prog ? (
                      <div className="mt-1 space-y-1">
                        <progress
                          className="h-2 w-full"
                          value={prog.have}
                          max={prog.need}
                          aria-label={t[nameKey(a.key)] as string}
                        />
                        <p className="text-muted text-xs">
                          {fmt(t.achievementsProgress, prog)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
