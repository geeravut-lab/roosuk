"use client";

import { useEffect } from "react";
import { promptStore } from "@/lib/pwa/prompt-store";
import type { InstallPromptEvent } from "@/lib/pwa/install";

/** Registers the service worker (production only) and keeps the browser's install prompt for the install page. */
export function PwaRegister() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // we show our own button; the mini-bar would otherwise appear and vanish
      promptStore.setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => promptStore.markInstalled();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[pwa] service worker not registered:", err);
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
