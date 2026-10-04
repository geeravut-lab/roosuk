import { fmt, type Dict, type Lang } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import { noticeBody, type Notice } from "./notice";
import type { CheckupKind, ReminderKind } from "./rules";

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

/** To the admins: someone asked to be called back about a health check. */
export function leadNewNotice(
  t: Dict,
  leadId: string,
  interest: string,
  method: string,
): Notice {
  return {
    kind: "lead_new",
    category: "transactional",
    title: t.notifLeadTitle,
    body: noticeBody(interest, [[t.notifLabelContact, method]]),
    href: "/admin/leads",
    dedupeKey: `lead:${leadId}`,
  };
}

export function monthlyReportReadyNotice(
  t: Dict,
  month: string,
  monthLabel: string,
): Notice {
  return {
    kind: "monthly_report_ready",
    category: "reminder",
    title: fmt(t.notifReportTitle, { month: monthLabel }),
    body: noticeBody(t.notifReportBody),
    href: `/report?month=${month}`,
    dedupeKey: `report:${month}`,
  };
}

export function agentReminderNotice(t: Dict, text: string, id: string): Notice {
  return {
    kind: "agent_reminder",
    category: "reminder",
    title: t.notifAgentReminderTitle,
    body: noticeBody(text),
    href: "/agent",
    dedupeKey: `agent_reminder:${id}`,
  };
}

export function familyJoinedNotice(t: Dict, joinerId: string): Notice {
  return {
    kind: "family_joined",
    category: "transactional",
    title: t.notifFamilyJoinedTitle,
    body: noticeBody(t.notifFamilyJoinedBody),
    href: "/family",
    dedupeKey: `family_joined:${joinerId}`,
  };
}

export function shopOrderPaidNotice(
  t: Dict,
  orderNo: string,
  id: string,
): Notice {
  return {
    kind: "shop_order_paid",
    category: "transactional",
    title: fmt(t.notifShopPaidTitle, { no: orderNo }),
    body: noticeBody(t.notifShopPaidBody),
    href: `/shop/orders/${id}`,
    dedupeKey: `shop_paid:${id}`,
  };
}

export function shopOrderShippedNotice(
  t: Dict,
  orderNo: string,
  id: string,
  carrier: string | null,
  tracking: string | null,
): Notice {
  return {
    kind: "shop_order_shipped",
    category: "transactional",
    title: fmt(t.notifShopShippedTitle, { no: orderNo }),
    body: noticeBody(
      t.notifShopShippedBody,
      [
        carrier ? ([t.shopCarrier, carrier] as const) : null,
        tracking ? ([t.shopTracking, tracking] as const) : null,
      ].filter((r): r is readonly [string, string] => !!r),
    ),
    href: `/shop/orders/${id}`,
    dedupeKey: `shop_shipped:${id}`,
  };
}

export function shopOrderCancelledNotice(
  t: Dict,
  orderNo: string,
  id: string,
): Notice {
  return {
    kind: "shop_order_cancelled",
    category: "transactional",
    title: fmt(t.notifShopCancelledTitle, { no: orderNo }),
    body: noticeBody(t.notifShopCancelledBody),
    href: `/shop/orders/${id}`,
    dedupeKey: `shop_cancelled:${id}`,
  };
}

export function shopPaymentReviewNotice(t: Dict, orderNo: string): Notice {
  return {
    kind: "shop_payment_review",
    category: "transactional",
    title: fmt(t.notifShopReviewTitle, { no: orderNo }),
    body: noticeBody(t.notifShopReviewBody),
    href: "/admin/shop/orders",
    dedupeKey: `shop_review:${orderNo}`,
  };
}

export function streakLastCallNotice(
  t: Dict,
  streak: number,
  today: string,
): Notice {
  return {
    kind: "streak_last_call",
    category: "reminder",
    title: fmt(t.notifLastCallTitle, { n: streak }),
    body: noticeBody(t.notifLastCallBody),
    href: "/today/checkin",
    dedupeKey: `streaklast:${today}`,
  };
}

export function checkupReminderNotice(
  t: Dict,
  lang: Lang,
  kind: CheckupKind,
  labDate: string,
): Notice {
  const when = formatDate(lang, labDate);
  return {
    kind: kind === "annual" ? "checkup_annual" : "checkup_recheck",
    category: "reminder",
    title: kind === "annual" ? t.notifAnnualTitle : t.notifRecheckTitle,
    body: noticeBody(
      kind === "annual" ? t.notifAnnualBody : t.notifRecheckBody,
      [[t.notifLabelLastLab, when]],
    ),
    href: "/checkup-interest",
    dedupeKey: `checkup:${kind}:${labDate}`,
  };
}

/** Credit earned: for an invited friend who started showing up, or a finished challenge. */
export function rewardEarnedNotice(
  t: Dict,
  source: "referral" | "referee" | "challenge",
  amount: number,
  ref: string,
): Notice {
  const title =
    source === "referral"
      ? t.notifRewardReferral
      : source === "referee"
        ? t.notifRewardReferee
        : t.notifRewardChallenge;
  return {
    kind: "reward_earned",
    category: "transactional",
    title: fmt(title, { amount }),
    body: noticeBody(t.notifRewardBody),
    href: "/rewards",
    dedupeKey: `reward:${source}:${ref}`,
  };
}
