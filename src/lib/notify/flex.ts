import { parseNoticeBody, safeHref } from "./notice";

/**
 * The LINE card. A push shows up on a lock screen for someone who may not open
 * the app all day, so the card answers what / who / when on its own, and
 * `altText` (what the lock screen shows) carries the details too (docs/07).
 */
const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** The link a card button opens. openExternalBrowser=1 makes LINE open the phone's browser (the in-app one breaks some features). */
export function appOpenUrl(
  baseUrl: string,
  path: string | null,
  liffId?: string,
): string {
  const p = safeHref(path) ?? "/today";
  if (liffId) return `https://liff.line.me/${liffId}${p}`;
  const url = `${baseUrl.replace(/\/+$/, "")}${p}`;
  return `${url}${url.includes("?") ? "&" : "?"}openExternalBrowser=1`;
}

export interface LineTextMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

export function buildLineMessage(
  notice: { title: string; body: string; href: string | null },
  opts: { baseUrl: string; liffId?: string; openLabel: string },
): LineTextMessage {
  const parts = parseNoticeBody(notice.body).slice(0, 8);
  const body = parts.map((p) =>
    p.label
      ? {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            {
              type: "text",
              text: clip(p.label, 24),
              size: "sm",
              color: "#5B6B73",
              flex: 2,
              wrap: true,
            },
            {
              type: "text",
              text: clip(p.value, 120),
              size: "sm",
              color: "#1F2A30",
              flex: 4,
              wrap: true,
            },
          ],
        }
      : {
          type: "text",
          text: clip(p.value, 300),
          size: "sm",
          color: "#1F2A30",
          wrap: true,
        },
  );

  const altText = clip(
    parts.length
      ? `${notice.title} — ${parts.map((p) => (p.label ? `${p.label} ${p.value}` : p.value)).join(" · ")}`
      : notice.title,
    400,
  );

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: clip(notice.title, 100),
            weight: "bold",
            size: "md",
            color: "#07707F",
            wrap: true,
          },
          ...body,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#FF7A6B",
            action: {
              type: "uri",
              label: clip(opts.openLabel, 20),
              uri: appOpenUrl(opts.baseUrl, notice.href, opts.liffId),
            },
          },
        ],
      },
    },
  };
}
