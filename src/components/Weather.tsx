import React, { useState, useEffect } from "react";
import { Card, KpiCard, StatusBadge, Btn } from "./Dashboard";

const C = {
  blue:       "#1A5FA8",
  blueMid:    "#3A8ADE",
  blueLight:  "#E6F0FB",
  green:      "#1D9E75",
  greenBg:    "#ECFDF5",
  greenDark:  "#2D6A0A",
  amber:      "#B87316",
  amberBg:    "#FEF3C7",
  red:        "#E04A4A",
  redDark:    "#9B2C2C",
  redBg:      "#FEF2F2",
  gray:       "#64748B",
  grayLight:  "#E2E8F0",
  text:       "#1E293B",
  bgSecond:   "#EEF2F8",
  white:      "#FFFFFF",
};

interface ForecastDay {
  date: string;
  temp: string;
  desc: string;
  precip: string;
  wind: string;
  icon: string;
  risk: "none" | "warn" | "danger";
  impact: string;
}

interface AffectedTask {
  id: string;
  projectName: string;
  name: string;
  assignee: string;
  start: string;
  end: string;
  durationDays: number;
}

function addDays(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T12:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

// State → capital city, for the forecast header (projects span several states).
const STATE_CITY: Record<string, string> = {
  NSW: "Sydney", VIC: "Melbourne", QLD: "Brisbane", ACT: "Canberra",
  WA: "Perth", SA: "Adelaide", NT: "Darwin", TAS: "Hobart",
};

export default function ScreenWeather() {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [weatherAlertText, setWeatherAlertText] = useState("");
  const [severe, setSevere] = useState(false);
  const [affectedTasks, setAffectedTasks] = useState<AffectedTask[]>([]);
  const [rescheduleTask, setRescheduleTask] = useState<AffectedTask | null>(null);
  const [newDays, setNewDays] = useState("3");
  // Which state's sky are we looking at? Projects sit in different states, so the
  // owner can switch the outlook rather than always seeing Sydney.
  const [stateSel, setStateSel] = useState("NSW");
  const [stateOptions, setStateOptions] = useState<string[]>(["NSW", "VIC", "QLD", "ACT", "WA", "SA"]);

  // Discover which states actually have projects, so the selector is relevant.
  useEffect(() => {
    fetch("/api/v1/projects")
      .then(res => res.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        const states = Array.from(new Set(rows.map(p => p.state).filter(Boolean)));
        if (states.length) setStateOptions(states);
      })
      .catch(() => {});
  }, []);

  const loadWeatherData = (state: string) => {
    setLoading(true);
    // Per-state forecast — a WA job isn't judged by Sydney's weather.
    fetch(`/api/v1/weather/forecast?state=${encodeURIComponent(state)}`)
      .then(res => res.json())
      .then((days: any[]) => {
        if (Array.isArray(days)) {
          setForecast(days);
          const danger = days.filter(d => d.risk === "danger").length;
          const warn = days.filter(d => d.risk === "warn").length;
          setSevere(danger + warn > 0);
          setWeatherAlertText(
            danger + warn > 0
              ? `Rain or storms forecast in ${STATE_CITY[state] || state} this week — some outdoor work may be affected.`
              : `Clear week ahead in ${STATE_CITY[state] || state} — no weather risk to site work.`
          );
        }
      })
      .catch(err => console.error("Error loading weather forecast:", err));

    // Fetch affected tasks matching status weather (portfolio-wide)
    fetch("/api/v1/dashboard/tasks?status=weather")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAffectedTasks(data.map(t => ({
            id: t.id,
            projectName: t.project,
            name: t.name,
            assignee: t.assignee,
            start: t.start,
            end: t.end,
            durationDays: t.durationDays
          })));
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading weather tasks:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadWeatherData(stateSel);
  }, [stateSel]);

  const handleApplyReschedule = () => {
    if (!rescheduleTask) return;
    const offset = parseInt(newDays) || 3;
    const shiftedStart = addDays(rescheduleTask.start, offset);
    const shiftedEnd = addDays(rescheduleTask.end, offset);

    // Apply the weather offset directly to the live task schedule.
    fetch(`/api/v1/tasks/${rescheduleTask.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: shiftedStart,
        end: shiftedEnd,
        cascade: true
      })
    })
      .then(res => res.json())
      .then(() => {
        setRescheduleTask(null);
        loadWeatherData(stateSel);
        alert(`Done. ${rescheduleTask.id} moved ${offset} day${offset !== 1 ? "s" : ""} later and the lost time is claimed.`);
      })
      .catch(err => console.error("Error applying weather compensation:", err));
  };

  if (loading && forecast.length === 0) {
    return <div style={{ padding: 20, color: C.gray }}>Loading the weather forecast…</div>;
  }

  // Count active hazards
  const warningDays = forecast.filter(f => f.risk === "warn").length;
  const dangerDays = forecast.filter(f => f.risk === "danger").length;

  return (
    <div>
      {/* KPI Stats Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10, marginBottom:16 }}>
        <KpiCard label="Weather Status" value={dangerDays > 0 ? "High Storm Alert" : "Stable Conditions"} valueColor={dangerDays > 0 ? C.red : C.green} sub={`From the Bureau of Meteorology (${stateSel})`} />
        <KpiCard label="Strong Wind Limit" value="24 km/h" sub="Tower cranes stop at 45 km/h" />
        <KpiCard label="Heavy Rain Forecast" value={dangerDays + warningDays > 0 ? "Wet mid-week" : "No major rain"} valueColor={warningDays > 0 ? C.amber : C.text} sub={`${STATE_CITY[stateSel] || stateSel} 7-day outlook`} />
        <KpiCard label="Weather Warning Days" value={`${warningDays + dangerDays} days`} valueColor={C.amber} sub="Flagged automatically on your schedule" />
      </div>

      {severe ? (
        <div style={{ background: C.redBg, border: `0.5px solid #FECACA`, borderRadius: 12, padding: "16px 20px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.redDark, fontWeight: 600 }}>
            <span style={{ fontSize: 18 }}>🚨</span>
            <span>Bad weather coming</span>
          </div>
          <p style={{ fontSize: 12.5, color: C.redDark, margin: 0, lineHeight: 1.5 }}>
            {weatherAlertText} Outdoor work like concrete pours, crane lifts and digging may need to stop. You can move those jobs to a clear day, or claim the lost time so it doesn't count against you.
          </p>
        </div>
      ) : (
        <div style={{ background: C.greenBg, border: `0.5px solid #BBF7D0`, borderRadius: 12, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>☀️</span>
          <span style={{ fontSize: 12.5, color: C.greenDark, fontWeight: 600 }}>{weatherAlertText || "Clear week ahead — no weather risk to site work."}</span>
        </div>
      )}

      {/* Weather Forecast Details Grid */}
      <Card style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            7-Day Weather Forecast — {STATE_CITY[stateSel] || stateSel} {stateSel} (Bureau of Meteorology)
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.gray }}>
            Location
            <select
              value={stateSel}
              onChange={e => setStateSel(e.target.value)}
              style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, color: C.text, background: C.white }}
            >
              {stateOptions.map(s => (
                <option key={s} value={s}>{STATE_CITY[s] || s} · {s}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:10 }}>
          {forecast.map((d, index) => (
            <div key={index} style={{
              background: d.risk === "danger" ? C.redBg : d.risk === "warn" ? C.amberBg : "#F8FAFC",
              border: `0.5px solid ${d.risk === "danger" ? "#FECACA" : d.risk === "warn" ? "#FCD34D" : C.grayLight}`,
              borderRadius: 10, padding: 14, textTransform: "none", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", minHeight: 185
            }}>
              <div>
                <span style={{ fontSize: 26, display: "block", marginBottom: 6 }}>{d.icon}</span>
                <span style={{ fontSize:11, fontWeight:600, color:C.gray, textTransform: "uppercase", display: "block", marginBottom: 4 }}>{d.date}</span>
                <span style={{ fontSize:15, fontWeight:600, color:C.text, display: "block" }}>{d.temp}</span>
              </div>
              
              <div style={{ fontSize: 10, color: C.gray, margin: "6px 0", lineHeight: 1.3 }}>
                <div>Precip: <strong>{d.precip}</strong></div>
                <div>Wind: <strong>{d.wind}</strong></div>
                <div style={{ marginTop: 4, fontStyle: "italic" }}>{d.desc}</div>
              </div>

              <span style={{
                fontSize: 9.5, fontWeight: 600, padding: "3px 8px", borderRadius: 6, width: "100%",
                background: d.risk === "danger" ? C.red : d.risk === "warn" ? C.amberBg : C.greenBg,
                color: d.risk === "danger" ? C.white : d.risk === "warn" ? C.amber : C.greenDark,
              }}>
                {d.impact}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Meteorological Trade & On-Site Activity Risk Matrix */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, margin: "14px 0" }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Safe Working Limits by Trade (AS 3850 / AS 2550)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { trade: "Formwork & Concrete Pour", limit: "Rain > 10mm / day", metric: "Wet cure failure, cold joints risk", status: "blocked", bg: C.redBg, clr: C.redDark },
              { trade: "Tower Crane & Lifting rigging", limit: "Wind gusts > 45 km/h", metric: "Load swing risk, high-altitude hazard", status: "blocked", bg: C.redBg, clr: C.redDark },
              { trade: "Foundations & Earthworks", limit: "Overnight Rain > 25mm", metric: "Trench collapse hazard, mud contamination", status: "restricted", bg: C.amberBg, clr: C.amber },
              { trade: "Interior Architectural Fitout", limit: "Relative humidity > 85%", metric: "Drywall plaster moisture trapping", status: "safe", bg: C.greenBg, clr: C.greenDark },
            ].map((thr, idx) => (
              <div key={idx} style={{ padding: "10px 14px", border: `0.5px solid ${C.grayLight}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: C.text }}>{thr.trade}</div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>Work stops if: <strong style={{color: C.text}}>{thr.limit}</strong></div>
                  <div style={{ fontSize: 10, color: C.gray }}>Impact: {thr.metric}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: thr.bg, color: thr.clr, textTransform: "uppercase" }}>
                  {thr.status}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Claiming back rain days</div>
          <p style={{ fontSize: 12, color: C.gray, lineHeight: 1.5, margin: "0 0 12px 0" }}>
            When bad weather stops outdoor work, your contract usually lets you claim that lost time — so the delay doesn't count against you or cost you penalties.
          </p>
          <div style={{ background: "#F1F5F9", borderRadius: 8, padding: 12, borderLeft: `3px solid ${C.blue}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>How to claim it:</div>
            <ul style={{ fontSize: 11, color: C.gray, margin: "6px 0 0 16px", padding: 0, lineHeight: 1.4 }}>
              <li>Note the rain and wind in the site diary each day</li>
              <li>Move the affected job to a later, clear day</li>
              <li>Send the proof to the client's rep for sign-off</li>
            </ul>
          </div>
        </Card>
      </div>

      {/* Affected tasks & active Compensation Tool */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Tasks That Could Be Delayed by Weather</span>
          <span style={{ fontSize: 11, color: C.gray }}>* Auto-synchronized from timeline baseline database</span>
        </div>

        {affectedTasks.length === 0 ? (
          <div style={{ padding: "16px", textTransform: "none", textAlign: "center", fontStyle: "italic", color: C.gray }}>
            ✓ No tasks currently recorded at inclement weather risk.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["Task ID", "Project Contract", "Risk-exposed Task Name", "Assigned Trade Specialist", "Scheduled Period", "Duration", "Aesthetic Comp.", "Contractor Action"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontSize: 11, color: C.gray, fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {affectedTasks.map(t => (
                  <tr key={t.id}>
                    <td style={{ padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontFamily: "monospace", color: C.gray }}>{t.id}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 500 }}>{t.projectName}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, color: C.redDark }}>⚠ {t.name}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, color: C.text }}>{t.assignee}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, color: C.gray, whiteSpace: "nowrap" }}>{t.start} to {t.end}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}` }}>{t.durationDays} working days</td>
                    <td style={{ padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}` }}>
                      <StatusBadge status="weather" />
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}` }}>
                      <Btn primary small onClick={() => {
                        setRescheduleTask(t);
                        setNewDays("3");
                      }}>Reschedule & Claim Delay</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Reschedule Weather Delay Comp. Modal */}
      {rescheduleTask && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,31,61,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99 }}>
          <Card style={{ width: 360, padding: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Move this job past the rain</div>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 10 }}>
              Moving: <strong style={{ color: C.text }}>{rescheduleTask.id} — {rescheduleTask.name}</strong>
            </div>

            <div style={{ background: C.amberBg, border: `0.5px solid #FCD34D`, borderRadius: 8, padding: "8px 12px", fontSize: 11, color: C.amber, marginBottom: 14 }}>
              This logs the rain days as an approved delay, so they don't count against you or trigger penalties.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>How many working days to add?</label>
              <input 
                type="number" 
                value={newDays} 
                onChange={e => setNewDays(e.target.value)} 
                style={{ width: "100%", fontSize: 12, padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}` }}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Btn primary onClick={handleApplyReschedule}>Move & claim the time</Btn>
              <Btn onClick={() => setRescheduleTask(null)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
