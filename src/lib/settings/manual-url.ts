/**
 * The admin-set link to the user guide (a PDF or page on a cloud drive/site).
 * Only a plain https address is accepted — no credentials in it, no script or
 * data URLs — because every signed-in person is sent there when they tap the menu.
 * Empty clears it (the menu entry then shows greyed out). The database repeats the
 * https check; this gives the admin a readable reason.
 */
export const MANUAL_URL_MAX = 500;

export function parseManualUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v === "") return "";
  if (v.length > MANUAL_URL_MAX || /\s/.test(v)) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".")) return null;
  return url.href;
}
