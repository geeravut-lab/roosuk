import type { Metadata } from "next";
import { CircleCheck, CircleOff } from "lucide-react";
import { setFeatureFlagAction } from "@/app/actions/admin";
import { FEATURE_FLAGS, isEnabled } from "@/lib/flags/flags";
import { getFlags } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { invalidatePlatformSettingsCache } from "@/lib/settings/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminFlagsTitle };
}

export default async function FlagsPage() {
  // Admins just changed something: show the truth, not a 30-second-old copy.
  invalidatePlatformSettingsCache();
  const [t, flags] = await Promise.all([getT(), getFlags()]);

  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.adminFlagsTitle}
      </h1>
      <p className="text-muted text-sm">{t.adminFlagsHint}</p>
      <ul className="space-y-3">
        {FEATURE_FLAGS.map((flag) => {
          const on = isEnabled(flags, flag);
          return (
            <li
              key={flag}
              className="card flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">{t[`flag_${flag}` as const]}</p>
                <p className="text-muted mt-0.5 inline-flex items-center gap-1 text-sm">
                  {on ? (
                    <CircleCheck
                      className="text-primary-strong size-4"
                      aria-hidden
                    />
                  ) : (
                    <CircleOff className="size-4" aria-hidden />
                  )}
                  {on ? t.adminFlagOn : t.adminFlagOff}
                </p>
              </div>
              <form action={setFeatureFlagAction}>
                <input type="hidden" name="flag" value={flag} />
                <input type="hidden" name="enabled" value={String(!on)} />
                <button type="submit" className="btn btn-secondary">
                  {on ? t.adminFlagToggleOff : t.adminFlagToggleOn}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
