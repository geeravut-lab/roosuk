import { formatDateTime } from "@/lib/i18n/format";
import type { Dict, Lang } from "@/lib/i18n/dict";
import { noticeBody, type Notice } from "@/lib/notify/notice";

/**
 * Messages that leave the app (LINE, push) are read on a lock screen by whoever
 * holds the phone. So none of them says WHAT the consultation is about, which
 * medicine, which product or what was advised — only that something is waiting or
 * due, and where to open the app.
 */
export function consultWaitingNotice(t: Dict, consultId: string): Notice {
  return {
    kind: "consult_waiting",
    category: "transactional",
    title: t.teleNoticeWaitingTitle,
    body: noticeBody(t.teleNoticeWaitingBody),
    href: "/pharmacist",
    dedupeKey: `consult-waiting:${consultId}`,
    urgent: true,
  };
}

export function consultReminderNotice(
  t: Dict,
  lang: Lang,
  consultId: string,
  at: Date,
): Notice {
  return {
    kind: "consult_reminder",
    category: "transactional",
    title: t.teleNoticeReminderTitle,
    body: noticeBody(t.teleNoticeReminderBody, [
      [t.teleLabelWhen, formatDateTime(lang, at)],
    ]),
    href: "/telepharmacy",
    dedupeKey: `consult-reminder:${consultId}`,
    urgent: true,
  };
}

export function consultMissedNotice(
  t: Dict,
  consultId: string,
  mode: "instant" | "scheduled",
): Notice {
  return {
    kind: "consult_missed",
    category: "transactional",
    title:
      mode === "instant"
        ? t.teleNoticeMissedInstantTitle
        : t.teleNoticeMissedBookedTitle,
    body: noticeBody(
      mode === "instant"
        ? t.teleNoticeMissedInstantBody
        : t.teleNoticeMissedBookedBody,
    ),
    href: "/telepharmacy",
    dedupeKey: `consult-missed:${consultId}`,
  };
}

export function followUpNotice(t: Dict, consultId: string): Notice {
  return {
    kind: "consult_followup",
    category: "transactional",
    title: t.teleNoticeFollowUpTitle,
    body: noticeBody(t.teleNoticeFollowUpBody),
    href: "/telepharmacy#follow-up",
    dedupeKey: `consult-followup:${consultId}`,
  };
}
