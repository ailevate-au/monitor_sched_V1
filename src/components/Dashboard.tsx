import React, { useState, useEffect } from "react";
import { Task } from "../types";

const C = {
  navy:       "#0F1F3D",
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
  purple:     "#7F77DD",
  gray:       "#64748B",
  grayLight:  "#E2E8F0",
  text:       "#1E293B",
  textMuted:  "#64748B",
  bg:         "#F4F7FC",
  bgSecond:   "#EEF2F8",
  white:      "#FFFFFF",
};

export const StatusBadge = ({ status }: { status: string }) => {
  const map: { [key: string]: { bg: string; color: string; label: string; icon: string | null } } = {
    conflict:   { bg: C.redBg,    color: C.redDark,  label: "Conflict",     icon: "⚠" },
    fragile:    { bg: C.amberBg,  color: C.amber,    label: "Fragile Spot", icon: "⚡" },
    weather:    { bg: "#EFF6FF",  color: "#1D4ED8",  label: "Weather Risk", icon: "🌧" },
    overdue:    { bg: C.redBg,    color: C.redDark,  label: "Overdue",      icon: "🔴" },
    inprogress: { bg: C.blueLight,color: C.blue,     label: "In Progress",  icon: null },
    completed:  { bg: C.greenBg,  color: C.greenDark,label: "Completed",    icon: "✓" },
    scheduled:  { bg: C.bgSecond, color: C.gray,     label: "Scheduled",    icon: null },
    active:     { bg: C.blueLight,color: C.blue,     label: "Active",       icon: null },
    practical:  { bg: "#F0EEFF",  color: "#4A3DB0",  label: "Practical Completion", icon: null },
    pending:    { bg: C.amberBg,  color: C.amber,    label: "Pending Cert.",icon: null },
    certified:  { bg: C.greenBg,  color: C.greenDark,label: "Certified",    icon: "✓" },
    released:   { bg: "#F0EEFF",  color: "#4A3DB0",  label: "Retention Released", icon: null },
    ok:         { bg: C.greenBg,  color: C.greenDark,label: "On Track",     icon: null },
  };
  const s = map[status] || map.scheduled;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:3,
      fontSize:11, fontWeight:500, padding:"2px 8px", borderRadius:8,
      background:s.bg, color:s.color, whiteSpace:"nowrap",
    }}>
      {s.icon && <span style={{fontSize:10}}>{s.icon}</span>}
      {s.label}
    </span>
  );
};

export const KpiCard = ({ label, value, sub, trend, valueColor }: { label: string; value: string; sub?: string; trend?: string; valueColor?: string }) => (
  <div style={{ background:C.white, border:`0.5px solid ${C.grayLight}`, borderRadius:12, padding:"16px 18px", boxShadow:"0 1px 3px rgba(0,0,0,0.02)" }}>
    <div style={{ fontSize:11, color:C.gray, marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</div>
    <div style={{ fontSize:23, fontWeight:600, color:valueColor||C.text, lineHeight:1.1 }}>{value}</div>
    {sub   && <div style={{ fontSize:11, color:C.textMuted, marginTop:5 }}>{sub}</div>}
    {trend && <div style={{ fontSize:11, marginTop:5, fontWeight:600, color:trend.startsWith("+") || trend.includes("over") ? C.red : C.green }}>{trend}</div>}
  </div>
);

export const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background:C.white, border:`0.5px solid ${C.grayLight}`, borderRadius:12, padding:18, marginBottom:14, ...style }}>
    {children}
  </div>
);

export const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, width: "100%" }}>
    <span style={{ fontSize:13, fontWeight:600, color:C.navy }}>{title}</span>
    {right}
  </div>
);

export const Btn = ({ children, primary, small, danger, onClick, style, disabled, title }: { children: React.ReactNode; primary?: boolean; small?: boolean; danger?: boolean; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; style?: React.CSSProperties; disabled?: boolean; title?: string }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    display:"inline-flex", alignItems:"center", gap:5,
    padding: small ? "4px 10px" : "6px 12px",
    borderRadius:8, border:`0.5px solid ${primary ? C.blue : danger ? C.red : C.grayLight}`,
    background: primary ? C.blue : danger ? C.red : C.white,
    color: primary||danger ? C.white : C.text,
    fontSize:12, fontWeight:500, cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit",
    opacity: disabled ? 0.6 : 1,
    ...style,
  }}>
    {children}
  </button>
);

