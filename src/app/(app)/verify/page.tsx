import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Hourglass, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import { DOC_TYPES, needsSelfie, docAllowed } from "@/lib/ekyc/ekyc";
import {
  ekycAvailable,
  loadEkycSettings,
  loadKycView,
} from "@/lib/ekyc/server";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { EkycFlow } from "./EkycFlow";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).kycTitle };
}

/** Only a path inside the app may be a "go back" target. */
function safeNext(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" &&
    s.startsWith("/") &&
    !s.startsWith("//") &&
    s.length <= 200
    ? s
    : null;
}

export default async function VerifyPage({
  searchParams,
}: PageProps<"/verify">) {
  if (!(await featureEnabled("ekyc"))) notFound();
  const user = await requireUser();
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const [t, settings, view] = await Promise.all([
    getT(),
    loadEkycSettings(),
    loadKycView(user.id),
  ]);
  const available = await ekycAvailable(settings);
  const docs = DOC_TYPES.filter((d) => docAllowed(settings, d));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="size-7" aria-hidden /> {t.kycTitle}
        </h1>
        <p className="text-muted text-sm">{t.kycIntro}</p>
      </div>

      {view.verified ? (
        <section role="status" className="card space-y-2">
          <h2 className="text-primary-strong flex items-center gap-2 font-semibold">
            <BadgeCheck className="size-6" aria-hidden /> {t.kycVerifiedTitle}
          </h2>
          <p className="text-sm">{t.kycVerifiedBody}</p>
          {next ? (
            <Link href={next} className="btn btn-primary w-full">
              {t.kycContinueTo}
            </Link>
          ) : null}
        </section>
      ) : view.pending ? (
        <section role="status" className="card space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Hourglass className="size-6" aria-hidden /> {t.kycPendingTitle}
          </h2>
          <p className="text-sm">{t.kycPendingBody}</p>
        </section>
      ) : !available ? (
        <section role="status" className="card space-y-2">
          <h2 className="font-semibold">{t.kycUnavailableTitle}</h2>
          <p className="text-sm">{t.kycUnavailableBody}</p>
        </section>
      ) : (
        <>
          {view.last === "rejected" ? (
            <p className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
              {t.kycRejectedNote}
            </p>
          ) : null}
          {view.last === "revoked" ? (
            <p className="bg-tint-warn rounded-xl px-3 py-2 text-sm">
              {t.kycRevokedNote}
            </p>
          ) : null}
          <EkycFlow
            docs={docs}
            needSelfie={needsSelfie(settings)}
            next={next}
          />
        </>
      )}

      <section className="card space-y-2" aria-labelledby="kyc-privacy-h">
        <h2 id="kyc-privacy-h" className="font-semibold">
          {t.kycPrivacyTitle}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t.kycPrivacy1}</li>
          <li>{t.kycPrivacy2}</li>
          <li>{t.kycPrivacy3}</li>
        </ul>
      </section>
    </div>
  );
}
