import type { Lang } from "./dict";

const TIME_ZONE = "Asia/Bangkok";

// Thai uses the Buddhist calendar; asking Intl for a lone 2-digit year in Thai
// prepends the era, so callers needing a bare year should format the pieces
// they need (see docs/01-responsive-layout.md, "พ.ศ. 69").
function locale(lang: Lang): string {
  return lang === "en" ? "en-GB" : "th-TH-u-ca-buddhist";
}

export function formatDate(lang: Lang, value: Date | string | number): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(
  lang: Lang,
  value: Date | string | number,
): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
