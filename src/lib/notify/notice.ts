/**
 * One notice text, used by the in-app inbox, the LINE card and (later) webhooks:
 * a summary line followed by "label: value" lines. Kept as plain text (not new
 * columns) so there is never a second source of truth (docs/07).
 */
export interface Notice {
  kind: string;
  title: string;
  /** Pre-built by noticeBody(). */
  body: string;
  /** An in-app path ("/subscription"), or null for none. */
  href: string | null;
  /** Queue this LINE message at most once per user per key. */
  dedupeKey?: string;
  /** Service messages follow the user's "service" switch; habit reminders need their opt-in. */
  category: "transactional" | "reminder";
  /** A result the user is waiting for: may use the LINE allowance held in reserve. */
  urgent?: boolean;
}

export function noticeBody(
  summary: string,
  rows: readonly (readonly [label: string, value: string])[] = [],
): string {
  return [summary, ...rows.map(([l, v]) => `${l}: ${v}`)]
    .filter((x) => x.trim().length > 0)
    .join("\n");
}

export interface NoticePart {
  label: string | null;
  value: string;
}

export function parseNoticeBody(body: string): NoticePart[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(": ");
      // Only a SHORT label before ": " counts, so ordinary sentences with a colon stay whole.
      return i > 0 && i <= 24
        ? { label: line.slice(0, i), value: line.slice(i + 2) }
        : { label: null, value: line };
    });
}

/** Only a path inside the app may become a link — never an external or protocol-relative URL. */
export function safeHref(href: string | null | undefined): string | null {
  return typeof href === "string" &&
    href.startsWith("/") &&
    !href.startsWith("//") &&
    href.length <= 300
    ? href
    : null;
}
