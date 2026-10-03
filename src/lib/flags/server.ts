import "server-only";
import { AppError } from "@/lib/errors";
import { loadPlatformSettings } from "@/lib/settings/server";
import { isEnabled, type FeatureFlag, type FlagMap } from "./flags";

export async function getFlags(): Promise<FlagMap> {
  return (await loadPlatformSettings()).featureFlags;
}

export async function featureEnabled(flag: FeatureFlag): Promise<boolean> {
  return isEnabled(await getFlags(), flag);
}

/**
 * Hiding a button is not switching a feature off — the server action behind it
 * can still be called. Put this on the first line of every server action /
 * route handler that belongs to a feature.
 */
export async function assertFeature(flag: FeatureFlag): Promise<void> {
  if (!(await featureEnabled(flag))) throw new AppError("err_feature_off");
}
