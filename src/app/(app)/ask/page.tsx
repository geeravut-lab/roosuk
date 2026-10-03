import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navAsk };
}

export default async function Page() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <h1 className="text-primary-strong text-2xl font-bold">{t.navAsk}</h1>
      <ComingSoon />
    </div>
  );
}
