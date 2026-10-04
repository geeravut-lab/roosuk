import type { Metadata } from "next";
import { removeCreatorAction } from "@/app/actions/creator";
import { SubmitButton } from "@/components/SubmitButton";
import { isLineSyntheticEmail } from "@/lib/line/login";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreatorForm } from "./CreatorForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminCreatorsTitle };
}

export default async function AdminCreatorsPage() {
  const db = createAdminClient();
  const [t, { data: creators }] = await Promise.all([
    getT(),
    db
      .from("creators")
      .select("user_id, display_name")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const rows = await Promise.all(
    (creators ?? []).map(async (c) => {
      const [{ data: code }, { data: refs }, { data: u }] = await Promise.all([
        db
          .from("referral_codes")
          .select("code")
          .eq("user_id", c.user_id)
          .maybeSingle(),
        db
          .from("referrals")
          .select("qualified_at")
          .eq("referrer_id", c.user_id)
          .limit(100_000),
        db.auth.admin.getUserById(c.user_id),
      ]);
      const email = u.user?.email;
      return {
        ...c,
        code: code?.code ?? "—",
        email: email && !isLineSyntheticEmail(email) ? email : null,
        invited: refs?.length ?? 0,
        done: (refs ?? []).filter((r) => r.qualified_at).length,
      };
    }),
  );
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminCreatorsTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminCreatorsIntro}</p>
      </div>
      <section className="card space-y-3" aria-labelledby="cr-add">
        <h2 id="cr-add" className="font-semibold">
          {t.adminCreatorAdd}
        </h2>
        <CreatorForm />
      </section>
      {rows.length === 0 ? <p className="card">{t.adminCreatorNone}</p> : null}
      <ul className="space-y-3" aria-label={t.adminCreatorsTitle}>
        {rows.map((c) => (
          <li
            key={c.user_id}
            className="card flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-semibold">
                {c.display_name} ·{" "}
                <span className="font-mono tracking-widest">{c.code}</span>
              </p>
              <p className="text-muted text-sm break-all">{c.email ?? "—"}</p>
              <p className="text-sm">
                {fmt(t.adminCreatorStats, { invited: c.invited, done: c.done })}
              </p>
            </div>
            <form action={removeCreatorAction}>
              <input type="hidden" name="id" value={c.user_id} />
              <SubmitButton className="btn btn-secondary">
                {t.adminCreatorRemove}
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
