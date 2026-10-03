import { addDays } from "./dates";

export interface Streak {
  /** Consecutive checked-in days ending today — or yesterday, while today is still open. */
  current: number;
  /** Longest run within the dates given. */
  best: number;
  checkedToday: boolean;
}

/**
 * Bio-streak: counts days of showing up, nothing else (consistency over
 * appearance). A streak is still alive until today ends, so not having checked
 * in yet today does not break it.
 */
export function computeStreak(dates: readonly string[], today: string): Streak {
  const set = new Set(dates);
  const checkedToday = set.has(today);

  let cursor = checkedToday ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue; // not the start of a run
    let len = 0;
    for (let c = d; set.has(c); c = addDays(c, 1)) len++;
    best = Math.max(best, len);
  }
  return { current, best, checkedToday };
}

/** Which of the last `n` days (oldest → today) were checked in — for the dots. */
export function recentDays(
  dates: readonly string[],
  today: string,
  n = 7,
): { date: string; done: boolean }[] {
  const set = new Set(dates);
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1));
    return { date, done: set.has(date) };
  });
}
