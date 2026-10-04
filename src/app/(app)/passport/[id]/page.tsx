import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PassportView } from "@/components/PassportView";
import { PrintButton } from "@/components/PrintButton";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { getLang, getT } from "@/lib/i18n/server";
import { parseStoredSnapshot } from "@/lib/passport/passport";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).passportTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The owner's own copy of what a link shows (read with their client: RLS gives only their rows). */
export default async function PassportPreviewPage({
  params,
}: PageProps<"/passport/[id]">) {
  if (!(await featureEnabled("health_passport"))) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireUser();
  const [t, lang, { data }] = await Promise.all([
    getT(),
    getLang(),
    (await createClient())
      .from("health_passports")
      .select("label, holder_name, snapshot")
      .eq("id", id)
      .maybeSingle<{
        label: string;
        holder_name: string | null;
        snapshot: unknown;
      }>(),
  ]);
  const snapshot = data ? parseStoredSnapshot(data.snapshot) : null;
  if (!data || !snapshot) notFound();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 print:hidden">
        <Link href="/passport" className="btn btn-secondary">
          {t.passportBack}
        </Link>
        <PrintButton />
      </div>
      <PassportView
        t={t}
        lang={lang}
        snapshot={snapshot}
        label={data.label}
        holderName={data.holder_name}
      />
    </div>
  );
}
