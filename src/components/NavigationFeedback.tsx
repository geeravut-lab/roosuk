"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";
import { Spinner } from "./Spinner";

/** Show the indicator only if the page is still not there after this long (a fast page needs no flicker). */
const SHOW_AFTER_MS = 120;
/** Never leave it up forever (a navigation that is cancelled or never completes). */
const GIVE_UP_MS = 20_000;

/** The in-app destination of a click, or null when the browser should just do its normal thing. */
export function internalTarget(
  e: Pick<
    MouseEvent,
    | "button"
    | "metaKey"
    | "ctrlKey"
    | "shiftKey"
    | "altKey"
    | "defaultPrevented"
  >,
  anchor: HTMLAnchorElement | null,
  here: { origin: string; path: string },
): string | null {
  if (!anchor || e.defaultPrevented || e.button !== 0) return null;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if (anchor.hasAttribute("download")) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  const next = url.pathname + url.search;
  if (next === here.path) return null; // same page (or only a #hash)
  return next;
}

interface Press {
  target: string;
  /** where the person was when they pressed: the press is over once the location differs */
  from: string;
}

function Watcher() {
  const { t } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}?${search}`;
  const [press, setPress] = useState<Press | null>(null);
  const [shownFor, setShownFor] = useState<Press | null>(null);
  const pendingRef = useRef<string | null>(null);

  // Still waiting = we pressed and the location has not changed since.
  const waiting = press !== null && press.from === here;
  const visible = waiting && shownFor === press;

  useEffect(() => {
    if (!waiting) pendingRef.current = null; // the page arrived (or we gave up)
  }, [waiting]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      const next = internalTarget(e, anchor, {
        origin: window.location.origin,
        path: window.location.pathname + window.location.search,
      });
      if (!next) return;
      // Pressing the same link again while it loads must not start it twice.
      if (pendingRef.current === next) {
        e.preventDefault();
        return;
      }
      pendingRef.current = next;
      setPress({
        target: next,
        from: `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`,
      });
    };
    // Capture phase: Next's <Link> calls preventDefault in its own handler, which would otherwise run first and hide the click from us.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!press) return;
    const show = setTimeout(() => setShownFor(press), SHOW_AFTER_MS);
    const giveUp = setTimeout(() => {
      pendingRef.current = null;
      setPress(null);
    }, GIVE_UP_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(giveUp);
    };
  }, [press]);

  if (!visible) return null;
  return (
    <>
      <div
        aria-hidden
        className="bg-tint-primary fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden"
      >
        <div className="nav-progress bg-primary h-full w-1/3" />
      </div>
      <div
        role="status"
        className="bg-surface border-line text-primary-strong fixed top-3 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-md"
      >
        <Spinner className="size-4" />
        {t.loadingPage}
      </div>
    </>
  );
}

/** One indicator for every in-app link and menu: it appears when the person presses and goes when the page has arrived. */
export function NavigationFeedback() {
  return (
    <Suspense fallback={null}>
      <Watcher />
    </Suspense>
  );
}
