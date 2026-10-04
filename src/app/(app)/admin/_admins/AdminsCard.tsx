import { ShieldCheck } from "lucide-react";
import { revokeAdminAction } from "@/app/actions/admins";
import { SubmitButton } from "@/components/SubmitButton";
import { describeAdmins } from "@/lib/admin/admins";
import { errorText, fmt, isErrorKey } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GrantAdminForm } from "./GrantAdminForm";

/** Who is an admin, with the buttons to remove others and the form to add someone. */
export async function AdminsCard({
  selfId,
  error,
  revoked,
}: {
  selfId: string;
  error?: string;
  revoked: boolean;
}) {
  const db = createAdminClient();
  const [t, lang, { data }] = await Promise.all([
    getT(),
    getLang(),
    db.from("admins").select("user_id, created_at").limit(200),
  ]);
  const rows = await Promise.all(
    (data ?? []).map(async (r: { user_id: string; created_at: string }) => {
      const { data: u } = await db.auth.admin.getUserById(r.user_id);
      const meta = u.user?.user_metadata as { full_name?: string } | undefined;
      return { ...r, email: u.user?.email, name: meta?.full_name };
    }),
  );
  const admins = describeAdmins(rows, selfId);

  return (
    <section id="admins" className="card space-y-4" aria-labelledby="admins-h">
      <h2
        id="admins-h"
        className="inline-flex items-center gap-2 font-semibold"
      >
        <ShieldCheck className="text-primary-strong size-6" aria-hidden />
        {t.adminAdminsTitle}
      </h2>
      <p className="text-muted text-sm">{t.adminAdminsIntro}</p>

      {error && isErrorKey(error) ? (
        <p
          role="alert"
          className="bg-tint-warn rounded-xl px-3 py-2 text-sm font-medium"
        >
          {errorText(error, t)}
        </p>
      ) : null}
      {revoked ? (
        <p
          role="status"
          className="bg-tint-secondary rounded-xl px-3 py-2 text-sm font-medium"
        >
          {t.adminAdminsRevoked}
        </p>
      ) : null}

      <ul className="divide-line divide-y" aria-label={t.adminAdminsTitle}>
        {admins.map((a) => {
          const who = a.email ?? a.displayName ?? a.id.slice(0, 8);
          return (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium break-all">
                  {a.email ?? t.adminAdminsNoEmail}
                  {a.displayName ? (
                    <span className="text-muted font-normal">
                      {" "}
                      · {a.displayName}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted text-sm">
                  {fmt(t.adminAdminsSince, { date: formatDate(lang, a.since) })}
                  {a.isSelf ? ` · ${t.adminAdminsSelf}` : ""}
                  {a.isProtected ? ` · ${t.adminAdminsOwner}` : ""}
                </p>
              </div>
              {a.isSelf || a.isProtected ? null : (
                <form action={revokeAdminAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton
                    className="btn btn-secondary"
                    aria-label={fmt(t.adminAdminsRevokeFor, { who })}
                  >
                    {t.adminAdminsRevoke}
                  </SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-line space-y-3 border-t pt-4">
        <h3 className="font-semibold">{t.adminAdminsAddTitle}</h3>
        <GrantAdminForm />
      </div>
    </section>
  );
}
