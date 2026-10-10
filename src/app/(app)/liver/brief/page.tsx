import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefView } from "@/components/liver/BriefView";
import { PrintButton } from "@/components/PrintButton";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { getLang, getT } from "@/lib/i18n/server";
import { buildLiverBrief } from "@/lib/liver/brief";
import {
  loadAssessments,
  loadLiverDefaults,
  loadLiverLabRows,
} from "@/lib/liver/server";
import { toPanels } from "@/lib/liver/trend";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).liverBriefTitle };
}

/** "Prepare for my liver check-up": the doctor summary, on screen and printable. */
export default async function LiverBriefPage() {
  if (!(await featureEnabled("liver_check"))) notFound();
  await requireUser();
  const today = bangkokDate(new Date());
  const [t, lang, rows, assessments, defaults] = await Promise.all([
    getT(),
    getLang(),
    loadLiverLabRows(),
    loadAssessments(1),
    loadLiverDefaults(),
  ]);
  const a = assessments[0];
  const brief = buildLiverBrief({
    assessment: a
      ? { created_on: a.created_on, result: a.result, answers: a.answers }
      : null,
    panels: toPanels(rows),
    rows,
    birthYear: defaults.birthYear,
  });

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.liverBriefTitle}
        </h1>
        <p className="text-muted">{t.liverBriefIntro}</p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <PrintButton />
        <Link href="/passport?sections=liver" className="btn btn-primary">
          {t.liverBriefShare}
        </Link>
      </div>
      <p className="text-muted text-xs print:hidden">{t.liverBriefShareHint}</p>
      <BriefView t={t} lang={lang} brief={brief} today={today} />
      <Link href="/liver" className="btn btn-secondary print:hidden">
        {t.liverBackToLiver}
      </Link>
    </div>
  );
}
