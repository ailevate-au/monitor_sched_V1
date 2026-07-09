import React, { useState, useEffect } from "react";
import { useAuth, visibleProjects as scopeProjects } from "../lib/auth";
import { AlertTriangle, Zap, CloudRain, Check, AlertCircle, Sun, CheckCircle2 } from "lucide-react";
import { C } from "../lib/theme";
import { toDollars } from "../lib/money";
import { CountPie, GroupedDollarBar, PieCard, ChartCard } from "./finance/financeCharts";

export const StatusBadge = ({ status }: { status: string }) => {
  const map: { [key: string]: { bg: string; color: string; label: string; icon: React.ReactNode } } = {
    conflict:   { bg: C.redBg,    color: C.redDark,  label: "Clash",        icon: <AlertTriangle size={11} /> },
    fragile:    { bg: C.amberBg,  color: C.amber,    label: "Tight handover", icon: <Zap size={11} /> },
    weather:    { bg: "#EFF6FF",  color: "#1D4ED8",  label: "Weather Risk", icon: <CloudRain size={11} /> },
    overdue:    { bg: C.redBg,    color: C.redDark,  label: "Overdue",      icon: <AlertCircle size={11} /> },
    inprogress: { bg: C.blueLight,color: C.blue,     label: "In Progress",  icon: null },
    completed:  { bg: C.greenBg,  color: C.greenDark,label: "Completed",    icon: <Check size={11} /> },
    scheduled:  { bg: C.bgSecond, color: C.gray,     label: "Scheduled",    icon: null },
    active:     { bg: C.blueLight,color: C.blue,     label: "Active",       icon: null },
    practical:  { bg: "#F0EEFF",  color: "#4A3DB0",  label: "Practical Completion", icon: null },
    pending:    { bg: C.amberBg,  color: C.amber,    label: "Pending Cert.",icon: null },
    certified:  { bg: C.greenBg,  color: C.greenDark,label: "Certified",    icon: <Check size={11} /> },
    released:   { bg: "#F0EEFF",  color: "#4A3DB0",  label: "Retention Released", icon: null },
    ok:         { bg: C.greenBg,  color: C.greenDark,label: "On Schedule",  icon: null },
  };
  const s = map[status] || map.scheduled;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      fontSize:11, fontWeight:500, padding:"2px 8px", borderRadius:8,
      background:s.bg, color:s.color, whiteSpace:"nowrap",
    }}>
      {s.icon}
      {s.label}
    </span>
  );
};

