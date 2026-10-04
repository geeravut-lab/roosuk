"use client";

import { useSyncExternalStore, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Spinner } from "@/components/Spinner";
import { useI18n } from "@/lib/i18n/provider";
import {
  detectEnv,
  installSteps,
  isStandaloneMode,
  type Env,
} from "@/lib/pwa/install";
import { promptStore } from "@/lib/pwa/prompt-store";

// What the browser is, read once on the client (a stable object, as useSyncExternalStore needs).
let envCache: Env | null = null;
const readEnv = (): Env =>
  (envCache ??= detectEnv(navigator.userAgent, navigator.maxTouchPoints));
const noop = () => () => {};

function subscribeStandalone(cb: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const readStandalone = () =>
  isStandaloneMode(
    window.matchMedia("(display-mode: standalone)").matches,
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );

function Steps({ keys }: { keys: readonly string[] }) {
  const { t } = useI18n();
  return (
    <ol className="list-decimal space-y-2 pl-5">
      {keys.map((k) => (
        <li key={k}>{t[k as keyof typeof t]}</li>
      ))}
    </ol>
  );
}

/** Installs the app: the real prompt where the browser has one, otherwise the steps for this very device. */
export function InstallPanel({ siteUrl }: { siteUrl: string }) {
  const { t } = useI18n();
  const env = useSyncExternalStore(noop, readEnv, () => null);
  const standalone = useSyncExternalStore(
    subscribeStandalone,
    readStandalone,
    () => false,
  );
  const prompt = useSyncExternalStore(
    promptStore.subscribe,
    promptStore.getPrompt,
    () => null,
  );
  const installed = useSyncExternalStore(
    promptStore.subscribe,
    promptStore.getInstalled,
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  async function install() {
    if (!prompt) return;
    setBusy(true);
    setDismissed(false);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "dismissed") setDismissed(true);
      // the browser lets a prompt be used once; a dismissed one is fired again later, or the steps below still work
      promptStore.setPrompt(null);
    } finally {
      setBusy(false);
    }
  }

  if (standalone || installed)
    return (
      <p role="status" className="card bg-tint-secondary font-semibold">
        {installed ? t.pwaJustInstalled : t.pwaStandalone}
      </p>
    );

  const mine = env ? installSteps(env, !!prompt) : [];
  return (
    <div className="space-y-5">
      <section className="card space-y-3" aria-labelledby="pwa-you">
        <h2
          id="pwa-you"
          className="inline-flex items-center gap-2 font-semibold"
        >
          <Smartphone className="text-primary-strong size-5" aria-hidden />
          {t.pwaForYou}
        </h2>
        {prompt ? (
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy}
            onClick={install}
          >
            {busy ? <Spinner /> : <Download className="size-5" aria-hidden />}
            {t.pwaInstallBtn}
          </button>
        ) : null}
        {dismissed ? (
          <p role="status" className="text-muted text-sm">
            {t.pwaDismissed}
          </p>
        ) : null}
        {mine.length ? <Steps keys={mine} /> : null}
        {env?.platform === "ios" && env.browser !== "inapp" ? (
          <p className="text-muted text-sm">{t.pwaIosNote}</p>
        ) : null}
        {env?.browser === "inapp" ? (
          <div className="space-y-2">
            <p className="text-sm">{t.pwaCopyHint}</p>
            <p className="bg-surface border-field-border rounded-xl border px-3 py-2 text-sm break-all select-all">
              {siteUrl}
            </p>
            <CopyButton text={siteUrl} />
          </div>
        ) : null}
      </section>

      <section className="card space-y-3" aria-labelledby="pwa-all">
        <h2 id="pwa-all" className="font-semibold">
          {t.pwaAllTitle}
        </h2>
        {(
          [
            ["ios", { platform: "ios", browser: "safari" }],
            ["android", { platform: "android", browser: "chrome" }],
            ["desktop", { platform: "desktop", browser: "chrome" }],
          ] as const
        ).map(([id, e]) => (
          <div key={id} className="space-y-1">
            <h3 className="text-sm font-semibold">
              {t[`pwaGroup_${id}` as const]}
            </h3>
            <Steps keys={installSteps(e, false)} />
          </div>
        ))}
      </section>
    </div>
  );
}
