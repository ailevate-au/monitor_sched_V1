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

export default function ScreenWeather() {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [weatherAlertText, setWeatherAlertText] = useState("");
  const [affectedTasks, setAffectedTasks] = useState<AffectedTask[]>([]);
  const [rescheduleTask, setRescheduleTask] = useState<AffectedTask | null>(null);
  const [newDays, setNewDays] = useState("3");

  const loadWeatherData = () => {
    setLoading(true);
    // Fetch dashboard stats to read weather forecasts
    fetch("/api/v1/dashboard")
      .then(res => res.json())
      .then(data => {
        if (data.weatherAlert) {
          setForecast(data.weatherAlert.forecast || []);
          setWeatherAlertText(data.weatherAlert.text);
        }
      })
      .catch(err => console.error("Error loading weather forecast:", err));

    // Fetch affected tasks matching status weather
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
    loadWeatherData();
  }, []);

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
        loadWeatherData();
        alert(`Successfully re-scheduled and compensated task ${rescheduleTask.id} by ${offset} working days.`);
      })
      .catch(err => console.error("Error applying weather compensation:", err));
  };

  if (loading && forecast.length === 0) {
    return <div style={{ padding: 20, color: C.gray }}>Requesting real-time Bureau of Meteorology (BOM) radar data...</div>;
  }

  // Count active hazards
  const warningDays = forecast.filter(f => f.risk === "warn").length;
  const dangerDays = forecast.filter(f => f.risk === "danger").length;

  return (
    <div>
      {/* KPI Stats Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10, marginBottom:16 }}>
        <KpiCard label="Meteorological Watch" value={dangerDays > 0 ? "High Storm Alert" : "Stable Conditions"} valueColor={dangerDays > 0 ? C.red : C.green} sub="BOM New South Wales Radar Connection" />
        <KpiCard label="Severe Winds Setpoint" value="24 km/h" sub="Threshold: 45 km/h limit on tower cranes" />
        <KpiCard label="Inclement Rain Forecast" value="84mm rain accumulation" valueColor={warningDays > 0 ? C.amber : C.text} sub="Heavy cell Sydney (Wed – Thu)" />
        <KpiCard label="Active Site Warnings" value={`${warningDays + dangerDays} days`} valueColor={C.amber} sub="Automatic risk trigger assigned" />
      </div>

      {weatherAlertText && (
        <div style={{ background: C.redBg, border: `0.5px solid #FECACA`, borderRadius: 12, padding: "16px 20px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.redDark, fontWeight: 600 }}>
            <span style={{ fontSize: 18 }}>🚨</span>
            <span>BOM Dynamic Site Emergency Dispatch</span>
          </div>
          <p style={{ fontSize: 12.5, color: C.redDark, margin: 0, lineHeight: 1.5 }}>
            {weatherAlertText}. Concrete pours, high-angle rigging operations, and excavations must trigger strict EOT (Extension of Time) claims or safety stand-downs to avoid contract penalties.
          </p>
        </div>
      )}

      {/* Weather Forecast Details Grid */}
      <Card style={{ padding: "20px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>Bureau of Meteorology (BOM) — Sydney Metro 7-day Operational Outlook</div>
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
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Standard Operational Safety Thresholds (AS 3850/AS 2550)</div>
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
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>Audit Criterion: <strong style={{color: C.text}}>{thr.limit}</strong></div>
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
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Inclement Delay & Extension of Time (EOT) Management</div>
          <p style={{ fontSize: 12, color: C.gray, lineHeight: 1.5, margin: "0 0 12px 0" }}>
            Under standard commercial construction contracts (e.g., AS 4000-1997 Clause 34.2), the builder is entitled to claim cost-compensated Extensions of Time (EOT) when works are disrupted by wet weather beyond average historical meteorological averages.
          </p>
          <div style={{ background: "#F1F5F9", borderRadius: 8, padding: 12, borderLeft: `3px solid ${C.blue}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Contractual Process for Sarah Hughes:</div>
            <ul style={{ fontSize: 11, color: C.gray, margin: "6px 0 0 16px", padding: 0, lineHeight: 1.4 }}>
              <li>Record daily precipitation and wind gusts in site diary</li>
              <li>Re-schedule the affected task forward on the programme timeline</li>
              <li>Submit auditable baseline comparison reports to Superintendent</li>
            </ul>
          </div>
        </Card>
      </div>

      {/* Affected tasks & active Compensation Tool */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Active Tasks At Weather Delay Risk</span>
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
                      }}>Shift/EOT Compensate</Btn>
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
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>EOT Weather Compensation Tool</div>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 10 }}>
              Adjusting scheduled dates for: <strong style={{ color: C.text }}>{rescheduleTask.id} — {rescheduleTask.name}</strong>
            </div>

            <div style={{ background: C.amberBg, border: `0.5px solid #FCD34D`, borderRadius: 8, padding: "8px 12px", fontSize: 11, color: C.amber, marginBottom: 14 }}>
              * Under AS 4000 Section 34.2, this will submit a compensated working day shift to mitigate liquid damages exposure.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Inject EOT Delay Days (Working Days offset)</label>
              <input 
                type="number" 
                value={newDays} 
                onChange={e => setNewDays(e.target.value)} 
                style={{ width: "100%", fontSize: 12, padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.grayLight}` }}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Btn primary onClick={handleApplyReschedule}>Compensate & Reschedule</Btn>
              <Btn onClick={() => setRescheduleTask(null)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
