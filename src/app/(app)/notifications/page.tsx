import type { Metadata } from "next";
import Link from "next/link";
import { markAllReadAction } from "@/app/actions/notifications";
import { requireUser } from "@/lib/auth/server";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { parseNoticeBody, safeHref } from "@/lib/notify/notice";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/SubmitButton";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).notificationsTitle };
}

interface Row {
  id: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [t, lang, { data }] = await Promise.all([
    getT(),
    getLang(),
    supabase
      .from("app_notifications")
      .select("id, title, body, href, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Row[]>(),
  ]);
  const rows = data ?? [];
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.notificationsTitle}
        </h1>
        {unread > 0 ? (
          <form action={markAllReadAction}>
            <SubmitButton className="btn btn-secondary">
              {t.notificationsMarkAll}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="card">{t.notificationsEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const href = safeHref(r.href);
            const inner = (
              <>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    {!r.read_at ? (
                      <span className="bg-coral text-on-accent mr-2 rounded-full px-2 py-0.5 text-xs">
                        {t.notificationsUnread}
                      </span>
                    ) : null}
                    {r.title}
                  </span>
                  <span className="text-muted shrink-0 text-xs">
                    {formatDateTime(lang, r.created_at)}
                  </span>
                </span>
                {parseNoticeBody(r.body).map((p, i) => (
                  <span key={i} className="block text-sm">
                    {p.label ? (
                      <span className="text-muted">{p.label}: </span>
                    ) : null}
                    {p.value}
                  </span>
                ))}
              </>
            );
            return (
              <li key={r.id}>
                {href ? (
                  <Link
                    href={href}
                    className={`card hover:bg-tint-primary block space-y-1 ${r.read_at ? "" : "border-primary border-2"}`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="card space-y-1">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
