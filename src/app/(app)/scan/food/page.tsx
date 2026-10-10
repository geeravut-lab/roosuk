import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { keepMode } from "@/lib/files/server";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { isMealType } from "@/lib/goals/meals";
import { BarcodeForm } from "./BarcodeForm";
import { FoodScanForm } from "./FoodScanForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).scanFoodTitle };
}

export default async function FoodScanPage({
  searchParams,
}: PageProps<"/scan/food">) {
  // A switched-off feature has no page (the server action checks it too).
  if (!(await featureEnabled("food_scan"))) notFound();
  const [t, user] = await Promise.all([getT(), requireUser()]);
  const mode = await keepMode(user.id);
  const barcode = await featureEnabled("barcode_scan");
  const { meal: rawMeal } = await searchParams;
  const meal = isMealType(rawMeal) ? rawMeal : undefined;
  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.scanFoodTitle}
      </h1>
      <FoodScanForm keepMode={mode} meal={meal} />
      {barcode ? <BarcodeForm meal={meal} /> : null}
    </div>
  );
}
