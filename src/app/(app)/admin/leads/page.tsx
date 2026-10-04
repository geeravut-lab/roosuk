import type { Metadata } from "next";
import { updateLeadAction } from "@/app/actions/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/leads";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminLeadsTitle };
}

interface LeadRow {
  id: string;
  user_id: string;
  interest: "checkup" | "home_service" | "corporate" | "consult";
  contact_method: "line" | "phone";
  phone: string | null;
  note: string | null;
  status: LeadStatus;
  admin_note: string | null;
  created_at: string;
}

export default async function AdminLeadsPage() {
  const db = createAdminClient();
  const [t, lang, { data }] = await Promise.all([
    getT(),
    getLang(),
    db
      .from("checkup_leads")
      .select(
        "id, user_id, interest, contact_method, phone, note, status, admin_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<LeadRow[]>(),
  ]);
  const leads = data ?? [];
  // Name/email and whether they are a LINE friend of the OA (service role: this page is behind requireAdmin).
  const ids = [...new Set(leads.map((l) => l.user_id))];
  const [people, links] = await Promise.all([
    Promise.all(
      ids.map(async (id) => {
        const u = (await db.auth.admin.getUserById(id)).data.user;
        const meta = u?.user_metadata as { full_name?: string } | undefined;
        return [
          id,
          [meta?.full_name, u?.email].filter(Boolean).join(" · "),
        ] as const;
      }),
    ),
    db
      .from("line_links")
      .select("user_id")
      .in(
        "user_id",
        ids.length ? ids : ["00000000-0000-0000-0000-000000000000"],
      )
      .returns<{ user_id: string }[]>(),
  ]);
  const names = new Map(people);
  const lineLinked = new Set((links.data ?? []).map((l) => l.user_id));
  const open = leads.filter((l) => l.status === "new").length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminLeadsTitle}
        </h1>
        <p className="text-muted text-sm">
          {open > 0 ? fmt(t.adminLeadsOpen, { n: open }) : t.adminLeadsNone}
        </p>
      </div>
      <ul className="space-y-3">
        {leads.map((l) => (
          <li key={l.id} className="card space-y-3">
            <div className="space-y-0.5">
              <p className="font-semibold">
                {t[`leadInterest_${l.interest}` as const]}
              </p>
              <p className="text-sm">
                {names.get(l.user_id) || t.adminLeadUnknown}
              </p>
              <p className="text-sm font-medium">
                {l.contact_method === "phone"
                  ? `${t.leadContact_phone}: ${l.phone ?? ""}`
                  : `${t.leadContact_line} · ${lineLinked.has(l.user_id) ? t.adminLeadLineLinked : t.adminLeadLineNotLinked}`}
              </p>
              {l.note ? <p className="text-sm break-words">{l.note}</p> : null}
              <p className="text-muted text-sm">
                {formatDateTime(lang, l.created_at)}
              </p>
            </div>
            <form action={updateLeadAction} className="space-y-2">
              <input type="hidden" name="leadId" value={l.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor={`st-${l.id}`} className="label">
                    {t.adminLeadStatus}
                  </label>
                  <select
                    id={`st-${l.id}`}
                    name="status"
                    defaultValue={l.status}
                    className="field"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t[`leadStatus_${s}` as const]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`an-${l.id}`} className="label">
                    {t.adminLeadNote}
                  </label>
                  <input
                    id={`an-${l.id}`}
                    name="adminNote"
                    defaultValue={l.admin_note ?? ""}
                    maxLength={300}
                    autoComplete="off"
                    className="field"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="btn btn-secondary w-full sm:w-auto"
              >
                {t.save}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
