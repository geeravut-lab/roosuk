import type { Dict } from "@/lib/i18n/dict";
import { noticeBody, type Notice } from "@/lib/notify/notice";

/** Sent to the person when an admin decides their review case. Plain facts, nothing about documents. */
export function ekycDecisionNotice(t: Dict, approved: boolean): Notice {
  return {
    kind: approved ? "ekyc_approved" : "ekyc_rejected",
    category: "transactional",
    title: approved ? t.ekycNoticeApprovedTitle : t.ekycNoticeRejectedTitle,
    body: noticeBody(
      approved ? t.ekycNoticeApprovedBody : t.ekycNoticeRejectedBody,
    ),
    href: "/verify",
    urgent: true,
  };
}
