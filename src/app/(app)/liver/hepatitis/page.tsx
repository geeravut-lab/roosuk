import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { loadHepatitis } from "@/lib/liver/server";
import { HepatitisForm } from "./HepatitisForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).liverHepTitle };
}

export default async function LiverHepatitisPage() {
  if (!(await featureEnabled("liver_check"))) notFound();
  await requireUser();
  const [t, hep] = await Promise.all([getT(), loadHepatitis()]);
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.liverHepTitle}
        </h1>
        <p className="text-muted">{t.liverHepIntro}</p>
      </div>
      <HepatitisForm
        initial={{
          hepB: hep?.hep_b ?? "unknown",
          hepC: hep?.hep_c ?? "unknown",
          hepBOn: hep?.hep_b_tested_on ?? "",
          hepCOn: hep?.hep_c_tested_on ?? "",
        }}
      />
      <p className="text-sm">{t.liverHepUntestedNote}</p>
      <p className="text-sm">{t.liverHepPositiveNote}</p>
      <p className="bg-tint-secondary rounded-xl px-3 py-2 text-sm">
        {t.liverDisclaimer}
      </p>
      <Link href="/liver" className="btn btn-secondary">
        {t.liverBackToLiver}
      </Link>
    </div>
  );
}
