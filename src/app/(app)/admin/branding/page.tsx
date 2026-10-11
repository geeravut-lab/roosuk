import type { Metadata } from "next";
import Image from "next/image";
import { removeBrandImageAction } from "@/app/actions/brand";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAdmin } from "@/lib/auth/server";
import { loadBrand } from "@/lib/brand/server";
import { getT } from "@/lib/i18n/server";
import { invalidatePlatformSettingsCache } from "@/lib/settings/server";
import { BrandForm } from "./BrandForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminBrandTitle };
}

export default async function AdminBrandingPage() {
  await requireAdmin();
  invalidatePlatformSettingsCache(); // admins see the truth, not a cached copy
  const [t, brand] = await Promise.all([getT(), loadBrand()]);
  const picture = (kind: "logo" | "favicon") => {
    const ref = brand[kind];
    return (
      <div className="flex items-center gap-3">
        <Image
          src={`/brand/${kind}?v=${ref?.version ?? 0}`}
          alt=""
          width={48}
          height={48}
          unoptimized
          className="border-line size-12 rounded-lg border object-contain"
        />
        <span className="text-muted text-sm">
          {t.adminBrandCurrent}: {ref ? "✓" : t.adminBrandDefault}
        </span>
        {ref ? (
          <form action={removeBrandImageAction} className="ml-auto">
            <input type="hidden" name="kind" value={kind} />
            <SubmitButton className="btn btn-ghost">
              {t.adminBrandRemove}
            </SubmitButton>
          </form>
        ) : null}
      </div>
    );
  };
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-primary-strong text-2xl font-bold">
          {t.adminBrandTitle}
        </h1>
        <p className="text-muted text-sm">{t.adminBrandHint}</p>
      </div>
      <BrandForm
        nameTh={brand.nameTh}
        nameEn={brand.nameEn}
        logoPreview={picture("logo")}
        faviconPreview={picture("favicon")}
      />
    </div>
  );
}
