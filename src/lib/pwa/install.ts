import type { Dict } from "@/lib/i18n/dict";

/**
 * "Install as an app": what the browser can do and what to tell the person.
 * Android Chrome offers a real install prompt (`beforeinstallprompt`); iOS never
 * does, so Safari's "Add to Home Screen" has to be explained; and the browsers
 * inside LINE / Facebook / Instagram cannot install anything — the person must
 * open the page in a real browser first. Pure functions, so every case is tested.
 */
export type Platform = "ios" | "android" | "desktop";
export type Browser =
  "safari" | "chrome" | "edge" | "firefox" | "samsung" | "inapp" | "other";

export interface Env {
  platform: Platform;
  browser: Browser;
}

const IN_APP =
  /Line\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|TikTok|; wv\)/i;

export function detectEnv(ua: string, maxTouchPoints = 0): Env {
  // iPadOS 13+ asks for the desktop site: it says "Macintosh" but has a touch screen.
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const platform: Platform = ios ? "ios" : android ? "android" : "desktop";

  let browser: Browser;
  if (IN_APP.test(ua)) browser = "inapp";
  else if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = "edge";
  else if (/SamsungBrowser/.test(ua)) browser = "samsung";
  else if (/FxiOS|Firefox/.test(ua)) browser = "firefox";
  else if (/CriOS|Chrome\//.test(ua)) browser = "chrome";
  else if (/Safari\//.test(ua)) browser = "safari";
  else browser = "other";
  return { platform, browser };
}

export type StepKey = Extract<keyof Dict, `pwaStep_${string}`>;

/** The short numbered steps for this device, as dictionary keys. */
export function installSteps(env: Env, canPrompt: boolean): StepKey[] {
  if (env.browser === "inapp")
    return env.platform === "ios"
      ? ["pwaStep_inapp_ios_1", "pwaStep_inapp_2"]
      : ["pwaStep_inapp_android_1", "pwaStep_inapp_2"];
  if (env.platform === "ios") {
    // From iOS 16.4 every browser can add to the home screen; Safari and the others only differ in where the share button is.
    return env.browser === "safari"
      ? ["pwaStep_ios_safari_1", "pwaStep_ios_2", "pwaStep_ios_3"]
      : ["pwaStep_ios_other_1", "pwaStep_ios_2", "pwaStep_ios_3"];
  }
  if (env.platform === "android") {
    if (canPrompt) return [];
    if (env.browser === "firefox")
      return ["pwaStep_android_firefox_1", "pwaStep_android_2"];
    if (env.browser === "samsung")
      return ["pwaStep_android_samsung_1", "pwaStep_android_2"];
    return ["pwaStep_android_chrome_1", "pwaStep_android_2"];
  }
  if (canPrompt) return [];
  return env.browser === "chrome" || env.browser === "edge"
    ? ["pwaStep_desktop_1"]
    : ["pwaStep_desktop_other"];
}

/** Running as the installed app (Android/desktop: display-mode, iOS: navigator.standalone). */
export function isStandaloneMode(
  matchesStandalone: boolean,
  iosStandalone: boolean | undefined,
): boolean {
  return matchesStandalone || iosStandalone === true;
}

/** The minimal shape of the browser's install prompt event. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
