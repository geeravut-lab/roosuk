import {
  CONSENT_ITEMS,
  POLICY_VERSION,
  REQUIRED_CONSENT_KEYS,
  type ConsentKey,
} from "@/config/legal";

export type ConsentItems = Record<ConsentKey, boolean>;

/** Checkbox inputs are named `consent_<key>`; unchecked boxes are simply absent from the form. */
export function parseConsentForm(
  formData: FormData,
): { ok: true; items: ConsentItems } | { ok: false } {
  const items = Object.fromEntries(
    CONSENT_ITEMS.map((i) => [
      i.key,
      formData.get(`consent_${i.key}`) === "on",
    ]),
  ) as ConsentItems;
  const allRequired = REQUIRED_CONSENT_KEYS.every((key) => items[key]);
  return allRequired ? { ok: true, items } : { ok: false };
}

export interface ConsentRecordLike {
  policy_version: string;
  items: Record<string, unknown>;
}

/** The user's latest consent counts only if it is for the current policy version and covers every required item. */
export function isConsentCurrent(
  record: ConsentRecordLike | null | undefined,
): boolean {
  if (!record || record.policy_version !== POLICY_VERSION) return false;
  return REQUIRED_CONSENT_KEYS.every((key) => record.items[key] === true);
}
