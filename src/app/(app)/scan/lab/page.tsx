import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { keepMode } from "@/lib/files/server";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { LabScanForm } from "./LabScanForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).scanLabTitle };
}

export default async function LabScanPage() {
  // A switched-off feature has no page (the server action checks it too).
  if (!(await featureEnabled("lab_scan"))) notFound();
  const [t, user] = await Promise.all([getT(), requireUser()]);
  const mode = await keepMode(user.id);
  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.scanLabTitle}
      </h1>
      <LabScanForm keepMode={mode} />
    </div>
  );
}
