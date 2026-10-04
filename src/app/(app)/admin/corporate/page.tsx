import type { Metadata } from "next";
import { deleteCompanyAction } from "@/app/actions/corporate";
import { SubmitButton } from "@/components/SubmitButton";
import { loadGroupStats } from "@/lib/corporate/server";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CompanyForm } from "./CompanyForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminCorpTitle };
}

interface Row {
  id: string;
  name: string;
  code: string;
  seats: number;
  tier: "gold" | "premium";
  valid_until: string;
  note: string | null;
  active: boolean;
}

export default async function AdminCorporatePage() {
  const [t, { data }] = await Promise.all([
    getT(),
    createAdminClient()
      .from("companies")
      .select("id, name, code, seats, tier, valid_until, note, active")
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<Row[]>(),
  ]);
  const rows = data ?? [];
  const groups = await Promise.all(rows.map((c) => loadGroupStats(c.id)));
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminCorpTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminCorpIntro}</p>
      </div>
      <section className="card space-y-3" aria-labelledby="corp-new">
        <h2 id="corp-new" className="font-semibold">
          {t.adminCorpNew}
        </h2>
        <CompanyForm />
      </section>
      {rows.length === 0 ? <p className="card">{t.adminCorpNone}</p> : null}
      <ul className="space-y-4" aria-label={t.adminCorpTitle}>
        {rows.map((c, i) => {
          const g = groups[i];
          return (
            <li key={c.id} className="card space-y-3">
              <p
                className="font-mono text-lg font-bold tracking-widest"
                data-testid={`code-${c.name}`}
              >
                {fmt(t.adminCorpCode, { code: c.code })}
              </p>
              <p className="text-sm">
                {fmt(t.adminCorpUsed, {
                  used: g.used,
                  seats: c.seats,
                  opted: g.opted,
                })}
              </p>
              {g.stats ? (
                <p className="text-sm font-medium">
                  {fmt(t.adminCorpStats, {
                    active: g.stats.activePercent,
                    score: g.stats.avgScore ?? "—",
                  })}
                </p>
              ) : (
                <p className="text-muted text-sm">{t.adminCorpTooSmall}</p>
              )}
              <CompanyForm company={c} />
              <form action={deleteCompanyAction}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton className="btn btn-secondary">
                  {t.adminCorpDelete}
                </SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
