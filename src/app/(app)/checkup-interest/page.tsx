import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withdrawLeadAction } from "@/app/actions/leads";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { LeadForm } from "./LeadForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).leadTitle };
}

export default async function CheckupInterestPage() {
  if (!(await featureEnabled("checkup_lead"))) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const [t, lang, { data: open }] = await Promise.all([
    getT(),
    getLang(),
    supabase
      .from("checkup_leads")
      .select("id, interest, contact_method, created_at")
      .eq("user_id", user.id)
      .eq("status", "new")
      .maybeSingle<{
        id: string;
        interest: "checkup" | "home_service" | "corporate" | "consult";
        contact_method: "line" | "phone";
        created_at: string;
      }>(),
  ]);
  const raw = process.env.LINE_OA_ADD_FRIEND_URL?.trim();
  const addFriendUrl = raw && /^https:\/\//.test(raw) ? raw : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.leadTitle}
        </h1>
        <p className="text-muted">{t.leadIntro}</p>
      </div>

      {open ? (
        <section className="card space-y-2" aria-labelledby="open-h">
          <h2 id="open-h" className="font-semibold">
            {t.leadOpenTitle}
          </h2>
          <p>
            {t[`leadInterest_${open.interest}` as const]} ·{" "}
            {t[`leadContact_${open.contact_method}` as const]}
          </p>
          <p className="text-muted text-sm">
            {fmt(t.leadOpenSince, {
              when: formatDateTime(lang, open.created_at),
            })}
          </p>
          <form action={withdrawLeadAction}>
            <input type="hidden" name="leadId" value={open.id} />
            <button type="submit" className="btn btn-ghost w-full">
              {t.leadWithdraw}
            </button>
          </form>
        </section>
      ) : (
        <LeadForm addFriendUrl={addFriendUrl} />
      )}
    </div>
  );
}
