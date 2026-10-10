"use client";

import { useEffect } from "react";

/**
 * Brings the newest chat message into view: on arrival at a page that already has a conversation,
 * and again whenever a message is added. A message that fits the screen is shown whole (its end
 * just above the bottom bar); a very long one is aligned to the top so its beginning is not lost.
 * The newest message is the element marked `data-chat-last`.
 */
export function ScrollToLatest({ count }: { count: number }) {
  useEffect(() => {
    if (count === 0) return;
    // Next scrolls the new page to the top after the page mounts; wait a beat so ours is last.
    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>("[data-chat-last]");
      if (!el) return;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const room = window.innerHeight - 56 /* header */ - 64; /* bottom bar */
      el.scrollIntoView({
        block: el.getBoundingClientRect().height > room * 0.8 ? "start" : "end",
        behavior: reduce ? "auto" : "smooth",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [count]);
  return null;
}
