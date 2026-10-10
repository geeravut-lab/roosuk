import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultCard } from "@/components/liver/ResultCard";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { fmt } from "@/lib/i18n/dict";
import { formatDateTime } from "@/lib/i18n/format";
import { getLang, getT } from "@/lib/i18n/server";
import { loadAssessment } from "@/lib/liver/server";
import { buildResultView } from "@/lib/liver/view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).liverResultTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LiverResultPage({
  params,
}: PageProps<"/liver/result/[id]">) {
  if (!(await featureEnabled("liver_check"))) notFound();
  await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [t, lang, a] = await Promise.all([
    getT(),
    getLang(),
    loadAssessment(id),
  ]);
  if (!a) notFound();
  const view = buildResultView(a.result, t, lang);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.liverResultTitle}
        </h1>
        <p className="text-muted text-sm">
          {fmt(t.liverStatusOn, { date: formatDateTime(lang, a.created_at) })}
        </p>
      </div>
      <ResultCard t={t} view={view} />
      <p className="text-muted text-xs">
        {fmt(t.liverEngineNote, { engine: a.result.engine })} ·{" "}
        {t.liverDraftNote}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/liver/brief" className="btn btn-primary">
          {t.liverPrepare}
        </Link>
        <Link href="/liver" className="btn btn-secondary">
          {t.liverBackToLiver}
        </Link>
      </div>
    </div>
  );
}
