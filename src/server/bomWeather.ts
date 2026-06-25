/**
 * Bureau of Meteorology (BOM) API Forecast and Scheduling Risk Engine.
 * Demo build: forecasts are mocked PER STATE so a project in WA isn't judged by
 * Sydney's weather. The storm scenario (flipped by the demo controls) only hits
 * one state — NSW by default — so weather risk is scoped to where it actually is.
 */

export interface WeatherDay {
  date: string;       // e.g. "Mon 2 Jun"
  dateStr: string;    // "2026-06-02"
  icon: string;
  temp: string;
  desc: string;
  precip: string;
  wind: string;
  risk: "ok" | "warn" | "danger";
  impact: string;
}

const DATES: Array<{ date: string; dateStr: string }> = [
  { date: "Mon 2 Jun", dateStr: "2026-06-02" },
  { date: "Tue 3 Jun", dateStr: "2026-06-03" },
  { date: "Wed 4 Jun", dateStr: "2026-06-04" },
  { date: "Thu 5 Jun", dateStr: "2026-06-05" },
  { date: "Fri 6 Jun", dateStr: "2026-06-06" },
  { date: "Sat 7 Jun", dateStr: "2026-06-07" },
  { date: "Sun 8 Jun", dateStr: "2026-06-08" },
];

// Per-state baseline (typical early-June temps) so chips differ by location.
const STATE_BASE: Record<string, { temp: number; label: string }> = {
  NSW: { temp: 22, label: "Sydney" },
  VIC: { temp: 15, label: "Melbourne" },
  QLD: { temp: 26, label: "Brisbane" },
  ACT: { temp: 12, label: "Canberra" },
  WA:  { temp: 21, label: "Perth" },
  SA:  { temp: 17, label: "Adelaide" },
  NT:  { temp: 31, label: "Darwin" },
  TAS: { temp: 11, label: "Hobart" },
};
const DEFAULT_BASE = { temp: 20, label: "Site" };

// The storm scenario hits exactly one state, so a Perth job stays clear while a
// Sydney pour is flagged. Default NSW (where the demo's Parramatta job lives).
const STORM_STATE = "NSW";

const CLEAR_ICONS = ["☀️", "☀️", "⛅", "⛅", "🌤️", "☀️", "☀️"];
const CLEAR_DESCS = ["Clear", "Sunny", "Partly cloudy", "Partly cloudy", "Mostly fine", "Fine", "Fine"];

function clearWeek(state: string): WeatherDay[] {
  const base = STATE_BASE[state] || DEFAULT_BASE;
  return DATES.map((d, i) => ({
    ...d,
    icon: CLEAR_ICONS[i],
    temp: `${base.temp + (i % 3) - 1}°C`,
    desc: CLEAR_DESCS[i],
    precip: "0mm",
    wind: `${8 + (i % 3) * 4} km/h`,
    risk: "ok" as const,
    impact: "✓ Full day",
  }));
}

// Storm scenario for the affected state — a dramatic mid-week front.
function stormWeek(state: string): WeatherDay[] {
  const base = STATE_BASE[state] || DEFAULT_BASE;
  const pattern: Array<{ icon: string; desc: string; risk: WeatherDay["risk"]; impact: string; precip: string; wind: string; dTemp: number }> = [
    { icon: "☀️", desc: "Clear",        risk: "ok",     impact: "✓ Full day",      precip: "0mm",  wind: "10 km/h", dTemp: 2 },
    { icon: "⛅", desc: "Partly cloudy", risk: "ok",     impact: "✓ Full day",      precip: "2mm",  wind: "14 km/h", dTemp: 0 },
    { icon: "🌧️", desc: "Heavy rain",    risk: "warn",   impact: "⚠ Reduced ops",   precip: "32mm", wind: "28 km/h", dTemp: -5 },
    { icon: "⛈️", desc: "Storm · 40mm",  risk: "danger", impact: "✕ Site closure",  precip: "40mm", wind: "48 km/h", dTemp: -7 },
    { icon: "🌦️", desc: "Showers",       risk: "warn",   impact: "⚠ Reduced ops",   precip: "12mm", wind: "30 km/h", dTemp: -4 },
    { icon: "🌤️", desc: "Clearing",      risk: "ok",     impact: "✓ Full day",      precip: "3mm",  wind: "18 km/h", dTemp: -1 },
    { icon: "☀️", desc: "Fine",          risk: "ok",     impact: "✓ Full day",      precip: "0mm",  wind: "12 km/h", dTemp: 1 },
  ];
  return DATES.map((d, i) => ({
    ...d,
    icon: pattern[i].icon,
    temp: `${base.temp + pattern[i].dTemp}°C`,
    desc: pattern[i].desc,
    precip: pattern[i].precip,
    wind: pattern[i].wind,
    risk: pattern[i].risk,
    impact: pattern[i].impact,
  }));
}

// Storm on/off — flipped by the demo simulate / reset controls.
let stormScenario = false;
export function setStormScenario(on: boolean): void {
  stormScenario = on;
}
export function isStormScenario(): boolean {
  return stormScenario;
}

export function stateLabel(state: string): string {
  return (STATE_BASE[state] || DEFAULT_BASE).label;
}

export function knownStates(): string[] {
  return Object.keys(STATE_BASE);
}

/** 7-day outlook for a given state. Storm only applies to the affected state. */
export function getForecast(state: string = STORM_STATE): WeatherDay[] {
  return stormScenario && state === STORM_STATE ? stormWeek(state) : clearWeek(state);
}

/** Back-compat: default outlook (NSW) for callers that don't pass a state. */
export function getBOMForecast(state: string = STORM_STATE): WeatherDay[] {
  return getForecast(state);
}

/** Compact "current conditions" chip for a state — used on the Timeline rows. */
export function getWeatherChip(state: string): { icon: string; temp: string; desc: string; risk: WeatherDay["risk"] } {
  const fc = getForecast(state);
  // Show the worst risk day this week so a storm is visible at a glance.
  const worst = fc.reduce((acc, d) => {
    const rank = { ok: 0, warn: 1, danger: 2 } as const;
    return rank[d.risk] > rank[acc.risk] ? d : acc;
  }, fc[0]);
  const today = fc[0];
  return {
    icon: worst.risk === "ok" ? today.icon : worst.icon,
    temp: today.temp,
    desc: worst.risk === "ok" ? today.desc : worst.desc,
    risk: worst.risk,
  };
}

/** Chips for every known state — one round-trip for the Timeline. */
export function getWeatherSummary(): Record<string, { icon: string; temp: string; desc: string; risk: WeatherDay["risk"] }> {
  const out: Record<string, ReturnType<typeof getWeatherChip>> = {};
  for (const s of knownStates()) out[s] = getWeatherChip(s);
  return out;
}

/**
 * Does a task's date range intersect a high-risk rain/storm day in its state?
 * State-scoped so only jobs in the affected state are flagged.
 */
export function evaluateWeatherRisk(startStr: string, endStr: string, state: string = STORM_STATE): boolean {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const forecast = getForecast(state);

  for (const day of forecast) {
    if (day.risk === "danger" || day.risk === "warn") {
      const wDate = new Date(day.dateStr);
      if (wDate >= start && wDate <= end) {
        return true;
      }
    }
  }
  return false;
}
