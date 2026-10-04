/**
 * Feature switches (docs/09-feature-flags.md). The list lives in code, the
 * values in the DB, and only DISABLED flags are stored — a missing key means
 * "on", so adding a flag can never switch off something already shipped.
 */
export const FEATURE_FLAGS = [
  "food_scan",
  "lab_scan",
  "body_scan",
  "health_agent",
  "wearables",
  "family",
  "marketplace",
  "booking",
  "voice",
  "checkup_lead",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FlagMap = Partial<Record<FeatureFlag, boolean>>;

export function isFeatureFlag(value: unknown): value is FeatureFlag {
  return (
    typeof value === "string" &&
    (FEATURE_FLAGS as readonly string[]).includes(value)
  );
}

export function isEnabled(
  flags: FlagMap | undefined,
  flag: FeatureFlag,
): boolean {
  return flags?.[flag] !== false;
}

/** Keep only known flags that are explicitly off; drop anything else found in the DB. */
export function normalizeFlags(raw: unknown): FlagMap {
  const out: FlagMap = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      if (isFeatureFlag(key) && value === false) out[key] = false;
    }
  }
  return out;
}

/** Apply a toggle: turning ON deletes the key, turning OFF writes `false`. */
export function withFlag(
  flags: FlagMap,
  flag: FeatureFlag,
  enabled: boolean,
): FlagMap {
  const next = { ...flags };
  if (enabled) delete next[flag];
  else next[flag] = false;
  return next;
}
