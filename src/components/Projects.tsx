import React, { useState, useEffect } from "react";
import { Project, Resource, CostLine } from "../types";
import { KpiCard, StatusBadge, Btn, Card } from "./Dashboard";
import { useMasters } from "../hooks/useMasters";
import { AppNavigate } from "../types/masters";
import { LabelWithInfo } from "./InfoTip";
import { useAuth } from "../lib/auth";
import { visibleProjects as scopeProjects } from "../lib/auth";
import { Zap, RotateCcw, Calendar, DollarSign, Download, Plus, Trash2, CheckCircle2, RefreshCcw } from "lucide-react";
import { changeHistory } from "../lib/changeHistory";

const iconRow = { display: "inline-flex", alignItems: "center", gap: 6 } as const;

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
  bgSecond:   "#EEF2F8",
  white:      "#FFFFFF",
};

const ProgressBar = ({ pct, color }: { pct: number; color?: string }) => (
  <div style={{ marginTop:8 }}>
    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.gray, marginBottom:3 }}>
      <span>Schedule progress</span><span>{pct}%</span>
    </div>
    <div style={{ height:5, borderRadius:3, background:C.bgSecond }}>
      <div style={{ height:"100%", borderRadius:3, background:color||C.blueMid, width:`${pct}%` }} />
    </div>
  </div>
);

