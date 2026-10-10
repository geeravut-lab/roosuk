"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Video } from "lucide-react";
import { cancelConsultAction, rekeyConsultAction } from "@/app/actions/telepharmacy";
import { Spinner } from "@/components/Spinner";
import { SubmitButton } from "@/components/SubmitButton";
import { fmt } from "@/lib/i18n/dict";
import { useI18n } from "@/lib/i18n/provider";
import { keyStore } from "./RequestDialog";

type Status = "waiting" | "booked" | "accepted" | "done" | "missed" | "cancelled";
interface View {
  status: Status;
  pharmacistName: string | null;
  joinUrl: string | null;
  needsKey: boolean;
}

const TERMINAL: Status[] = ["done", "missed", "cancelled"];

/**
 * The live consult: waiting screen, booked time, and the join button. It asks the server
 * every few seconds (slower when the tab is hidden, never after the call is over). The room
 * link arrives only from the server, only to the signed-in owner who holds this consult's
 * access key, and is shown as a button the person presses — never opened automatically.
 */
export function LiveConsult({
  id,
  status,
  mode,
  whenLabel,
  createdAt,
  pharmacistName,
}: {
  id: string;
  status: Status;
  mode: "instant" | "scheduled";
  whenLabel: string | null;
  createdAt: string;
  pharmacistName: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<View>({
    status,
    pharmacistName,
    joinUrl: null,
    needsKey: false,
  });
  const [waited, setWaited] = useState(0);
  const [renewing, setRenewing] = useState(false);
  const key = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopped = useRef(false);

  const poll = useCallback(async () => {
    if (stopped.current) return;
    try {
      if (key.current === null) {
        try {
          key.current = sessionStorage.getItem(keyStore(id));
        } catch {
          key.current = null;
        }
      }
      const res = await fetch("/api/telepharmacy/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, key: key.current }),
        cache: "no-store",
      });
      if (res.ok) {
        const next = (await res.json()) as View;
        setView(next);
        if (next.status !== status) router.refresh();
        if (TERMINAL.includes(next.status)) return;
      }
    } catch {
      /* a dropped connection: try again */
    }
    timer.current = setTimeout(poll, document.hidden ? 10_000 : 3_000);
  }, [id, router, status]);

  useEffect(() => {
    stopped.current = false;
    void poll();
    return () => {
      stopped.current = true;
      clearTimeout(timer.current);
    };
  }, [poll]);

  useEffect(() => {
    if (view.status !== "waiting") return;
    const tick = () =>
      setWaited(Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000)));
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [view.status, createdAt]);

  async function renew() {
    setRenewing(true);
    const r = await rekeyConsultAction(id);
    setRenewing(false);
    if (r.key) {
      key.current = r.key;
      try {
        sessionStorage.setItem(keyStore(id), r.key);
      } catch {
        /* kept in memory for this page */
      }
      clearTimeout(timer.current);
      void poll();
    }
  }

  const cancel = (label: string) => (
    <form action={cancelConsultAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="btn btn-secondary w-full">{label}</SubmitButton>
    </form>
  );

  return (
    <section className="card space-y-3" aria-labelledby="tele-live-h" aria-live="polite">
      <h2 id="tele-live-h" className="text-lg font-bold">
        {view.status === "accepted"
          ? fmt(t.teleAcceptedTitle, { name: view.pharmacistName ?? "" })
          : view.status === "waiting"
            ? t.teleWaitingTitle
            : view.status === "booked"
              ? t.teleBookedTitle
              : view.status === "missed"
                ? t.teleMissedTitle
                : t.teleActiveTitle}
      </h2>

      {view.status === "waiting" ? (
        <>
          <p role="status" className="flex items-center gap-2 text-sm">
            <Spinner /> {fmt(t.teleWaited, { sec: waited })}
          </p>
          <p className="text-muted text-sm">{t.teleWaitingBody}</p>
          {cancel(t.teleCancelWait)}
        </>
      ) : null}

      {view.status === "booked" ? (
        <>
          {whenLabel ? (
            <p className="font-semibold">{fmt(t.teleBookedAt, { when: whenLabel })}</p>
          ) : null}
          <p className="text-muted text-sm">{t.teleBookedNote}</p>
          {cancel(t.teleCancelBooking)}
        </>
      ) : null}

      {view.status === "accepted" ? (
        view.joinUrl ? (
          <>
            <a
              href={view.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary w-full"
            >
              <Video className="size-5" aria-hidden /> {t.teleJoin}
            </a>
            <p className="text-muted text-sm">{t.teleJoinHint}</p>
          </>
        ) : view.needsKey ? (
          <>
            <p className="text-sm">{t.teleKeyLost}</p>
            <button type="button" onClick={renew} disabled={renewing} className="btn btn-primary w-full">
              {renewing ? <Spinner /> : null}
              {t.teleKeyRenew}
            </button>
            <p className="text-muted text-xs">{t.teleKeyRenewNote}</p>
          </>
        ) : (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Spinner /> {t.teleWaitingTitle}
          </p>
        )
      ) : null}

      {view.status === "missed" && mode === "instant" ? (
        <p className="text-sm">{t.teleMissedBody}</p>
      ) : null}

      {(view.status === "waiting" || view.status === "booked") && view.needsKey ? (
        <div className="border-line space-y-2 border-t pt-3">
          <p className="text-muted text-xs">{t.teleKeyLost}</p>
          <button type="button" onClick={renew} disabled={renewing} className="btn btn-secondary w-full">
            {renewing ? <Spinner /> : null}
            {t.teleKeyRenew}
          </button>
        </div>
      ) : null}
    </section>
  );
}
