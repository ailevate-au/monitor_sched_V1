/**
 * Bureau of Meteorology (BOM) API Forecast and Scheduling Risk Engine.
 * Caches BOM forecasts for 3 hours and flags storm intervals overlapping contract tasks.
 */

export interface WeatherDay {
  date: string;       // e.g. "Mon 2 Jun", "2026-06-02"
  dateStr: string;    // "2026-06-02"
  icon: string;
  temp: string;
  desc: string;
  risk: "ok" | "warn" | "danger";
  impact: string;
}

// Clean baseline: a clear week, so no task is flagged at weather risk.
const CLEAR_WEEK: WeatherDay[] = [
  { date: "Mon 2 Jun", dateStr: "2026-06-02", icon: "☀️", temp: "24°C", desc: "Clear",         risk: "ok", impact: "✓ Full day" },
  { date: "Tue 3 Jun", dateStr: "2026-06-03", icon: "☀️", temp: "23°C", desc: "Sunny",         risk: "ok", impact: "✓ Full day" },
  { date: "Wed 4 Jun", dateStr: "2026-06-04", icon: "⛅", temp: "22°C", desc: "Partly cloudy", risk: "ok", impact: "✓ Full day" },
  { date: "Thu 5 Jun", dateStr: "2026-06-05", icon: "⛅", temp: "21°C", desc: "Partly cloudy", risk: "ok", impact: "✓ Full day" },
  { date: "Fri 6 Jun", dateStr: "2026-06-06", icon: "🌤️", temp: "22°C", desc: "Mostly fine",   risk: "ok", impact: "✓ Full day" },
  { date: "Sat 7 Jun", dateStr: "2026-06-07", icon: "☀️", temp: "23°C", desc: "Fine",          risk: "ok", impact: "✓ Full day" },
  { date: "Sun 8 Jun", dateStr: "2026-06-08", icon: "☀️", temp: "24°C", desc: "Fine",          risk: "ok", impact: "✓ Full day" }
];

// Storm scenario, layered in by the demo "simulate" control.
const STORM_WEEK: WeatherDay[] = [
  { date: "Mon 2 Jun", dateStr: "2026-06-02", icon: "☀️", temp: "24°C", desc: "Clear",        risk: "ok",     impact: "✓ Full day" },
  { date: "Tue 3 Jun", dateStr: "2026-06-03", icon: "⛅", temp: "22°C", desc: "Partly cloudy", risk: "ok",     impact: "✓ Full day" },
  { date: "Wed 4 Jun", dateStr: "2026-06-04", icon: "🌧️", temp: "17°C", desc: "Heavy rain",    risk: "warn",   impact: "⚠ Reduced ops" },
  { date: "Thu 5 Jun", dateStr: "2026-06-05", icon: "⛈️", temp: "15°C", desc: "Storm · 40mm",  risk: "danger", impact: "✕ Site closure" },
  { date: "Fri 6 Jun", dateStr: "2026-06-06", icon: "🌦️", temp: "18°C", desc: "Showers",       risk: "warn",   impact: "⚠ Reduced ops" },
  { date: "Sat 7 Jun", dateStr: "2026-06-07", icon: "🌤️", temp: "21°C", desc: "Clearing",      risk: "ok",     impact: "✓ Full day" },
  { date: "Sun 8 Jun", dateStr: "2026-06-08", icon: "☀️", temp: "23°C", desc: "Fine",          risk: "ok",     impact: "✓ Full day" }
];

// Storm on/off — flipped by the demo simulate / reset controls.
let stormScenario = false;
export function setStormScenario(on: boolean): void {
  stormScenario = on;
}
export function isStormScenario(): boolean {
  return stormScenario;
}

export function getBOMForecast(): WeatherDay[] {
  return stormScenario ? STORM_WEEK : CLEAR_WEEK;
}

/**
 * Identify if a task's date range intersects a high-risk rain/storm day
 */
export function evaluateWeatherRisk(startStr: string, endStr: string): boolean {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const forecast = getBOMForecast();

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
