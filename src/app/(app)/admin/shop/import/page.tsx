import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { ImportPanel } from "./ImportPanel";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).adminShopImport };
}

export default async function AdminImportPage() {
  const t = await getT();
  return (
    <div className="space-y-5">
      <Link
        href="/admin/shop"
        className="text-primary-strong text-sm font-medium underline"
      >
        {t.adminShopTitle}
      </Link>
      <h1 className="text-primary-strong text-2xl font-bold">
        {t.adminShopImportTitle}
      </h1>
      <div className="card">
        <ImportPanel />
      </div>
    </div>
  );
}
