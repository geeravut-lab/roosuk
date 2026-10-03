const DAY_MS = 24 * 3600 * 1000;

/** The trial window starting `now`, as ISO timestamps for the database. */
export function trialWindow(
  now: Date,
  days: number,
): { startedAt: string; endsAt: string } {
  return {
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
  };
}
