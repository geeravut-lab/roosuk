import type { Metadata } from "next";
import Link from "next/link";
import { Camera, FlaskConical } from "lucide-react";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navScan };
}

export default async function ScanPage() {
  const [t, foodOn] = await Promise.all([getT(), featureEnabled("food_scan")]);
  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">{t.navScan}</h1>
      <p className="text-muted">{t.scanHubIntro}</p>

      {foodOn ? (
        <Link
          href="/scan/food"
          className="card hover:bg-tint-primary flex items-start gap-3"
        >
          <span className="bg-tint-secondary text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-full">
            <Camera className="size-6" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{t.scanFoodTitle}</span>
            <span className="text-muted block text-sm">{t.scanFoodDesc}</span>
          </span>
        </Link>
      ) : null}

      <div
        className="card flex items-start gap-3 opacity-80"
        aria-disabled="true"
      >
        <span className="bg-tint-secondary text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-full">
          <FlaskConical className="size-6" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">
            {t.scanLabTitle}{" "}
            <span className="bg-tint-primary text-primary-strong ml-1 rounded-full px-2 py-0.5 text-xs">
              {t.scanSoon}
            </span>
          </span>
          <span className="text-muted block text-sm">{t.scanLabDesc}</span>
        </span>
      </div>
    </div>
  );
}
