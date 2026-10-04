import "server-only";
import type { WearableDay } from "@/lib/passport/passport";

/** Per-day wearable summaries for the last `days` days (filled in by the wearables module). */
export async function loadWearableDays(
  _today: string,
  _days: number,
): Promise<WearableDay[]> {
  return [];
}
