"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, Ellipsis, LogOut, ShieldCheck, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { BackLink } from "@/components/shell/BackLink";
import { LangSwitch } from "@/components/LangSwitch";
import { LogoMark, Wordmark } from "@/components/Logo";
import {
  CENTER_SLOT,
  isActivePath,
  NAV,
  NAV_GROUPS,
  PRIMARY_NAV_COUNT,
  type NavItem,
} from "@/config/nav";
import { fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";

interface AppShellProps {
  children: ReactNode;
  isAdmin: boolean;
  /** Admin-configured manual link (https only); empty hides the menu entry. */
  manualUrl: string;
  displayName: string;
  /** Unread in-app notifications (0 = none). */
  unreadCount?: number;
}

const linkBase =
  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors";
const linkIdle = "text-foreground hover:bg-tint-primary";
const linkActive = "bg-tint-active text-active font-semibold";

/**
 * One shell for both layouts, split at a single breakpoint (`md`, 768px):
 * below it a header + bottom bar + "More" sheet, from it up a sidebar.
 * (docs/01-responsive-layout.md, docs/02-navigation.md)
 */
export function AppShell({
  children,
  isAdmin,
  manualUrl,
  displayName,
  unreadCount = 0,
}: AppShellProps) {
  const { t } = useI18n();
  const rawPath = usePathname();
  // /preview/* mirrors real pages for the layout tests; treat it like the page it mirrors.
  const pathname = rawPath.replace(/^\/preview(?=\/)/, "");
  // The sheet is open "for" the path it was opened on, so navigating closes it
  // without an effect that sets state.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const moreOpen = openPath === pathname;
  const openMore = () => setOpenPath(pathname);
  const closeMore = () => setOpenPath(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenPath(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const primary = NAV.slice(0, PRIMARY_NAV_COUNT);
  const rest = NAV.slice(PRIMARY_NAV_COUNT);
  const adminActive = isActivePath(pathname, "/admin");
  const moreActive =
    moreOpen || rest.some((i) => isActivePath(pathname, i.href)) || adminActive;

  const renderLink = (item: NavItem) => {
    const active = isActivePath(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`${linkBase} ${active ? linkActive : linkIdle}`}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className="truncate">{t[item.label]}</span>
        {item.href === "/notifications" && unreadCount > 0 ? (
          <span className="bg-coral text-on-accent ml-auto rounded-full px-2 py-0.5 text-xs font-semibold">
            <span aria-hidden>{unreadCount > 99 ? "99+" : unreadCount}</span>
            <span className="sr-only">
              {fmt(t.notificationsUnreadCount, { n: unreadCount })}
            </span>
          </span>
        ) : null}
      </Link>
    );
  };

  const adminLink = isAdmin ? (
    <Link
      href="/admin"
      aria-current={adminActive ? "page" : undefined}
      className={`${linkBase} ${adminActive ? linkActive : linkIdle}`}
    >
      <ShieldCheck className="size-5 shrink-0" aria-hidden />
      <span className="truncate">{t.navAdmin}</span>
    </Link>
  ) : null;

  const manualLink = manualUrl ? (
    <a
      href={manualUrl}
      target="_blank"
      rel="noreferrer"
      className={`${linkBase} ${linkIdle}`}
    >
      <BookOpen className="size-5 shrink-0" aria-hidden />
      <span className="truncate">{t.navManual}</span>
    </a>
  ) : null;

  const signOut = (
    <form action={signOutAction}>
      <button type="submit" className={`${linkBase} ${linkIdle} w-full`}>
        <LogOut className="size-5 shrink-0" aria-hidden />
        <span className="truncate">{t.authSignOut}</span>
      </button>
    </form>
  );

  return (
    <div className="bg-background min-h-screen md:flex">
      <a
        href="#main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2"
      >
        {t.skipToContent}
      </a>

      {/* Desktop sidebar — h-dvh, not h-screen: 100vh on iOS includes the collapsible bars */}
      <aside
        aria-label={t.navMainLabel}
        className="border-line bg-surface sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3 md:flex"
      >
        <Link href="/today" className="px-2 py-2">
          <Wordmark name={t.appName} />
        </Link>
        <nav className="flex flex-1 flex-col gap-4">
          {NAV_GROUPS.map((group) => {
            const items = NAV.filter((i) => i.group === group.id);
            return (
              <div key={group.id} className="flex flex-col gap-1">
                <p className="text-muted px-3 text-xs font-semibold tracking-wide">
                  {t[group.label]}
                </p>
                {items.map(renderLink)}
              </div>
            );
          })}
          {adminLink ? (
            <div className="flex flex-col gap-1">
              <p className="text-muted px-3 text-xs font-semibold tracking-wide">
                {t.navGroupAdmin}
              </p>
              {adminLink}
            </div>
          ) : null}
        </nav>
        <div className="border-line flex flex-col gap-1 border-t pt-3">
          {manualLink}
          <p className="text-muted truncate px-3 py-1 text-sm">{displayName}</p>
          <LangSwitch className="mx-3 self-start" />
          {signOut}
        </div>
      </aside>

      {/* pb-* makes room for the fixed bottom bar; min-w-0 stops wide content widening the page */}
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="border-line bg-surface/95 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur md:hidden">
          <Link href="/today">
            <Wordmark name={t.appName} size={32} />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/notifications"
              aria-label={
                unreadCount > 0
                  ? `${t.navNotifications}: ${fmt(t.notificationsUnreadCount, { n: unreadCount })}`
                  : t.navNotifications
              }
              className="text-foreground hover:bg-tint-primary relative flex size-11 items-center justify-center rounded-full"
            >
              <Bell className="size-5" aria-hidden />
              {unreadCount > 0 ? (
                <span
                  aria-hidden
                  className="bg-coral text-on-accent absolute top-1.5 right-1 min-w-5 rounded-full px-1 text-center text-xs font-semibold"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <LangSwitch />
          </div>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6 md:py-8"
        >
          <Suspense fallback={null}>
            <BackLink />
          </Suspense>
          {children}
        </main>
      </div>

      {/* Mobile bottom bar: today · timeline · [SCAN] · ask · more */}
      <nav
        aria-label={t.navMobileLabel}
        className="border-line bg-surface fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid h-16 grid-cols-5 items-end">
          {primary.map((item, index) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            if (index === CENTER_SLOT) {
              return (
                <li key={item.href} className="flex justify-center">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="text-foreground -mt-5 flex flex-col items-center gap-0.5 pb-1.5 text-xs font-semibold"
                  >
                    <span
                      className={`bg-coral text-on-accent ring-surface flex size-14 items-center justify-center rounded-full shadow-md ring-4 ${
                        active
                          ? "outline-active outline-2 outline-offset-2"
                          : ""
                      }`}
                    >
                      <Icon className="size-7" aria-hidden />
                    </span>
                    {t[item.label]}
                  </Link>
                </li>
              );
            }
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                    active ? "text-active font-semibold" : "text-muted"
                  }`}
                >
                  <Icon className="size-6" aria-hidden />
                  {t[item.label]}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={openMore}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`flex h-16 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                moreActive ? "text-active font-semibold" : "text-muted"
              }`}
            >
              <Ellipsis className="size-6" aria-hidden />
              {t.navMore}
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label={t.close}
            tabIndex={-1}
            onClick={closeMore}
            className="bg-foreground/40 absolute inset-0"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.navMoreTitle}
            className="bg-surface absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-semibold">
                <LogoMark size={28} />
                {displayName}
              </span>
              <button
                type="button"
                onClick={closeMore}
                aria-label={t.close}
                className="text-muted hover:bg-tint-primary flex size-11 items-center justify-center rounded-full"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {rest.map(renderLink)}
              {adminLink}
              {manualLink}
              {signOut}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
