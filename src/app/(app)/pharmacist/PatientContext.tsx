import { LabStatusChip } from "@/components/LabStatusChip";
import { fmt, type Dict, type Lang } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { parseStoredSnapshot } from "@/lib/passport/passport";
import type { ConsultSnapshot } from "@/lib/telepharmacy/server";

/**
 * What the person agreed to share, as a COPY taken when they asked. Only the parts they
 * ticked exist in it; a part that is missing was not shared, and the page says so rather
 * than leaving the pharmacist to wonder.
 */
export function PatientContext({
  t,
  lang,
  snapshot,
  shared,
  intake,
}: {
  t: Dict;
  lang: Lang;
  snapshot: ConsultSnapshot | null;
  shared: string[];
  intake: { medicines?: string; allergies?: string };
}) {
  const health = snapshot?.health ? parseStoredSnapshot(snapshot.health) : null;
  const dash = "—";
  return (
    <section className="card space-y-4" aria-labelledby="ctx-h">
      <div className="space-y-1">
        <h2 id="ctx-h" className="font-semibold">
          {t.pharmContextTitle}
        </h2>
        <p className="text-muted text-sm">
          {snapshot
            ? fmt(t.pharmContextTaken, {
                when: formatDate(lang, snapshot.takenAt),
              })
            : t.pharmContextNone}
        </p>
      </div>

      <dl className="divide-line divide-y text-sm">
        <div className="py-1.5">
          <dt className="text-muted">{t.teleMedicines}</dt>
          <dd className="font-medium">{intake.medicines || dash}</dd>
        </div>
        <div className="py-1.5">
          <dt className="text-muted">{t.teleAllergies}</dt>
          <dd className="font-medium">{intake.allergies || dash}</dd>
        </div>
      </dl>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{t.pharmSharedTitle}</h3>
        <ul className="flex flex-wrap gap-2 text-xs">
          {(["profile", "labs", "history"] as const).map((k) => (
            <li
              key={k}
              className={`rounded-full px-2.5 py-0.5 font-semibold ${shared.includes(k) ? "bg-tint-secondary" : "bg-tint-warn"}`}
            >
              {t[`pharmShared_${k}` as const]}:{" "}
              {shared.includes(k) ? t.pharmSharedYes : t.pharmSharedNo}
            </li>
          ))}
        </ul>
      </div>

      {health?.profile ? (
        <dl className="divide-line divide-y text-sm">
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-muted">{t.passportAge}</dt>
            <dd className="font-medium">{health.profile.age ?? dash}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-muted">{t.profileSex}</dt>
            <dd className="font-medium">
              {health.profile.sex
                ? t[`sex_${health.profile.sex}` as keyof Dict]
                : dash}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-1.5">
            <dt className="text-muted">{t.passportConditions}</dt>
            <dd className="text-right font-medium">
              {health.profile.conditions
                .map((c) => t[`condition_${c}` as keyof Dict] ?? c)
                .join(", ") || dash}
            </dd>
          </div>
        </dl>
      ) : null}

      {health?.labs ? (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{t.passportSection_labs}</h3>
          {health.labs.length === 0 ? (
            <p className="text-muted text-sm">{t.passportNone}</p>
          ) : (
            <ul className="divide-line divide-y">
              {health.labs.map((l) => (
                <li
                  key={`${l.name}-${l.collectedOn}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{l.name}</span>{" "}
                    <span className="text-muted">
                      {formatDate(lang, l.collectedOn)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">
                      {l.value} {l.unit}
                    </span>
                    <LabStatusChip t={t} status={l.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {snapshot && snapshot.history.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t.teleShareHistory}</h3>
          <ul className="space-y-2 text-sm">
            {snapshot.history.map((h) => (
              <li key={h.at} className="border-line rounded-xl border p-3">
                <p className="font-medium">
                  {formatDate(lang, h.at)} ·{" "}
                  {fmt(t.teleWith, { name: h.pharmacist })}
                </p>
                <p className="whitespace-pre-wrap">{h.advice}</p>
                {h.products.length ? (
                  <p className="text-muted">{h.products.join(", ")}</p>
                ) : null}
                {h.followUpOutcome ? (
                  <p className="text-muted">
                    {fmt(t.teleFollowUpOutcome, { text: h.followUpOutcome })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
