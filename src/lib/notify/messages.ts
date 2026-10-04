import { fmt, type Dict, type Lang } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { noticeBody, type Notice } from "./notice";
import type { ReminderKind } from "./rules";

/** Every notice is written in the RECIPIENT's language, not the language of whoever triggered it. */

export function checkinReminderNotice(
  t: Dict,
  kind: ReminderKind,
  streak: number,
): Notice {
  return {
    kind: "checkin_reminder",
    category: "reminder",
    title:
      kind === "streak"
        ? fmt(t.notifStreakTitle, { n: streak })
        : t.notifCheckinTitle,
    body: noticeBody(
      kind === "streak" ? t.notifStreakBody : t.notifCheckinBody,
    ),
    href: "/today/checkin",
  };
}

export function trialEndingNotice(
  t: Dict,
  lang: Lang,
  daysLeft: number,
  endsAt: Date,
): Notice {
  return {
    kind: "trial_ending",
    category: "transactional",
    title: fmt(t.notifTrialTitle, { days: daysLeft }),
    body: noticeBody(t.notifTrialBody, [
      [t.notifLabelEnds, formatDate(lang, endsAt)],
    ]),
    href: "/subscription",
    dedupeKey: `trial:${daysLeft}`,
  };
}

export function planExpiringNotice(
  t: Dict,
  lang: Lang,
  plan: string,
  daysLeft: number,
  endsAt: Date,
): Notice {
  return {
    kind: "plan_expiring",
    category: "transactional",
    title: fmt(t.notifPlanTitle, { plan, days: daysLeft }),
    body: noticeBody(t.notifPlanBody, [
      [t.notifLabelEnds, formatDate(lang, endsAt)],
    ]),
    href: "/subscription",
    dedupeKey: `plan:${endsAt.toISOString().slice(0, 10)}:${daysLeft}`,
  };
}

export function paymentPaidNotice(
  t: Dict,
  lang: Lang,
  paymentId: string,
  plan: string,
  until: Date | null,
): Notice {
  return {
    kind: "payment_paid",
    category: "transactional",
    urgent: true,
    title: t.notifPaidTitle,
    body: noticeBody(
      fmt(t.notifPaidBody, { plan }),
      until ? [[t.notifLabelUntil, formatDate(lang, until)]] : [],
    ),
    href: `/subscription/pay/${paymentId}`,
    dedupeKey: `payment:${paymentId}:paid`,
  };
}

export function paymentRejectedNotice(
  t: Dict,
  paymentId: string,
  note: string | null,
): Notice {
  return {
    kind: "payment_rejected",
    category: "transactional",
    urgent: true,
    title: t.notifRejectedTitle,
    body: noticeBody(
      t.notifRejectedBody,
      note ? [[t.notifLabelNote, note]] : [],
    ),
    href: `/subscription/pay/${paymentId}`,
    dedupeKey: `payment:${paymentId}:rejected:${Date.now()}`,
  };
}

export function paymentToReviewNotice(
  t: Dict,
  paymentId: string,
  plan: string,
  amount: number,
  ref: string,
): Notice {
  return {
    kind: "payment_review",
    category: "transactional",
    urgent: true,
    title: t.notifReviewTitle,
    body: noticeBody(`${plan} · ฿${amount.toLocaleString("en-US")}`, [
      [t.notifLabelRef, ref],
    ]),
    href: "/admin/payments",
    dedupeKey: `payment:${paymentId}:review:${Date.now()}`,
  };
}
