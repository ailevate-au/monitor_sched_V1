/**
 * Australian Public Holidays per state for years 2025 and 2026.
 * Excludes weekends & calculates strict working days for contract schedules.
 */

// Format: 'YYYY-MM-DD'
type HolidayMap = { [year: number]: { [state: string]: Set<string> } };

const HOLIDAYS: HolidayMap = {
  2025: {
    NSW: new Set([
      "2025-01-01", // New Year's Day
      "2025-01-26", "2025-01-27", // Australia Day / Substitute
      "2025-04-18", // Good Friday
      "2025-04-19", // Easter Saturday
      "2025-04-20", // Easter Sunday
      "2025-04-21", // Easter Monday
      "2025-04-25", // Anzac Day
      "2025-06-09", // King's Birthday
      "2025-10-06", // Labour Day
      "2025-12-25", // Christmas Day
      "2025-12-26", // Boxing Day
    ]),
    VIC: new Set([
      "2025-01-01",
      "2025-01-26", "2025-01-27",
      "2025-03-10", // Labour Day (VIC)
      "2025-04-18", "2025-04-19", "2025-04-20", "2025-04-21",
      "2025-04-25",
      "2025-06-09", // King's Birthday
      "2025-09-26", // AFL Grand Final Friday
      "2025-11-04", // Melbourne Cup
      "2025-12-25", "2025-12-26",
    ]),
    QLD: new Set([
      "2025-01-01",
      "2025-01-26", "2025-01-27",
      "2025-04-18", "2025-04-19", "2025-04-20", "2025-04-21",
      "2025-04-25",
      "2025-05-05", // Labour Day (QLD)
      "2025-08-13", // Royal Queensland Show (Brisbane)
      "2025-10-06", // King's Birthday (QLD)
      "2025-12-25", "2025-12-26",
    ]),
    WA: new Set([
      "2025-01-01",
      "2025-01-26", "2025-01-27",
      "2025-03-03", // Labour Day (WA)
      "2025-04-18", "2025-04-21",
      "2025-04-25",
      "2025-06-02", // Western Australia Day
      "2025-09-29", // King's Birthday (WA)
      "2025-12-25", "2025-12-26",
    ]),
    SA: new Set([
      "2025-01-01",
      "2025-01-26", "2025-01-27",
      "2025-03-10", // Adelaide Cup
      "2025-04-18", "2025-04-21",
      "2025-04-25",
      "2025-06-09", // King's Birthday (SA)
      "2025-10-06", // Labour Day (SA)
      "2025-12-25", "2025-12-26",
    ]),
  },
  2026: {
    NSW: new Set([
      "2026-01-01",
      "2026-01-26",
      "2026-04-03", // Good Friday
      "2026-04-04", "2026-04-05", "2026-04-06", // Easter
      "2026-04-25", "2026-04-27", // Anzac Day substitute
      "2026-06-08", // King's Birthday
      "2026-10-05", // Labour Day
      "2026-12-25", "2026-12-28", // Christmas/Boxing substitutes
    ]),
    VIC: new Set([
      "2026-01-01",
      "2026-01-26",
      "2026-03-09", // Labour Day (VIC)
      "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06",
      "2026-04-25",
      "2026-06-08", // King's Birthday
      "2026-09-25", // AFL Grand Final Friday
      "2026-11-03", // Melbourne Cup
      "2026-12-25", "2026-12-28",
    ]),
    QLD: new Set([
      "2026-01-01",
      "2026-01-26",
      "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06",
      "2026-04-25",
      "2026-05-04", // Labour Day
      "2026-08-12", // Royal QLD Show
      "2026-10-05", // King's Birthday
      "2026-12-25", "2026-12-28",
    ]),
    WA: new Set([
      "2026-01-01",
      "2026-01-26",
      "2026-03-02", // Labour Day
      "2026-04-03", "2026-04-06",
      "2026-04-25",
      "2026-06-01", // WA Day
      "2026-09-28", // King's Birthday
      "2026-12-25", "2026-12-28",
    ]),
    SA: new Set([
      "2026-01-01",
      "2026-01-26",
      "2026-03-09", // Adelaide Cup
      "2026-04-03", "2026-04-06",
      "2026-04-25",
      "2026-06-08", // King's Birthday
      "2026-10-05", // Labour Day
      "2026-12-25", "2026-12-28",
    ]),
  },
};

/**
 * Normalise state format (e.g. Parramatta NSW -> NSW)
 */
function parseState(stateStr: string): string {
  const upper = stateStr.toUpperCase();
  if (upper.includes("NSW")) return "NSW";
  if (upper.includes("VIC")) return "VIC";
  if (upper.includes("QLD") || upper.includes("QUEENSLAND")) return "QLD";
  if (upper.includes("WA") || upper.includes("WESTERN")) return "WA";
  if (upper.includes("SA") || upper.includes("SOUTH AUSTRALIA")) return "SA";
  return "NSW"; // Default NSW
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDateKey(d: Date): string {
  const dLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return dLocal.toISOString().slice(0, 10);
}

/**
 * Check if given date is weekend or state holiday
 */
export function isWorkingDay(date: Date, stateStr: string): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) {
    return false; // Weekend
  }

  const normalizedState = parseState(stateStr);
  const year = date.getFullYear();
  const dateKey = formatDateKey(date);

  const yearHolidays = HOLIDAYS[year];
  if (yearHolidays && yearHolidays[normalizedState]) {
    if (yearHolidays[normalizedState].has(dateKey)) {
      return false; // Public Holiday
    }
  }

  return true;
}

/**
 * Add N working days to a start date, excluding weekends and state holidays
 */
export function addWorkingDays(start: Date, days: number, stateStr: string): Date {
  const date = new Date(start.getTime());
  let daysAdded = 0;

  if (days === 0) return date;

  // Let's increment or decrement working days
  const step = days > 0 ? 1 : -1;
  const target = Math.abs(days);

  while (daysAdded < target) {
    date.setDate(date.getDate() + step);
    if (isWorkingDay(date, stateStr)) {
      daysAdded++;
    }
  }

  return date;
}

/**
 * Compute the count of working days between two dates (inclusive)
 */
export function getWorkingDaysBetween(start: Date, end: Date, stateStr: string): number {
  if (start.getTime() > end.getTime()) {
    return 0;
  }
  const current = new Date(start.getTime());
  let workingDays = 0;

  while (current.getTime() <= end.getTime()) {
    if (isWorkingDay(current, stateStr)) {
      workingDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return workingDays;
}
