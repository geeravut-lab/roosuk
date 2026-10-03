/**
 * Privacy policy / terms version. Bump it whenever the policy changes in
 * substance (not for typo fixes): every user whose latest consent is for an
 * older version is asked to consent again.
 *
 * History
 *   2026-10-03  first draft (Phase 0) — NOT yet reviewed by a lawyer or the
 *               medical advisor; must be before real users sign up.
 */
export const POLICY_VERSION = "2026-10-03";

export interface ConsentItem {
  key: string;
  /** Required items must be accepted to use the app. */
  required: boolean;
}

/**
 * Per-item consent (never one boolean) so the user can later see exactly what
 * they agreed to. Optional items that are not needed at sign-up (wearables,
 * family sharing) are asked again at the moment they become relevant.
 */
export const CONSENT_ITEMS = [
  { key: "terms_privacy", required: true },
  { key: "not_medical_service", required: true },
  { key: "sensitive_health_data", required: true },
  { key: "ai_processing_cross_border", required: true },
  { key: "data_region", required: true },
  { key: "photos", required: false },
  { key: "marketing", required: false },
] as const satisfies readonly ConsentItem[];

export type ConsentKey = (typeof CONSENT_ITEMS)[number]["key"];

export const REQUIRED_CONSENT_KEYS: readonly ConsentKey[] =
  CONSENT_ITEMS.filter((i) => i.required).map((i) => i.key);