export default function ScreenDashboard({ onNav }: { onNav: (sc: string) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = () => {
    // 1. Fetch KPI stats
    fetch("/api/v1/dashboard")
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error("Error loading stats:", err));

    // 2. Fetch PM notifications
    fetch("/api/v1/pm/alerts")
      .then(res => res.json())
      .then(data => setAlerts(data))
      .catch(() => {});
  };

  useEffect(() => {
    loadDashboardData();
    fetch("/api/v1/projects")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setProjectOptions(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/dashboard/tasks?status=${statusFilter}&project=${projectFilter}`)
      .then(res => res.json())
      .then(data => {
        setTasks(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading tasks:", err);
        setLoading(false);
      });
  }, [statusFilter, projectFilter]);

  const handleApproveExtension = (alertItem: any) => {
    const task = tasks.find(t => t.id === alertItem.taskId);
    if (!task) {
      alert("Associated task details not found inside registry.");
      return;
    }
    
    // Call server update with start & projectedCompletion and cascade = true (Rule 1 Cascade!)
    fetch(`/api/v1/tasks/${task.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: task.start,
        end: alertItem.projectedCompletion,
        cascade: true
      })
    })
      .then(res => res.json())
      .then(() => {
        // Now resolve/dismiss the alert from database
        return fetch(`/api/v1/pm/alerts/${alertItem.id}/resolve`, {
          method: "POST"
        });
      })
      .then(() => {
        alert(`Rule 1 cascade triggered successfully. ${task.id} extended to ${alertItem.projectedCompletion}. Downstream linkages shifted.`);
        loadDashboardData();
        // Refresh tasks
        fetch(`/api/v1/dashboard/tasks?status=${statusFilter}&project=${projectFilter}`)
          .then(res => res.json())
          .then(data => setTasks(data));
      })
      .catch(err => {
        console.error("Error extending task via dashboard action", err);
      });
  };

  const handleDismissAlert = (alertId: string) => {
    fetch(`/api/v1/pm/alerts/${alertId}/resolve`, {
      method: "POST"
    })
      .then(() => {
        loadDashboardData();
      })
      .catch(() => {});
  };

  if (!stats) {
    return <div style={{ padding: 20, color: C.gray }}>Loading dashboard…</div>;
  }

  // Filter tasks that are At Risk using exact mathematics: (reported_pct / days_elapsed) < (100 / total_days) * 0.8
  const atRiskTasks = tasks.filter(t => {
    if (t.percent_complete === 100) return false;
    const s = new Date(t.start);
    const e = new Date(t.end);
    const total_duration_days = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 3600 * 24)));
    let days_elapsed = Math.round((new Date("2026-06-02").getTime() - s.getTime()) / (1000 * 3600 * 24));
    if (days_elapsed < 0) return false;
    if (days_elapsed === 0) days_elapsed = 1;
    const pctValue = t.percent_complete || 0;
    return (pctValue / days_elapsed) < (100 / total_duration_days) * 0.8;
  });

  const computeAtRiskMetrics = (t: any) => {
    const s = new Date(t.start);
    const e = new Date(t.end);
    const total_duration_days = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 3600 * 24)));
    let days_elapsed = Math.round((new Date("2026-06-02").getTime() - s.getTime()) / (1000 * 3600 * 24));
    if (days_elapsed < 1) days_elapsed = 1;
    const pctValue = t.percent_complete || 0;
    const expected = Math.min(100, Math.round((days_elapsed / total_duration_days) * 100));
    const delay = Math.max(1, Math.round(days_elapsed - (pctValue / 100) * total_duration_days));
    return {
      expected,
      reported: pctValue,
      delayDays: delay,
      projectName: (t.project || t.projectId || "").split(" —")[0]
    };
  };

  return (
    <div>
      {/* HERO: Resource Conflict Alert — shown prominently when conflicts exist */}
      {stats.resourceConflictsCount > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #FEF2F2 0%, #FFF5F5 100%)",
          border: `1.5px solid #FECACA`,
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow: "0 4px 16px rgba(224,74,74,0.10)",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", background: C.redBg,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0,
            border: `1.5px solid #FECACA`,
          }}>⚠️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.redDark, marginBottom: 3 }}>
              {stats.resourceConflictsCount} Resource Conflict{stats.resourceConflictsCount > 1 ? "s" : ""} Require Your Attention
            </div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
              One or more team members are double-booked across projects. SiteWize has identified replacements — resolve now to keep your programme on track.
            </div>
          </div>
          <Btn primary onClick={() => onNav("conflicts")} style={{ flexShrink: 0, padding: "9px 18px", fontSize: 12.5, fontWeight: 700 }}>
            Fix Now →
          </Btn>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:10, marginBottom:16 }}>
        <KpiCard label="Active Projects" value={stats.activeProjectsCount} sub="NSW, VIC & QLD Operations" />
        <KpiCard label="On Programme Pace" value={`${stats.onProgrammePct}%`} valueColor={C.green} trend="↑ +5% vs previous fortnight" />
        <KpiCard label="Active Conflicts" value={stats.resourceConflictsCount} valueColor={C.red} sub="Conflicts requires PM reassignment" />
        <KpiCard label="Workplace LTI-free days" value={stats.whsLtiFreeDays} valueColor={C.greenDark} sub="No registered site accidents" />
      </div>

      {/* Overdue Alert banner */}
      <div style={{ background:C.redBg, border:`0.5px solid #FECACA`, borderRadius:8, padding:"9px 13px", marginBottom:14, display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.redDark }}>
        <span>🔴</span>
        <span><strong>Workplace Action Plan:</strong> Excavation on Victoria Harbour has passed PC deadline. Progress claim certification recommended.</span>
        <Btn small danger onClick={() => onNav("claims")} style={{ marginLeft:"auto" }}>Verify Claim</Btn>
      </div>

      {/* FIXED 8 — DASHBOARD: AT-RISK TASKS BASELINE BREAKDOWN */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.grayLight}`, paddingBottom: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.redDark, display: "flex", alignItems: "center", gap: 6 }}>
            <span>⚠️</span> Task Schedule Baseline Watchlist ("At Risk")
          </span>
          <span style={{ fontSize: 11, fontStyle: "italic", color: C.gray }}>Formula: progress intensity &lt; 80% baseline speed</span>
        </div>
        {atRiskTasks.length === 0 ? (
          <div style={{ padding: 12, fontSize: 11.5, color: C.gray, fontStyle: "italic" }}>
            ✓ All active programmed tasks are performing within target baseline schedule constraints.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["Task ID", "Task Name", "Project", "Assigned To", "Expected %", "Reported %", "Est. Delay (days)"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: C.gray, fontWeight: 600, borderBottom: `1px solid ${C.grayLight}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {atRiskTasks.map(t => {
                  const m = computeAtRiskMetrics(t);
                  return (
                    <tr key={t.id} style={{ borderBottom: `0.5px solid ${C.grayLight}` }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: C.blue }}>{t.id}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 500, color: C.text }}>{t.name}</td>
                      <td style={{ padding: "8px 10px", color: C.gray }}>{m.projectName}</td>
                      <td style={{ padding: "8px 10px", color: C.text }}>{t.assignee || "Unassigned"}</td>
                      <td style={{ padding: "8px 10px", color: C.gray }}>{m.expected}%</td>
                      <td style={{ padding: "8px 10px", color: C.redDark, fontWeight: 600 }}>{m.reported}%</td>
                      <td style={{ padding: "8px 10px", color: C.red, fontWeight: 700 }}>+{m.delayDays} days</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* DELAY NOTIFICATIONS PANEL */}
      <div style={{ marginBottom: 16 }}>
        {/* Site Delay Notices Section (Improvement 5 & 6) */}
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span>📢</span> Subcontractor Site Alerts & Claims (Rule 2 Logs)
          </div>
          {alerts.length === 0 ? (
            <div style={{ padding: 12, background: "#F1F5F9", color: C.gray, borderRadius: 8, fontSize: 11.5 }}>
              No active delay warnings received from site resources.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
              {alerts.map(a => (
                <div key={a.id} style={{ background: a.type === "delay" ? C.amberBg : C.blueLight, border: `0.5px solid ${a.type === "delay" ? C.amber : C.blueMid}`, borderRadius: 8, padding: "10px", fontSize: 11.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: a.type === "delay" ? C.amber : C.blue }}>
                      {a.type === "delay" ? "🚨 DELAY INCIDENT FILED" : "📝 STATUS UPDATE"}
                    </span>
                    <span style={{ fontSize: 9, color: C.gray }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.text, lineHeight: 1.4, marginBottom: 6 }}>{a.message}</div>
                  
                  {a.type === "delay" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button 
                        onClick={() => handleApproveExtension(a)}
                        style={{ background: C.green, color: C.white, border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                      >
                        ✓ Approve Date Extension & Waterfall (Rule 1)
                      </button>
                      <button 
                        onClick={() => handleDismissAlert(a.id)}
                        style={{ background: "transparent", color: C.red, border: `0.5px solid ${C.red}`, borderRadius: 4, padding: "3.5px 8px", fontSize: 10, cursor: "pointer", fontWeight:600 }}
                      >
                        ✕ Dismiss
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleDismissAlert(a.id)}
                      style={{ background: "transparent", color: C.gray, border: `0.5px solid ${C.grayLight}`, borderRadius: 4, padding: "2px 6px", fontSize: 10, cursor: "pointer" }}
                    >
                      Acknowledge Log
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Task Table */}
      <Card>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize:13, fontWeight:600, color:C.text }}>Portfolio Trade Breakdown & Progress Audit</span>
          <div style={{ display:"flex", gap:6 }}>
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)}
              style={{ fontSize:12, padding:"5px 10px", borderRadius:8, border:`0.5px solid ${C.grayLight}`, background:C.white, color:C.text, fontFamily:"inherit" }}
            >
              <option value="all">All Statuses</option>
              <option value="conflict">Conflict</option>
              <option value="fragile">Fragile Spot</option>
              <option value="weather">Weather Risk</option>
              <option value="overdue">Overdue</option>
              <option value="inprogress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
            <select 
              value={projectFilter} 
              onChange={e => setProjectFilter(e.target.value)}
              style={{ fontSize:12, padding:"5px 10px", borderRadius:8, border:`0.5px solid ${C.grayLight}`, background:C.white, color:C.text, fontFamily:"inherit" }}
            >
              <option value="all">All Projects</option>
              {projectOptions.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["ID","Task Name","Project Contract","Assigned To","Trade","Start Date","End Date","Duration","Dependencies","Status"].map(h => (
                  <th key={h} style={{ textAlign:"left", fontWeight:500, color:C.gray, padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, fontSize:11, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: 20, color: C.gray }}>Refreshing schedules...</td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: 20, color: C.gray }}>No tasks match selected filter criteria.</td>
                </tr>
              ) : (
                tasks.map(t => (
                  <tr key={t.id} style={{ background: t.status === "overdue" ? "#FEF5F5" : "transparent" }}>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, fontFamily:"monospace", fontSize:11, color:C.gray }}>{t.id}</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, fontWeight:500, color:C.text }}>{t.name}</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.text }}>{t.project}</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.text }}>{t.assignee}</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.gray }}>{t.trade}</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.text, whiteSpace:"nowrap" }}>{t.start}</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.text, whiteSpace:"nowrap" }}>{t.end}</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.text }}>{t.durationDays}d</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.gray, fontFamily:"monospace", fontSize:11 }}>{t.dependencies}</td>
                    <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}` }}><StatusBadge status={t.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Weather forecast strip at the bottom */}
      <div style={{ marginTop: 24, padding: "16px 18px", background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize:12, fontWeight:600, color:C.text, textTransform:"uppercase", letterSpacing:"0.05em", display:"flex", alignItems:"center", gap:6 }}>
            🌧 Bureau of Meteorology — AU NSW 7-Day Operational Summary
          </span>
          <Btn small onClick={() => onNav("weather")}>Analyze Weather Risks & EOT claims →</Btn>
        </div>
        <div style={{ display:"flex", gap:10, overflowX: "auto", paddingBottom: 4 }}>
          {stats.weatherAlert.forecast.map((d: any, i: number) => (
            <div key={i} style={{
              flex: 1, minWidth: 90, background: d.risk === "danger" ? C.redBg : d.risk === "warn" ? C.amberBg : "#F8FAFC",
              border:`0.5px solid ${d.risk === "danger" ? "#FECACA" : d.risk === "warn" ? "#FCD34D" : C.grayLight}`,
              borderRadius:8, padding:"10px 8px", textAlign:"center",
            }}>
              <div style={{ fontSize:16, marginBottom:2 }}>{d.icon}</div>
              <div style={{ fontSize:9, color:C.gray, marginBottom:2 }}>{d.date}</div>
              <div style={{ fontSize:12, fontWeight:500, color:C.text }}>{d.temp}</div>
              <div style={{
                fontSize:9, fontWeight:600, marginTop:4, padding:"1px 4px", borderRadius:4, display: "inline-block",
                background: d.risk === "danger" ? C.redBg : d.risk === "warn" ? C.amberBg : C.greenBg,
                color: d.risk === "danger" ? C.redDark : d.risk === "warn" ? C.amber : C.greenDark,
              }}>{d.impact}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
