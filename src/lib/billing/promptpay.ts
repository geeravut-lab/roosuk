/**
 * PromptPay helpers (docs/03-promptpay-qr.md). The QR image is drawn by
 * promptpay.io from the id and amount in the link, so there is no dependency —
 * and the amount is always embedded, so a payer cannot mistype it.
 */

/** Digits only: strips spaces, dashes and a leading "+66" the way people paste them. */
export function normalizePromptpayId(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+66")) return `0${digits.slice(3)}`.replace(/\D/g, "");
  return digits.replace(/\D/g, "");
}

/** Phone number (10), citizen / tax id (13) or e-wallet id (15) — same rule as the DB check. */
export function isValidPromptpayId(id: string): boolean {
  return /^(\d{10}|\d{13}|\d{15})$/.test(id);
}

export function promptpayQrUrl(
  id: string | null | undefined,
  amount: number,
): string | null {
  if (!id || !isValidPromptpayId(id)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `https://promptpay.io/${id}/${amount.toFixed(2)}`;
}

/** Shows the id with all but the last 4 digits hidden (QR is the real way to pay). */
export function maskPromptpayId(id: string): string {
  return id.length <= 4 ? id : `${"•".repeat(id.length - 4)}${id.slice(-4)}`;
}
