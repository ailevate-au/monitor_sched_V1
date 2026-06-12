/** Demo programme anchor for Dashboard/Claims/BOM context (not wall-clock today). */
export const PROGRAMME_TODAY = "2026-06-02";

export function parseProgrammeDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/** Wall-clock calendar date in the user's local timezone. */
export function todayLocalIso(): string {
  return localIsoDate(new Date());
}

/** Calendar date in local timezone (avoids UTC shift from `toISOString().slice(0, 10)`). */
export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
