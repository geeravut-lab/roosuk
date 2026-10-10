import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { prefillTri } from "@/lib/liver/questionnaire";
import { loadLiverDefaults, loadLiverLabRows } from "@/lib/liver/server";
import { LiverCheckForm } from "./LiverCheckForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).liverCheckTitle };
}

export default async function LiverCheckPage() {
  if (!(await featureEnabled("liver_check"))) notFound();
  await requireUser();
  const [t, d, rows] = await Promise.all([
    getT(),
    loadLiverDefaults(),
    loadLiverLabRows(),
  ]);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.liverCheckTitle}
        </h1>
        <p className="text-muted">{t.liverCheckIntro}</p>
      </div>
      <LiverCheckForm
        hasLabs={rows.length > 0}
        askBirthYear={d.birthYear === null}
        askSex={d.sex === null}
        initial={{
          diabetes: prefillTri(d.conditions, "diabetes"),
          hypertension: prefillTri(d.conditions, "hypertension"),
          dyslipidemia: prefillTri(d.conditions, "dyslipidemia"),
          alcohol: d.alcohol ?? "",
          hepB: d.hepB === "unknown" ? "" : d.hepB,
          hepC: d.hepC === "unknown" ? "" : d.hepC,
        }}
        prefilled={{
          tri: d.conditions.some((c) =>
            ["diabetes", "hypertension", "dyslipidemia"].includes(c),
          ),
          alcohol: d.alcohol !== null,
        }}
      />
    </div>
  );
}