export const KpiCard = ({ label, value, sub, trend, valueColor, onClick, actionLabel }: { label: string; value: string; sub?: string; trend?: string; valueColor?: string; onClick?: () => void; actionLabel?: string }) => {
  const [hover, setHover] = useState(false);
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      onMouseEnter={() => clickable && setHover(true)}
      onMouseLeave={() => clickable && setHover(false)}
      title={clickable ? (actionLabel || "Open in the Timeline") : undefined}
      style={{
        background:C.white,
        border:`0.5px solid ${clickable && hover ? C.blue : C.grayLight}`,
        borderRadius:12,
        padding:"16px 18px",
        boxShadow: clickable && hover ? "0 2px 10px rgba(26,95,168,0.16)" : "0 1px 3px rgba(0,0,0,0.02)",
        cursor: clickable ? "pointer" : "default",
        transition:"border-color .15s, box-shadow .15s",
      }}
    >
      <div style={{ fontSize:11, color:C.gray, marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</div>
      <div style={{ fontSize:23, fontWeight:600, color:valueColor||C.text, lineHeight:1.1 }}>{value}</div>
      {sub   && <div style={{ fontSize:11, color:C.textMuted, marginTop:5 }}>{sub}</div>}
      {trend && <div style={{ fontSize:11, marginTop:5, fontWeight:600, color:trend.startsWith("+") || trend.includes("over") ? C.red : C.green }}>{trend}</div>}
      {clickable && (
        <div style={{ fontSize:11, marginTop:8, fontWeight:600, color:C.blue, display:"flex", alignItems:"center", gap:4 }}>
          {actionLabel || "View in Timeline"} <span style={{ transform: hover ? "translateX(2px)" : "none", transition:"transform .15s" }}>→</span>
        </div>
      )}
    </div>
  );
};

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

const PROBLEM_TASK_STATUSES = new Set(["conflict", "overdue", "weather", "fragile"]);

export default function ScreenDashboard({ onNav }: { onNav: (sc: string) => void }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [problems, setProblems] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      fetch("/api/v1/dashboard").then(r => r.json()).then(setStats).catch(() => {});
      fetch("/api/v1/projects").then(r => r.json()).then(d => { if (Array.isArray(d)) setAllProjects(d); }).catch(() => {});
      fetch("/api/v1/tasks").then(r => r.json()).then(d => { if (Array.isArray(d)) setTasks(d); }).catch(() => {});
      fetch("/api/v1/problems").then(r => r.json()).then(d => { if (Array.isArray(d?.problems)) setProblems(d.problems); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  if (!stats) {
    return <div style={{ padding: 20, color: C.gray }}>Loading…</div>;
  }

  // PMs only see their own projects — so the four numbers must match the scoped
  // list, not the whole portfolio. Owner/Admin keep the global server stats.
  const isPM = user?.role === "PM";
  const projects = scopeProjects(user, allProjects);
  const activeProjects = projects.filter(p => p.status === "ACTIVE");

  const scopedIds = new Set(projects.map(p => p.id));
  const activeIds = new Set(activeProjects.map(p => p.id));
  const scopedNames = new Set(projects.map(p => p.name));
  const scopedTasks = isPM ? tasks.filter((t: any) => scopedIds.has(t.projectId)) : tasks;
  const scopedProblems = isPM
    ? problems.filter(p => String(p.projectName || "").split(" + ").every(n => scopedNames.has(n.trim())))
    : problems;

  const liveScoped = scopedTasks.filter((t: any) => t.status !== "completed" && (t.percent_complete ?? 0) < 100);
  const okScoped = liveScoped.filter((t: any) => !["conflict", "overdue", "weather", "fragile"].includes(t.status)).length;

  const issues = isPM ? scopedProblems.length : (stats.totalIssues ?? 0);
  const activeCount = isPM ? activeProjects.length : stats.activeProjectsCount;
  const onTrackPct = isPM ? (liveScoped.length ? Math.round((okScoped / liveScoped.length) * 100) : 100) : stats.onProgrammePct;
  const unassignedNum = isPM
    ? scopedTasks.filter((t: any) => !t.assigneeId && t.status !== "completed" && activeIds.has(t.projectId)).length
    : (stats.unassignedCount ?? 0);
  const toggleProject = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Project status split for the Overview donut + "Total Projects" KPI. A project
  // is "Late" if it's not completed and has at least one problem task (clash,
  // overdue, weather, or fragile); "Running" if not completed and problem-free.
  const ongoingProjects = projects.filter(p => p.status !== "COMPLETED");
  const completedProjects = projects.filter(p => p.status === "COMPLETED");
  const projectHasProblem = (pid: string) => tasks.some((t: any) => t.projectId === pid && PROBLEM_TASK_STATUSES.has(t.status));
  const lateProjects = ongoingProjects.filter(p => projectHasProblem(p.id));
  const runningProjects = ongoingProjects.filter(p => !projectHasProblem(p.id));
  const statusPieData = [
    { name: "Running", value: runningProjects.length },
    { name: "Late", value: lateProjects.length },
    { name: "Completed", value: completedProjects.length },
  ];
  const budgetData = projects.map(p => ({ name: p.name, contract: toDollars(p.plannedCost), actual: toDollars(p.actualCost) }));

  return (
    <div>
      {/* STATUS BANNER — one glance: are we ok or not? */}
      {issues > 0 ? (
        <div style={{ background: C.redBg, border: `1px solid #FECACA`, borderRadius: 12, padding: "18px 22px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid #FECACA` }}><AlertTriangle size={24} color={C.red} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.redDark, marginBottom: 2 }}>
              {issues} open issue{issues > 1 ? "s" : ""} require{issues > 1 ? "" : "s"} attention
            </div>
            <div style={{ fontSize: 12.5, color: C.text }}>Review Problems for details and recommended actions.</div>
          </div>
          <Btn primary onClick={() => onNav("problems")} style={{ flexShrink: 0, padding: "10px 20px", fontSize: 13, fontWeight: 700 }}>
            Review issues →
          </Btn>
        </div>
      ) : (
        <div style={{ background: C.greenBg, border: `1px solid #BBF7D0`, borderRadius: 12, padding: "18px 22px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid #BBF7D0` }}><CheckCircle2 size={24} color={C.green} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.greenDark, marginBottom: 2 }}>Everything's on track</div>
            <div style={{ fontSize: 12.5, color: C.text }}>No clashes, no late tasks across your projects.</div>
          </div>
        </div>
      )}

      {/* FOUR SIMPLE NUMBERS — stretch full width */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KpiCard label="Total Projects" value={`${projects.length}`} sub={`${runningProjects.length} running`} />
        <KpiCard label="On Track" value={`${onTrackPct}%`} valueColor={C.green} sub="Tasks going to plan" />
        <KpiCard
          label="Total Issues"
          value={`${issues}`}
          valueColor={issues > 0 ? C.red : C.greenDark}
          sub={issues > 0 ? "Tap to fix" : "All clear"}
          onClick={() => onNav("problems")}
          actionLabel="Open Problems"
        />
        <KpiCard
          label="Unassigned Tasks"
          value={`${unassignedNum}`}
          valueColor={unassignedNum > 0 ? C.red : C.greenDark}
          sub={unassignedNum > 0 ? "Need someone assigned" : "All tasks staffed"}
          onClick={() => onNav("problems")}
          actionLabel="Open Problems"
        />
      </div>

      {/* OVERVIEW CHARTS — project status split + budget snapshot, with a jump to Finance */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 16 }}>
        <PieCard title="Projects by status" description="How many projects are running, late (have a problem), or completed.">
          <CountPie data={statusPieData} colors={[C.green, C.amber, C.blueMid]} />
        </PieCard>
        <ChartCard
          title="Budget vs Actual"
          description="Planned budget against actual cost to date, per project."
          right={
            <button
              type="button"
              onClick={() => onNav("financial")}
              style={{ fontSize: 11, fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              Open Finance →
            </button>
          }
        >
          <GroupedDollarBar data={budgetData} seriesA="Budget" seriesB="Actual" colorA={C.blueMid} colorB={C.amber} />
        </ChartCard>
      </div>

      {/* YOUR PROJECTS — collapsible card; each project expands to its jobs */}
      <Card style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px" }}>
          <button
            type="button"
            onClick={() => setProjectsOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span style={{ fontSize: 13, color: C.gray, transform: projectsOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Your Projects <span style={{ color: C.gray, fontWeight: 600 }}>· {activeProjects.length}</span></span>
          </button>
          {projectsOpen && expanded.size > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(new Set())}
              style={{ fontSize: 11, fontWeight: 600, color: C.gray, background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
            >
              Collapse all
            </button>
          )}
          {projectsOpen && expanded.size === 0 && activeProjects.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(new Set(activeProjects.map(p => p.id)))}
              style={{ fontSize: 11, fontWeight: 600, color: C.gray, background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
            >
              Expand all
            </button>
          )}
        </div>

        {projectsOpen && (
          <div style={{ padding: "0 18px 14px" }}>
            {activeProjects.map(p => {
              const open = expanded.has(p.id);
              const ptasks = tasks.filter(t => t.projectId === p.id);
              const hasIssue = ptasks.some(t => PROBLEM_TASK_STATUSES.has(t.status));
              return (
                <div key={p.id} style={{ borderTop: `0.5px solid ${C.grayLight}` }}>
                  <button
                    type="button"
                    onClick={() => toggleProject(p.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ fontSize: 11, color: C.gray, width: 12, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: hasIssue ? C.red : C.green, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: 11.5, color: C.gray, flexShrink: 0 }}>{p.location}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.gray, width: 42, textAlign: "right", flexShrink: 0 }}>{p.progress}%</span>
                  </button>
                  {open && (
                    <div style={{ padding: "0 4px 10px 34px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {ptasks.length === 0 && <div style={{ fontSize: 11.5, color: C.gray }}>No tasks scheduled yet.</div>}
                      {ptasks.map(t => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                          <span style={{ flex: 1, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                          <span style={{ color: C.gray, flexShrink: 0, whiteSpace: "nowrap" }}>{t.start} → {t.end}</span>
                          <StatusBadge status={t.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {activeProjects.length === 0 && (
              <div style={{ fontSize: 12, color: C.gray, padding: "8px 4px" }}>No running projects.</div>
            )}
            <button type="button" onClick={() => onNav("projects")} style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              See all projects →
            </button>
          </div>
        )}
      </Card>

      {/* COMPLETED PROJECTS — separate, collapsed by default so live work stays primary */}
      {completedProjects.length > 0 && (
        <Card style={{ padding: 0 }}>
          <button
            type="button"
            onClick={() => setCompletedOpen(o => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "16px 18px" }}
          >
            <span style={{ fontSize: 13, color: C.gray, transform: completedOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Completed <span style={{ color: C.gray, fontWeight: 600 }}>· {completedProjects.length}</span></span>
          </button>
          {completedOpen && (
            <div style={{ padding: "0 18px 14px" }}>
              {completedProjects.map(p => (
                <div key={p.id} style={{ borderTop: `0.5px solid ${C.grayLight}`, display: "flex", alignItems: "center", gap: 10, padding: "11px 4px" }}>
                  <CheckCircle2 size={15} color={C.green} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 11.5, color: C.gray, flexShrink: 0 }}>{p.location}</span>
                  <StatusBadge status="completed" />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* WEATHER — one line */}
      <Card style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {stats.weatherAlert?.severity === "warning" ? <CloudRain size={22} color={C.blue} /> : <Sun size={22} color={C.amber} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>This week's weather</div>
          <div style={{ fontSize: 11.5, color: C.gray }}>{stats.weatherAlert?.text}</div>
        </div>
        <Btn small onClick={() => onNav("weather")}>See forecast →</Btn>
      </Card>
    </div>
  );
}
