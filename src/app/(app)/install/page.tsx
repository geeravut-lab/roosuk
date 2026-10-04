import type { Metadata } from "next";
import { Check } from "lucide-react";
import { getOrigin } from "@/lib/http/origin";
import { getT } from "@/lib/i18n/server";
import { InstallPanel } from "./InstallPanel";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).navInstall };
}

export default async function InstallPage() {
  const [t, siteUrl] = await Promise.all([getT(), getOrigin()]);
  return (
    <div className="space-y-5">
      <h1 className="text-primary-strong text-2xl font-bold">{t.pwaTitle}</h1>
      <p>{t.pwaIntro}</p>
      <ul className="space-y-2">
        {[t.pwaBenefit1, t.pwaBenefit2, t.pwaBenefit3].map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm">
            <Check
              className="text-primary-strong mt-0.5 size-5 shrink-0"
              aria-hidden
            />
            {b}
          </li>
        ))}
      </ul>
      <InstallPanel siteUrl={siteUrl} />
    </div>
  );
}