export default function ScreenProjects({ onNav }: { onNav?: AppNavigate }) {
  const { user } = useAuth();
  const { masters } = useMasters(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  // Real issue categories per project name (from the same source as Problems hub)
  const [issuesByProject, setIssuesByProject] = useState<Record<string, Set<string>>>({});
  const [totalIssues, setTotalIssues] = useState(0);
  const [demoBusy, setDemoBusy] = useState(false);

  // New Project State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [contractor, setContractor] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("Sydney NSW");
  const [state, setState] = useState("");

  useEffect(() => {
    if (!masters) return;
    if (!type && masters.sectors[0]) {
      setType(masters.sectors[0].value || masters.sectors[0].label);
    }
    if (!state && masters.states[0]?.code) {
      setState(masters.states[0].code!);
    }
  }, [masters, type, state]);
  const [originalSummaryVal, setOriginalSummaryVal] = useState("15.5");
  const [ldRatePerDay, setLdRatePerDay] = useState("8500");
  const [pcStartDate, setPcStartDate] = useState("2026-07-01");
  const [pcEndDate, setPcEndDate] = useState("2026-11-30");
  const [retentionPercent, setRetentionPercent] = useState("5.0");
  const [revenueReceived, setRevenueReceived] = useState("0");
  // Projected budget cost-lines (materials, subcontractors, custom costs) set
  // at creation — these + the auto-computed labour estimate are the projected
  // final cost shown on Finance and compared against actuals once the project
  // is under way / complete.
  const [budgetLines, setBudgetLines] = useState<{ label: string; category: string; amount: string }[]>([
    { label: "Materials", category: "Materials", amount: "" },
  ]);

  const addBudgetLine = () => setBudgetLines(prev => [...prev, { label: "", category: "Materials", amount: "" }]);
  const removeBudgetLine = (i: number) => setBudgetLines(prev => prev.filter((_, idx) => idx !== i));
  const updateBudgetLine = (i: number, patch: Partial<{ label: string; category: string; amount: string }>) =>
    setBudgetLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const budgetLinesTotal = budgetLines.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);

  // Add-cost (in-progress) modal — appends an actual cost line to a live project.
  const [showAddCostModal, setShowAddCostModal] = useState(false);
  const [costTargetProj, setCostTargetProj] = useState<Project | null>(null);
  const [costLabel, setCostLabel] = useState("");
  const [costCategory, setCostCategory] = useState("Materials");
  const [costAmount, setCostAmount] = useState("");
  const [savingCost, setSavingCost] = useState(false);

  // Import projects state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // Project overrides state
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [selectedProj, setSelectedProj] = useState<Project | null>(null);
  const [projectRates, setProjectRates] = useState<{ [resourceId: string]: string }>({});
  const [isSavingRates, setIsSavingRates] = useState(false);

  const loadIssues = () => {
    fetch("/api/v1/problems")
      .then(res => res.json())
      .then(data => {
        const map: Record<string, Set<string>> = {};
        for (const p of data.problems || []) {
          for (const name of String(p.projectName || "").split(" + ")) {
            const key = name.trim();
            if (!key) continue;
            (map[key] ||= new Set()).add(p.category);
          }
        }
        setIssuesByProject(map);
        setTotalIssues(data.summary?.total ?? 0);
      })
      .catch(() => {});
  };

  const loadProjectsAndResources = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/v1/projects").then(res => res.json()),
      fetch("/api/v1/resources").then(res => res.json())
    ])
      .then(([projectsData, resourcesData]) => {
        setProjects(projectsData);
        setResources(resourcesData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading projects and resources:", err);
        setLoading(false);
      });
    loadIssues();
  };

  useEffect(() => {
    loadProjectsAndResources();
  }, []);

  // Demo controls — issues come from importing/changing work, so the trigger
  // lives here next to Import. Simulate drops the problem set onto the schedule;
  // Reset clears it. Both refresh the live issue badges.
  const runDemo = (path: "simulate" | "reset") => {
    setDemoBusy(true);
    fetch(`/api/v1/demo/${path}`, { method: "POST" })
      .then(res => res.json())
      .then(() => {
        setDemoBusy(false);
        // A clean reset rebuilds the seed, so any pending Timeline "Undo last
        // change" snapshot AND the Change History log are now stale — drop both so
        // the buttons clear and history matches the freshly-reset schedule.
        if (path === "reset") {
          try { window.localStorage.removeItem("flowiq.timeline.undoSnapshot"); } catch { /* best-effort */ }
          changeHistory.clear();
        }
        loadIssues();
      })
      .catch(() => setDemoBusy(false));
  };

  const handleAddProject = () => {
    if (!name.trim() || !contractor.trim()) {
      alert("Please specify project name and main contractor.");
      return;
    }
    const cleanLines = budgetLines
      .filter(l => (parseFloat(l.amount) || 0) > 0)
      .map(l => ({ label: l.label.trim() || l.category, category: l.category, amount: parseFloat(l.amount) || 0 }));
    fetch("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        location,
        contractor,
        state,
        originalContractSum: originalSummaryVal,
        ldRatePerDay,
        pcStartDate,
        pcEndDate,
        retentionPercent,
        budgetLines: cleanLines,
        revenueReceived,
      })
    })
      .then(res => res.json())
      .then(() => {
        setName("");
        setContractor("");
        setBudgetLines([{ label: "Materials", category: "Materials", amount: "" }]);
        setRevenueReceived("0");
        setLdRatePerDay("8500");
        setPcStartDate("2026-07-01");
        setPcEndDate("2026-11-30");
        setRetentionPercent("5.0");
        setShowAddModal(false);
        loadProjectsAndResources();
      })
      .catch(err => console.error("Error adding project contract:", err));
  };

  const openAddCost = (e: React.MouseEvent, proj: Project) => {
    e.stopPropagation();
    setCostTargetProj(proj);
    setCostLabel("");
    setCostCategory("Materials");
    setCostAmount("");
    setShowAddCostModal(true);
  };

  const handleAddCost = () => {
    if (!costTargetProj) return;
    const amt = parseFloat(costAmount);
    if (!amt || amt <= 0) {
      alert("Enter a cost amount greater than 0.");
      return;
    }
    setSavingCost(true);
    fetch(`/api/v1/projects/${costTargetProj.id}/cost-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: costLabel || costCategory, category: costCategory, amount: amt }),
    })
      .then(res => res.json())
      .then(() => {
        setSavingCost(false);
        setShowAddCostModal(false);
        loadProjectsAndResources();
      })
      .catch(() => setSavingCost(false));
  };

  const handleToggleStatus = (e: React.MouseEvent, proj: Project) => {
    e.stopPropagation();
    const nextStatus = proj.status === "COMPLETED" ? "ACTIVE" : "COMPLETED";
    const verb = nextStatus === "COMPLETED" ? "Finish" : "Reopen";
    if (!window.confirm(`${verb} "${proj.name}"?`)) return;
    fetch(`/api/v1/projects/${proj.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    })
      .then(res => res.json())
      .then(() => loadProjectsAndResources())
      .catch(err => console.error("Error updating project status:", err));
  };

  // Open Modal to manage rate overrides for a selected project
  const handleOpenRates = (e: React.MouseEvent, proj: Project) => {
    e.stopPropagation(); // Stop navigation to Gantt
    setSelectedProj(proj);

    const rates: { [resourceId: string]: string } = {};
    resources.forEach(r => {
      if (r.projectRateOverrides && r.projectRateOverrides[proj.id] !== undefined) {
        rates[r.id] = String(r.projectRateOverrides[proj.id]);
      } else {
        rates[r.id] = "";
      }
    });

    setProjectRates(rates);
    setShowRatesModal(true);
  };

  const handleSaveRates = () => {
    if (!selectedProj) return;
    setIsSavingRates(true);

    fetch(`/api/v1/projects/${selectedProj.id}/rates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceRates: projectRates })
    })
      .then(res => res.json())
      .then(() => {
        setIsSavingRates(false);
        setShowRatesModal(false);
        loadProjectsAndResources();
      })
      .catch(err => {
        console.error("Error committing project rate overrides:", err);
        setIsSavingRates(false);
      });
  };

  const runImport = (body: object, label: string) => {
    setImporting(true);
    setImportMsg(null);
    fetch("/api/v1/projects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(res => res.json())
      .then(res => {
        setImporting(false);
        if (res.success) {
          setImportMsg(`✓ Imported ${res.imported} project${res.imported > 1 ? "s" : ""} (${label}).`);
          setCsvText("");
          loadProjectsAndResources();
          setTimeout(() => { setShowImportModal(false); setImportMsg(null); }, 1400);
        } else {
          setImportMsg(res.error || "Import failed.");
        }
      })
      .catch(() => {
        setImporting(false);
        setImportMsg("Network error during import.");
      });
  };

  // Parse a small CSV (header row: name,type,location,contractor,state,contractValue,ldRatePerDay,pcEndDate)
  const handleImportCsv = () => {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      setImportMsg("Paste a header row plus at least one project row.");
      return;
    }
    const headers = lines[0].split(",").map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cells = line.split(",").map(c => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
      return row;
    });
    runImport({ rows }, "from CSV");
  };

  if (loading) {
    return <div style={{ padding: 20, color: C.gray }}>Loading projects…</div>;
  }

  // PMs only see the projects they manage; Owner/Admin see the whole portfolio.
  const visProjects = scopeProjects(user, projects);
  // Simple portfolio counts (deep finance figures live on the Finance tab).
  const inProgressProjects = visProjects.filter(p => p.status !== "COMPLETED");
  const completedProjects = visProjects.filter(p => p.status === "COMPLETED");
  const activeCount = inProgressProjects.filter(p => p.status === "ACTIVE").length;

  const renderProjectCard = (p: Project) => {
    const cats = issuesByProject[p.name] || new Set<string>();
    const hasConflicts = cats.has("conflict");
    const hasFragile = cats.has("fragile");
    const hasLate = cats.has("late");
    const hasWeather = cats.has("weather");
    // Real margin — same formula as the Finance tab (finalContractSum - actualCost) / finalContractSum.
    const marginVal = p.finalContractSum > 0
      ? Math.round(((p.finalContractSum - p.actualCost) / p.finalContractSum) * 1000) / 10
      : 0;
    const isCompleted = p.status === "COMPLETED";

    // Count how many overrides are active on this project
    const overrideCount = resources.filter(r => r.projectRateOverrides && r.projectRateOverrides[p.id] !== undefined).length;

    return (
      <div key={p.id} onClick={() => onNav("gantt")} style={{
        border:`0.5px solid ${hasConflicts ? "#FECACA" : C.grayLight}`,
        borderRadius:12, padding:"14px 16px", marginBottom:10,
        background:C.white, cursor:"pointer",
        opacity: isCompleted || p.status === "PRACTICAL_COMPLETION" ? 0.85 : 1,
        transition:"border-color .15s",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{p.name}</div>
            <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{p.type} · {p.location} · Contractor: {p.contractor}</div>
          </div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end" }}>
            {hasConflicts && <StatusBadge status="conflict" />}
            {hasLate && <StatusBadge status="overdue" />}
            {hasFragile && <StatusBadge status="fragile" />}
            {hasWeather && <StatusBadge status="weather" />}
            <StatusBadge status={isCompleted ? "completed" : p.status === "PRACTICAL_COMPLETION" ? "practical" : "active"} />
          </div>
        </div>
        <div style={{ display:"flex", gap:20, fontSize:11, color:C.gray, marginBottom:10, flexWrap:"wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span style={iconRow}><Calendar size={12} /> {p.pcStartDate} to {p.pcEndDate}</span>
            <span style={iconRow}><DollarSign size={12} /> A${p.finalContractSum.toFixed(1)}M contract</span>
            <span style={{ color: p.overBudget ? C.red : C.green }}>
              {p.overBudget ? "↓" : "↑"} Gross Margin: {marginVal}%
            </span>
            {isCompleted && (
              <span style={{ color: (p.revenueReceived ?? 0) >= p.actualCost ? C.green : C.red }}>
                Revenue A${(p.revenueReceived ?? 0).toFixed(1)}M vs actual A${p.actualCost.toFixed(1)}M
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {overrideCount > 0 && (
              <span style={{ fontSize: 10, background: C.blueLight, color: C.blue, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>
                {overrideCount} Custom Labor Rates
              </span>
            )}
            {!isCompleted && (
              <Btn small onClick={(e) => openAddCost(e, p)} style={{ background: C.bgSecond, color: C.navy, border: `0.5px solid ${C.grayLight}` }}>
                <span style={iconRow}><DollarSign size={12} /> Add cost</span>
              </Btn>
            )}
            <Btn small onClick={(e) => handleOpenRates(e, p)} style={{ background: C.bgSecond, color: C.navy, border: `0.5px solid ${C.grayLight}` }}>
              ⚙️ Adjust Labor Rates
            </Btn>
            <Btn small onClick={(e) => handleToggleStatus(e, p)} style={{ background: isCompleted ? C.bgSecond : C.greenBg, color: isCompleted ? C.navy : C.greenDark, border: `0.5px solid ${isCompleted ? C.grayLight : C.green}` }}>
              {isCompleted ? <span style={iconRow}><RefreshCcw size={12} /> Reopen</span> : <span style={iconRow}><CheckCircle2 size={12} /> Finish</span>}
            </Btn>
          </div>
        </div>
        <ProgressBar pct={p.progress} color={p.progress === 100 ? C.green : p.overBudget ? C.amber : C.blueMid} />
      </div>
    );
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10, marginBottom:16 }}>
        <KpiCard label="Total Projects" value={`${visProjects.length}`} valueColor={C.blue} sub={user?.role === "PM" ? "Assigned to you" : "Across the portfolio"} />
        <KpiCard label="Active" value={`${activeCount}`} valueColor={C.green} sub="Live on site right now" />
        <KpiCard
          label="Total Issues"
          value={`${totalIssues}`}
          valueColor={totalIssues > 0 ? C.red : C.greenDark}
          sub={totalIssues > 0 ? "Open Problems to fix" : "All clear"}
          onClick={() => onNav?.("problems")}
          actionLabel="Open Problems"
        />
      </div>

      {/* Demo control strip — create or clear the problem scenario from here */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "12px 16px", borderRadius: 12, border: `1px solid ${totalIssues > 0 ? "#FECACA" : C.grayLight}`, background: totalIssues > 0 ? C.redBg : "#F8FAFC", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: totalIssues > 0 ? C.redDark : C.text }}>
            {totalIssues > 0
              ? `New work created ${totalIssues} problem${totalIssues > 1 ? "s" : ""} across your projects`
              : "Everything's on track"}
          </div>
          <div style={{ fontSize: 11.5, color: C.gray, marginTop: 2 }}>
            {totalIssues > 0
              ? "Open Problems to see each one and how to fix it."
              : "Bring in new work to see how FlowIQ catches problems the moment they appear."}
          </div>
        </div>
        {totalIssues > 0 ? (
          <>
            <Btn small onClick={() => onNav?.("problems")}>See Problems →</Btn>
            <Btn small danger onClick={() => runDemo("reset")} disabled={demoBusy}>{demoBusy ? "Working…" : <span style={iconRow}><RotateCcw size={13} /> Reset to clean</span>}</Btn>
          </>
        ) : (
          <Btn primary small onClick={() => runDemo("simulate")} disabled={demoBusy}>{demoBusy ? "Working…" : <span style={iconRow}><Zap size={13} /> Bring in new work</span>}</Btn>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <span style={{ fontSize:12, fontWeight:600, color:C.gray, textTransform:"uppercase", letterSpacing:"0.05em" }}>In Progress <span style={{ color: C.text, fontWeight: 700 }}>· {inProgressProjects.length}</span></span>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small onClick={() => { setShowImportModal(true); setImportMsg(null); }}><span style={iconRow}><Download size={13} /> Import projects</span></Btn>
          <Btn primary small onClick={() => setShowAddModal(true)}><span style={iconRow}><Plus size={13} /> New project</span></Btn>
        </div>
      </div>

      {inProgressProjects.length === 0 && (
        <div style={{ fontSize: 12, color: C.gray, padding: "10px 4px", marginBottom: 10 }}>No projects in progress.</div>
      )}
      {inProgressProjects.map(renderProjectCard)}

      {completedProjects.length > 0 && (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", margin:"22px 0 14px" }}>
            <span style={{ fontSize:12, fontWeight:600, color:C.gray, textTransform:"uppercase", letterSpacing:"0.05em" }}>Completed <span style={{ color: C.text, fontWeight: 700 }}>· {completedProjects.length}</span></span>
          </div>
          {completedProjects.map(renderProjectCard)}
        </>
      )}

      {/* Add Project Modal — simplified */}
      {showAddModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99 }}>
          <div style={{ background:C.white, borderRadius:12, width: 420, padding: 22, border:`0.5px solid ${C.grayLight}`, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", maxHeight: "95vh", overflowY: "auto" }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Add New Project</div>
            <div style={{ fontSize:11, color:C.gray, marginBottom:16 }}>Enter the key contract details. You can update costs and dates later.</div>

            {/* Row 1: Name */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Project Name *</label>
              <input
                type="text"
                placeholder="e.g. Barangaroo Central — Stage 1"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
              />
            </div>

            {/* Row 2: Contractor */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Head Contractor *</label>
              <input
                type="text"
                placeholder="e.g. Multiplex Constructions"
                value={contractor}
                onChange={e => setContractor(e.target.value)}
                style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
              />
            </div>

            {/* Row 3: Sector + State */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Sector *</label>
                <select value={type} onChange={e => setType(e.target.value)} style={{ width:"100%", fontSize:12, padding:"7px 6px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}>
                  {(masters?.sectors || []).map(s => (
                    <option key={s.id} value={s.value || s.label}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>State *</label>
                <select value={state} onChange={e => setState(e.target.value)} style={{ width:"100%", fontSize:12, padding:"7px 6px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}>
                  {(masters?.states || []).map(s => (
                    <option key={s.id} value={s.code || s.label}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 4: Location */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Site Address</label>
              <input
                type="text"
                placeholder="e.g. 1 Barangaroo Ave, Sydney NSW 2000"
                value={location}
                onChange={e => setLocation(e.target.value)}
                style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
              />
            </div>

            {/* Row 5: Contract value + LD rate */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Contract Value (A$M) *</label>
                <input
                  type="number"
                  value={originalSummaryVal}
                  onChange={e => setOriginalSummaryVal(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
              </div>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>
                  <LabelWithInfo
                    label="LD Penalty (A$/day)"
                    title="Liquidated Damages (LD) Rate"
                    body={"Daily penalty if the project passes Practical Completion without a formal extension of time.\n\nExample: A$8,500/day × 10 overrun days = A$85,000 exposure."}
                  />
                </label>
                <input
                  type="number"
                  value={ldRatePerDay}
                  onChange={e => setLdRatePerDay(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
              </div>
            </div>

            {/* Row 6: Programme dates */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Schedule Start *</label>
                <input
                  type="date"
                  value={pcStartDate}
                  onChange={e => setPcStartDate(e.target.value)}
                  style={{ width:"100%", fontSize:11.5, padding:"6px 6px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
              </div>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>
                  <LabelWithInfo
                    label="Practical Completion *"
                    title="Practical Completion (PC)"
                    body={"Contract deadline for project completion. LD exposure is calculated from this date if the schedule overruns."}
                  />
                </label>
                <input
                  type="date"
                  value={pcEndDate}
                  onChange={e => setPcEndDate(e.target.value)}
                  style={{ width:"100%", fontSize:11.5, padding:"6px 6px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
              </div>
            </div>

            {/* Row 7: Retention + revenue received so far */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>
                  <LabelWithInfo
                    label="Retention %"
                    title="Retention %"
                    body={"% of certified claim held as security. Typically 5% under AS 4000 contracts."}
                  />
                </label>
                <input
                  type="number"
                  value={retentionPercent}
                  onChange={e => setRetentionPercent(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
              </div>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Revenue received so far (A$M) <span style={{ fontWeight:400, color:"#94A3B8" }}>(optional)</span></label>
                <input
                  type="number"
                  value={revenueReceived}
                  onChange={e => setRevenueReceived(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
              </div>
            </div>

            {/* Row 8: Projected budget cost-lines — materials, subcontractors, custom costs.
                Labour is auto-estimated from scheduled tasks and added on top by Finance. */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize:11, color:C.gray, fontWeight: 600 }}>Projected budget cost lines <span style={{ fontWeight:400, color:"#94A3B8" }}>(optional — materials, subcontractors, custom costs)</span></label>
                <button type="button" onClick={addBudgetLine} style={{ fontSize: 11, fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer" }}>+ Add line</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {budgetLines.map((line, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 24px", gap: 6, alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="Label (e.g. Cement)"
                      value={line.label}
                      onChange={e => updateBudgetLine(i, { label: e.target.value })}
                      style={{ fontSize:11.5, padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, boxSizing: "border-box" }}
                    />
                    <select
                      value={line.category}
                      onChange={e => updateBudgetLine(i, { category: e.target.value })}
                      style={{ fontSize:11.5, padding:"6px 6px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                    >
                      <option value="Materials">Materials</option>
                      <option value="Subcontractors">Subcontractors</option>
                      <option value="Plant & Equipment">Plant &amp; Equipment</option>
                      <option value="Machinery">Machinery</option>
                    </select>
                    <input
                      type="number"
                      placeholder="A$M"
                      value={line.amount}
                      onChange={e => updateBudgetLine(i, { amount: e.target.value })}
                      style={{ fontSize:11.5, padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, boxSizing: "border-box" }}
                    />
                    <button type="button" onClick={() => removeBudgetLine(i)} title="Remove" style={{ border: "none", background: "none", cursor: "pointer", color: C.red, padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.gray, marginTop: 6 }}>
                Projected budget lines total: <strong style={{ color: C.text }}>A${budgetLinesTotal.toFixed(1)}M</strong> (labour is estimated separately from the schedule)
              </div>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <Btn primary onClick={handleAddProject}>Register Project</Btn>
              <Btn onClick={() => setShowAddModal(false)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Import Projects Modal */}
      {showImportModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99 }}>
          <div style={{ background:C.white, borderRadius:12, width: 460, padding: 22, border:`0.5px solid ${C.grayLight}`, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:4 }}>⤓ Import Projects</div>
            <div style={{ fontSize:11.5, color:C.gray, marginBottom:16 }}>Bring projects in from a spreadsheet, or load a ready-made sample set to try it out.</div>

            {importMsg && (
              <div style={{ marginBottom: 14, padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: importMsg.startsWith("✓") ? C.greenBg : C.redBg, color: importMsg.startsWith("✓") ? C.greenDark : C.redDark,
                border: `1px solid ${importMsg.startsWith("✓") ? C.green : C.red}` }}>
                {importMsg}
              </div>
            )}

            {/* One-click sample */}
            <div style={{ background: C.blueLight, border: `1px solid ${C.blueMid}55`, borderRadius: 10, padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.blue }}>Quick start</div>
                <div style={{ fontSize: 11, color: C.gray }}>Adds 2 sample projects instantly. Great for a demo.</div>
              </div>
              <Btn primary small disabled={importing} onClick={() => runImport({ sample: true }, "sample set")}>
                {importing ? "Importing…" : "Load sample set"}
              </Btn>
            </div>

            {/* CSV paste */}
            <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4, fontWeight: 600 }}>Or paste CSV</label>
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginBottom: 6, fontFamily: "monospace" }}>
              name,type,location,contractor,state,contractValue,ldRatePerDay,pcEndDate
            </div>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={"name,type,location,contractor,state,contractValue,ldRatePerDay,pcEndDate\nRiver Quarter Tower,Mixed-use,Brisbane QLD,Hutchinson,QLD,52,52000,2027-06-30"}
              rows={5}
              style={{ width:"100%", fontSize:11.5, padding:"8px 10px", borderRadius:8, border:`0.5px solid ${C.grayLight}`, fontFamily:"monospace", resize:"vertical", boxSizing: "border-box" }}
            />

            <div style={{ display:"flex", gap:8, justifyContent: "flex-end", marginTop: 16 }}>
              <Btn onClick={() => setShowImportModal(false)}>Close</Btn>
              <Btn primary disabled={importing || !csvText.trim()} onClick={handleImportCsv}>
                {importing ? "Importing…" : "Import from CSV"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Labor Rates Overrides Modal */}
      {showRatesModal && selectedProj && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99 }}>
          <Card style={{ width: 500, padding: 22, overflowY: "auto", maxHeight: "90vh" }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:4 }}>⚙️ Labor Rates for This Project ({selectedProj.name})</div>
            <div style={{ fontSize:11, color:C.gray, marginBottom:16 }}>Specify project-specific rates (e.g. due to Union EBA minimums, travel allowances, or remote loading). Leave blank to use subbie's default rate.</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto", paddingRight: 6, marginBottom: 16 }}>
              {resources.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F8FAFC", padding: "8px 12px", borderRadius: 8, border: `0.5px solid ${C.grayLight}` }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: C.gray }}>{r.trade} · Base: <span style={{ fontWeight: 600 }}>{r.rate || `A$${r.hourlyRateVal}/hr`}</span></div>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: C.gray }}>A$</span>
                    <input 
                      type="number"
                      placeholder={String(r.hourlyRateVal || 65)}
                      value={projectRates[r.id] || ""}
                      onChange={e => setProjectRates({ ...projectRates, [r.id]: e.target.value })}
                      style={{
                        width: 75,
                        fontSize: 12,
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: `0.5px solid ${C.grayLight}`,
                        textAlign: "center",
                        background: C.white,
                        outline: "none"
                      }}
                    />
                    <span style={{ fontSize: 11, color: C.gray }}>/hr</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", gap:8, justifyContent: "flex-end" }}>
              <Btn primary onClick={handleSaveRates}>
                {isSavingRates ? "Updating Site Rates..." : "Apply Rate Overrides"}
              </Btn>
              <Btn onClick={() => setShowRatesModal(false)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Add Cost Modal — appends an actual (incurred) cost line to a live project,
          e.g. a swapped-in subcontractor or a material overrun mid-project. */}
      {showAddCostModal && costTargetProj && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99 }}>
          <div style={{ background:C.white, borderRadius:12, width: 380, padding: 22, border:`0.5px solid ${C.grayLight}`, boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:4 }}>Add cost — {costTargetProj.name}</div>
            <div style={{ fontSize:11, color:C.gray, marginBottom:16 }}>Log an actual cost incurred while this project is in progress (extra materials, a swapped-in sub, more plant hire).</div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Label</label>
              <input type="text" placeholder="e.g. Extra cement order" value={costLabel} onChange={e => setCostLabel(e.target.value)}
                style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, boxSizing: "border-box" }} />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Category</label>
                <select value={costCategory} onChange={e => setCostCategory(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 6px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}>
                  <option value="Materials">Materials</option>
                  <option value="Subcontractors">Subcontractors</option>
                  <option value="Plant & Equipment">Plant &amp; Equipment</option>
                  <option value="Machinery">Machinery</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Amount (A$M)</label>
                <input type="number" value={costAmount} onChange={e => setCostAmount(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <Btn primary onClick={handleAddCost} disabled={savingCost}>{savingCost ? "Saving…" : "Add cost"}</Btn>
              <Btn onClick={() => setShowAddCostModal(false)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
