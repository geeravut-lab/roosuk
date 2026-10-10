"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { useI18n } from "@/lib/i18n/provider";

const HEARTBEAT_MS = 45_000;
const REFRESH_MS = 5_000;

/**
 * The "ready for calls" switch. While it is on the page tells the server every 45 seconds
 * that this pharmacist is here (the server decides who is free from that clock — a pharmacist
 * who closes the tab drops out within two minutes), and refreshes the queue every few seconds.
 */
export function PresenceToggle({
  initialOnline,
  canServe,
}: {
  initialOnline: boolean;
  canServe: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [online, setOnline] = useState(initialOnline && canServe);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = useCallback(async (value: boolean) => {
    const res = await fetch("/api/telepharmacy/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online: value }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      reason?: string;
    };
    return { ok: res.ok && body.ok === true, reason: body.reason ?? "error" };
  }, []);

  useEffect(() => {
    if (!online) return;
    const beat = setInterval(async () => {
      try {
        const r = await send(true);
        if (!r.ok) {
          setOnline(false);
          setProblem(r.reason);
        }
      } catch {
        /* the next beat will try again */
      }
    }, HEARTBEAT_MS);
    const refresh = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, REFRESH_MS);
    const bye = () => {
      navigator.sendBeacon?.(
        "/api/telepharmacy/presence",
        new Blob([JSON.stringify({ online: false })], {
          type: "application/json",
        }),
      );
    };
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(beat);
      clearInterval(refresh);
      window.removeEventListener("pagehide", bye);
    };
  }, [online, router, send]);

  async function toggle() {
    setBusy(true);
    setProblem(null);
    try {
      const r = await send(!online);
      if (r.ok) setOnline(!online);
      else setProblem(r.reason);
    } catch {
      setProblem("error");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">
          {online ? t.pharmOnline : t.pharmOffline}
        </p>
        <p className="text-muted text-sm">
          {online ? t.pharmOnlineHint : t.pharmOfflineHint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={online}
        disabled={busy || (!canServe && !online)}
        onClick={toggle}
        className={`btn ${online ? "btn-secondary" : "btn-primary"} min-w-40`}
      >
        {busy ? <Spinner /> : null}
        {online ? t.pharmGoOffline : t.pharmGoOnline}
      </button>
      {problem ? (
        <p
          role="alert"
          className="bg-tint-warn w-full rounded-xl px-3 py-2 text-sm font-medium"
        >
          {problem === "license"
            ? t.pharmProblem_license
            : problem === "kyc"
              ? t.pharmProblem_kyc
              : t.pharmProblem_error}
        </p>
      ) : null}
    </div>
  );
}
