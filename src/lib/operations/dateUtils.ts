/**
-- ==============================================================================
-- OPERATIONS DATE & TIMEZONE UTILITY (ASIA/KOLKATA)
-- File: src/lib/operations/dateUtils.ts
-- ==============================================================================
-- Enforces:
-- 1. Asia/Kolkata (IST = UTC+05:30) as canonical business operations timezone.
-- 2. Half-open intervals: [startOfTodayIST, startOfTomorrowIST) for due today.
-- 3. Zero reliance on 23:59:59.999 boundary hacks.
-- 4. Pure, deterministic boundary calculations for testing and live queries.
-- ==============================================================================
*/

export type FollowupState =
  | 'today'
  | 'overdue'
  | 'tomorrow'
  | 'upcoming'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

export interface KolkataHalfOpenRange {
  startOfTodayIST: string; // ISO string with +05:30
  startOfTomorrowIST: string; // ISO string with +05:30
  startOfDayAfterTomorrowIST: string; // ISO string with +05:30
  todayDateStr: string; // YYYY-MM-DD
  tomorrowDateStr: string; // YYYY-MM-DD
}

/**
 * Computes calendar date string (YYYY-MM-DD) in Asia/Kolkata timezone.
 */
export function getKolkataDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Returns half-open boundaries for Today, Tomorrow, and Day-after in Asia/Kolkata.
 * Format: ISO timestamp representing 00:00:00.000+05:30 for each calendar day.
 */
export function getKolkataTodayHalfOpenRange(refDate: Date = new Date()): KolkataHalfOpenRange {
  const todayDateStr = getKolkataDateString(refDate);

  // Parse YYYY, MM, DD
  const [y, m, d] = todayDateStr.split("-").map(Number);

  // In UTC, IST is UTC + 5h 30m.
  // 00:00:00 IST on YYYY-MM-DD corresponds to Date.UTC(y, m - 1, d, 0, 0, 0) - (5.5 * 3600 * 1000)
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

  const todayStartUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS;
  const tomorrowStartUtcMs = todayStartUtcMs + 24 * 60 * 60 * 1000;
  const dayAfterStartUtcMs = tomorrowStartUtcMs + 24 * 60 * 60 * 1000;

  const startOfTodayIST = new Date(todayStartUtcMs).toISOString();
  const startOfTomorrowIST = new Date(tomorrowStartUtcMs).toISOString();
  const startOfDayAfterTomorrowIST = new Date(dayAfterStartUtcMs).toISOString();

  const tomorrowDateStr = getKolkataDateString(new Date(tomorrowStartUtcMs));

  return {
    startOfTodayIST,
    startOfTomorrowIST,
    startOfDayAfterTomorrowIST,
    todayDateStr,
    tomorrowDateStr,
  };
}

/**
 * Classifies an open or terminal follow-up into an operational state.
 */
export function classifyFollowupState(
  followUpAtStr: string,
  status: string,
  refDate: Date = new Date()
): FollowupState {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'rescheduled') return 'rescheduled';

  const range = getKolkataTodayHalfOpenRange(refDate);
  const followUpEpoch = new Date(followUpAtStr).getTime();
  const todayStartEpoch = new Date(range.startOfTodayIST).getTime();
  const tomorrowStartEpoch = new Date(range.startOfTomorrowIST).getTime();
  const dayAfterStartEpoch = new Date(range.startOfDayAfterTomorrowIST).getTime();

  if (followUpEpoch < todayStartEpoch) {
    return 'overdue';
  } else if (followUpEpoch >= todayStartEpoch && followUpEpoch < tomorrowStartEpoch) {
    return 'today';
  } else if (followUpEpoch >= tomorrowStartEpoch && followUpEpoch < dayAfterStartEpoch) {
    return 'tomorrow';
  } else {
    return 'upcoming';
  }
}

/**
 * Formats a TIMESTAMPTZ into an Asia/Kolkata human readable string.
 */
export function formatKolkataDateTime(dateStr?: string | null): string {
  if (!dateStr) return "Not set";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Computes date offset (e.g. +7 days, +30 days, +60 days) in Asia/Kolkata.
 */
export function getKolkataFutureDateString(daysAhead: number, refDate: Date = new Date()): string {
  const range = getKolkataTodayHalfOpenRange(refDate);
  const [y, m, d] = range.todayDateStr.split("-").map(Number);
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const targetUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS + (daysAhead * 24 * 60 * 60 * 1000);
  return getKolkataDateString(new Date(targetUtcMs));
}
