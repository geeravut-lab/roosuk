import Link from "next/link";
import { LangSwitch } from "@/components/LangSwitch";
import { LogoMark } from "@/components/Logo";
import { safeNextPath } from "@/lib/auth/utils";
import { getLineLoginEnv } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { AuthForm } from "./AuthForm";

export default async function AuthPage({ searchParams }: PageProps<"/auth">) {
  const params = await searchParams;
  const t = await getT();
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pb-8">
      <header className="flex h-14 items-center justify-between">
        <Link
          href="/"
          className="text-primary-strong inline-flex items-center gap-2 font-bold"
        >
          <LogoMark size={32} />
          {t.appName}
        </Link>
        <LangSwitch />
      </header>
      <main className="flex-1">
        <AuthForm
          initialMode={first(params.mode) === "signup" ? "signup" : "login"}
          next={safeNextPath(first(params.next))}
          lineEnabled={getLineLoginEnv() !== null}
          initialError={first(params.error)}
        />
      </main>
    </div>
  );
}
