import React, { useState, useEffect } from "react";
import { Project, Resource } from "../types";
import { KpiCard, StatusBadge, Btn, Card } from "./Dashboard";
import { useMasters } from "../hooks/useMasters";
import { AppNavigate } from "../types/masters";
import { LabelWithInfo } from "./InfoTip";

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
      <span>Programme progress</span><span>{pct}%</span>
    </div>
    <div style={{ height:5, borderRadius:3, background:C.bgSecond }}>
      <div style={{ height:"100%", borderRadius:3, background:color||C.blueMid, width:`${pct}%` }} />
    </div>
  </div>
);

export default function ScreenProjects({ onNav }: { onNav?: AppNavigate }) {
  const { masters } = useMasters(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [plannedCost, setPlannedCost] = useState("");
  const [ldRatePerDay, setLdRatePerDay] = useState("8500");
  const [pcStartDate, setPcStartDate] = useState("2026-07-01");
  const [pcEndDate, setPcEndDate] = useState("2026-11-30");
  const [retentionPercent, setRetentionPercent] = useState("5.0");

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
  };

  useEffect(() => {
    loadProjectsAndResources();
  }, []);

  const handleAddProject = () => {
    if (!name.trim() || !contractor.trim()) {
      alert("Please specify project name and main contractor.");
      return;
    }
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
        plannedCost: plannedCost || originalSummaryVal,
        ldRatePerDay,
        pcStartDate,
        pcEndDate,
        retentionPercent
      })
    })
      .then(res => res.json())
      .then(() => {
        setName("");
        setContractor("");
        setPlannedCost("");
        setLdRatePerDay("8500");
        setPcStartDate("2026-07-01");
        setPcEndDate("2026-11-30");
        setRetentionPercent("5.0");
        setShowAddModal(false);
        loadProjectsAndResources();
      })
      .catch(err => console.error("Error adding project contract:", err));
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
    return <div style={{ padding: 20, color: C.gray }}>Querying project contracts...</div>;
  }

  // Calculate sum metrics from real states
  const totalContract = projects.reduce((sum, p) => sum + p.finalContractSum, 0);
  const totalCertified = projects.reduce((sum, p) => sum + p.actualCost, 0);
  const totalRetention = projects.reduce((sum, p) => sum + (p.status !== "PRACTICAL_COMPLETION" ? p.actualCost * 0.05 : 0), 0);

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10, marginBottom:16 }}>
        <KpiCard label="Total Contract Value" value={`A$${totalContract.toFixed(0)}M`} valueColor={C.blue} sub={`${projects.length} Tier 1 Projects`} />
        <KpiCard label="Total Certified Cost" value={`A$${totalCertified.toFixed(1)}M`} trend="+A$2.1M over planned bounds" />
        <KpiCard label="Retention Held (5%)" value={`A$${totalRetention.toFixed(2)}M`} sub="Held under standard AS 4000-1997" />
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <span style={{ fontSize:12, fontWeight:600, color:C.gray, textTransform:"uppercase", letterSpacing:"0.05em" }}>Active Builder Programs</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small onClick={() => { setShowImportModal(true); setImportMsg(null); }}>⤓ Import Projects</Btn>
          <Btn primary small onClick={() => setShowAddModal(true)}>+ New Project Contract</Btn>
        </div>
      </div>

      {projects.map(p => {
        const hasConflicts = p.id === "p1" || p.id === "p2";
        const hasFragile = p.id === "p1" || p.id === "p3";
        const marginVal = p.id === "p1" ? 11.2 : p.id === "p2" ? 13.8 : p.id === "p3" ? 16.2 : 14.1;

        // Count how many overrides are active on this project
        const overrideCount = resources.filter(r => r.projectRateOverrides && r.projectRateOverrides[p.id] !== undefined).length;

        return (
          <div key={p.id} onClick={() => onNav("gantt")} style={{
            border:`0.5px solid ${hasConflicts ? "#FECACA" : C.grayLight}`,
            borderRadius:12, padding:"14px 16px", marginBottom:10,
            background:C.white, cursor:"pointer",
            opacity: p.status === "PRACTICAL_COMPLETION" ? 0.8 : 1,
            transition:"border-color .15s",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{p.name}</div>
                <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{p.type} · {p.location} · Contractor: {p.contractor}</div>
              </div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end" }}>
                {hasConflicts && <StatusBadge status="conflict" />}
                {hasFragile && <StatusBadge status="fragile" />}
                {p.weatherRisk && <StatusBadge status="weather" />}
                <StatusBadge status={p.status === "PRACTICAL_COMPLETION" ? "practical" : "active"} />
              </div>
            </div>
            <div style={{ display:"flex", gap:20, fontSize:11, color:C.gray, marginBottom:10, flexWrap:"wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>📅 Prog. Baseline: {p.pcStartDate} to {p.pcEndDate}</span>
                <span>💰 A${p.finalContractSum.toFixed(1)}M contract sum</span>
                <span style={{ color: p.overBudget ? C.red : C.green }}>
                  {p.overBudget ? "↓" : "↑"} Gross Margin: {marginVal}%
                </span>
              </div>
              
              {/* Dynamic Rates Modifier Button */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {overrideCount > 0 && (
                  <span style={{ fontSize: 10, background: C.blueLight, color: C.blue, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>
                    {overrideCount} Custom Rate Rules Active
                  </span>
                )}
                <Btn small onClick={(e) => handleOpenRates(e, p)} style={{ background: C.bgSecond, color: C.navy, border: `0.5px solid ${C.grayLight}` }}>
                  ⚙️ Labor Rate Overrides
                </Btn>
              </div>
            </div>
            <ProgressBar pct={p.progress} color={p.progress === 100 ? C.green : p.overBudget ? C.amber : C.blueMid} />
          </div>
        );
      })}

      {/* Add Project Modal — simplified */}
      {showAddModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99 }}>
          <div style={{ background:C.white, borderRadius:12, width: 420, padding: 22, border:`0.5px solid ${C.grayLight}`, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", maxHeight: "95vh", overflowY: "auto" }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Register New Project</div>
            <div style={{ fontSize:11, color:C.gray, marginBottom:16 }}>Enter the key contract details — you can update costs and dates later.</div>

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
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Programme Start *</label>
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
                    body={"Contract deadline for project completion. LD exposure is calculated from this date if the programme overruns."}
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

            {/* Row 7: Retention + optional cost budget */}
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
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Cost Budget A$M <span style={{ fontWeight:400, color:"#94A3B8" }}>(optional)</span></label>
                <input
                  type="number"
                  value={plannedCost}
                  placeholder="Defaults to contract value"
                  onChange={e => setPlannedCost(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
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
                <div style={{ fontSize: 11, color: C.gray }}>Adds 2 sample projects instantly — great for a demo.</div>
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
            <div style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:4 }}>⚙️ Site Labor Rate Rules ({selectedProj.name})</div>
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
    </div>
  );
}
