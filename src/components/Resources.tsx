import React, { useState, useEffect, useMemo } from "react";
import { Resource, Project } from "../types";
import { KpiCard, Card, Btn } from "./ui/primitives";
import { Search, AlertTriangle, FileText } from "lucide-react";
import { useMasters } from "../hooks/useMasters";
import { AppNavigate } from "../types/masters";
import { C } from "../lib/theme";
import { api } from "../lib/api";


const UtilBar = ({ util }: { util: number }) => {
  const pct = Math.min(util, 100);
  const color = util > 100 ? C.red : util < 20 ? C.amber : C.blueMid;
  return (
    <div style={{ width:120 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.gray, marginBottom:3 }}>
        <span>Workload</span>
        <span style={{ fontWeight: 600, color }}>{util}%</span>
      </div>
      <div style={{ height:5, borderRadius:3, background:C.bgSecond }}>
        <div style={{ height:"100%", borderRadius:3, background:color, width:`${pct}%` }} />
      </div>
    </div>
  );
};

export default function ScreenResources(_props: { onNav?: AppNavigate }) {
  const { masters } = useMasters(true);
  const companyOptions = useMemo(
    () => (masters?.companies || []).map(c => c.label),
    [masters]
  );
  const customCompanyLabel = useMemo(
    () => masters?.companies.find(c => c.is_system)?.label || "Custom / Other Subcontractor...",
    [masters]
  );

  const [resources, setResources] = useState<Resource[]>([]);
  const [_projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // Selected Resource ID for details editing
  const [expandedResId, setExpandedResId] = useState<string | null>(null);

  // States for resource editing form inside panel
  const [editEmail, setEditEmail] = useState("");
  const [editCompanySelect, setEditCompanySelect] = useState("");
  const [editCompanyCustom, setEditCompanyCustom] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editOvertime, setEditOvertime] = useState("");
  const [editAllowance, setEditAllowance] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // State for registering a brand-new resource
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newState, setNewState] = useState("");
  const [newRate, setNewRate] = useState("65");
  const [newEmail, setNewEmail] = useState("");
  const [newCompanySelect, setNewCompanySelect] = useState("");
  const [newCompanyCustom, setNewCompanyCustom] = useState("");
  const [newOvertime, setNewOvertime] = useState("");
  const [newAllowance, setNewAllowance] = useState("");
  const [newBio, setNewBio] = useState("");
  const [newSkillsText, setNewSkillsText] = useState("");
  const [newRateType, setNewRateType] = useState<"hourly" | "daily" | "lump_sum">("hourly");
  const [showAddOptional, setShowAddOptional] = useState(false);

  // State for bulk importing
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  const loadAllData = () => {
    setLoading(true);
    Promise.all([
      api.get("/resources"),
      api.get("/projects")
    ])
      .then(([resourcesData, projectsData]) => {
        setResources(resourcesData);
        setProjects(projectsData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Resources: Error loading resources & projects:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (!masters) return;
    if (!newTrade && masters.trades[0]) setNewTrade(masters.trades[0].label);
    if (!newState && masters.states[0]?.code) setNewState(masters.states[0].code!);
    if (!newCompanySelect && companyOptions[0]) setNewCompanySelect(companyOptions[0]);
  }, [masters, newTrade, newState, newCompanySelect, companyOptions]);

  const handleExpandResource = (r: Resource) => {
    if (expandedResId === r.id) {
      setExpandedResId(null);
      return;
    }
    setExpandedResId(r.id);
    setEditEmail(r.email || "");
    
    // Bind company selection dropdown vs custom input
    const baseCompany = r.company || companyOptions[0] || "Direct Hire";
    if (companyOptions.includes(baseCompany)) {
      setEditCompanySelect(baseCompany);
      setEditCompanyCustom("");
    } else {
      setEditCompanySelect(customCompanyLabel);
      setEditCompanyCustom(baseCompany);
    }

    setEditRate(String(r.hourlyRateVal || 65));
    setEditOvertime(String(r.overtimeRateVal || Math.round(r.hourlyRateVal * 1.5)));
    setEditAllowance(String(r.dailyAllowanceVal || 0));
  };

  const handleSaveChanges = (id: string) => {
    setIsSaving(true);
    
    // Determine target company name
    const targetCompany = editCompanySelect === customCompanyLabel
      ? editCompanyCustom.trim() || "Custom Hire"
      : editCompanySelect;

    api.post(`/resources/${id}/update`, {
        email: editEmail,
        company: targetCompany,
        rate: editRate,
        overtimeRateVal: editOvertime,
        dailyAllowanceVal: editAllowance
      })
      .then(() => {
        setIsSaving(false);
        setExpandedResId(null);
        loadAllData();
      })
      .catch(err => {
        console.error("Error updating resource details:", err);
        setIsSaving(false);
      });
  };

  const handleAddResource = () => {
    if (!newName.trim()) {
      alert("Please enter a professional name.");
      return;
    }

    const targetCompany = newCompanySelect === customCompanyLabel
      ? newCompanyCustom.trim() || "Custom Hire"
      : newCompanySelect;

    api.post("/resources", {
        name: newName,
        trade: newTrade,
        state: newState,
        rate: newRate,
        email: newEmail,
        company: targetCompany,
        overtimeRateVal: newOvertime,
        dailyAllowanceVal: newAllowance,
        rate_type: newRateType,
        bio: newBio.trim() || undefined,
        skills: newSkillsText.trim() || undefined,
      })
      .then(() => {
        setNewName("");
        setNewEmail("");
        setNewCompanySelect("Direct Hire");
        setNewCompanyCustom("");
        setNewOvertime("");
        setNewAllowance("");
        setNewBio("");
        setNewSkillsText("");
        setNewRateType("hourly");
        setShowAddModal(false);
        loadAllData();
      })
      .catch(err => console.error("Error adding resource:", err));
  };

  // Perform bulk import submission
  const handleBulkImportSubmit = () => {
    if (!importText.trim()) {
      setImportError("Please provide raw data to parse.");
      return;
    }

    // Try parsing the text (CSV/TSV representation)
    const lines = importText.split("\n");
    const parsedList: any[] = [];

    lines.forEach((line, idx) => {
      const cleanLine = line.trim();
      if (!cleanLine || idx === 0 && cleanLine.toLowerCase().includes("name,trade")) {
        // Skip header or empty rows
        return;
      }
      const parts = cleanLine.split(/,|\t/); // split by comma or tab
      if (parts.length >= 2) {
        const name = parts[0]?.trim();
        const trade = parts[1]?.trim();
        const rate = parseInt(parts[2]?.trim()) || 65;
        const company = parts[3]?.trim() || "Direct Hire";
        const email = parts[4]?.trim() || `${name.toLowerCase().replace(/\s+/g, ".")}@builderportal.com.au`;
        const state = parts[5]?.trim() || "NSW";
        const overtime = parseInt(parts[6]?.trim()) || Math.round(rate * 1.5);
        const allowance = parseInt(parts[7]?.trim()) || 0;

        if (name && trade) {
          parsedList.push({
            name,
            trade,
            rate,
            company,
            email,
            state,
            overtimeRateVal: overtime,
            dailyAllowanceVal: allowance
          });
        }
      }
    });

    if (parsedList.length === 0) {
      setImportError("No valid rows discovered. Check trade role and comma format!");
      return;
    }

    setImportError("");
    api.post("/resources/bulk", { list: parsedList })
      .then(data => {
        if (data.success) {
          setShowImportModal(false);
          setImportText("");
          loadAllData();
        } else {
          setImportError("Server was unable to import list.");
        }
      })
      .catch(err => {
        console.error("Error posting bulk roster import:", err);
        setImportError("Connection failed while importing.");
      });
  };

  // Preset Template loader for 1-click bulk import demo
  const loadPresetDemoTeam = () => {
    const demoCsv = `Name,Trade,Rate,Company,Email,State,Overtime,Allowance
Sarah Jenkins,Structural Foreman,85,Multiplex Hire Ltd,sarah.jenkins@multiplex.com,NSW,120,50
Bruce Vance,Formwork Foreman,75,Elite Formwork Ltd,bruce.vance@elite.com,VIC,110,0
David O'Connor,Site Manager,95,Direct Hire,david.oconnor@builderportal.com.au,NSW,140,80
Liam Vance,Services Coordinator,70,Probuild Mechanical Group,liam.vance@probuild.com,QLD,105,40
Amanda Green,HSE Officer,65,Direct Hire,amanda.green@builderportal.com.au,WA,95,0`;
    setImportText(demoCsv);
    setImportError("");
  };

  if (loading) {
    return <div style={{ padding: 20, color: C.gray }}>Loading your team…</div>;
  }

  const activeResources = resources.length;
  const overAllocated = resources.filter(r => r.util > 100).length;
  const underUtilised = resources.filter(r => r.util < 20).length;
  const avgUtil = Math.round(resources.reduce((acc, curr) => acc + curr.util, 0) / (resources.length || 1));

  const trades = Array.from(new Set(resources.map(r => r.trade))) as string[];

  // Filter based on both Search Query AND Selected Trade Filter
  const filtered = resources.filter(r => {
    const matchesSearch = searchQuery.trim() === "" || r.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTrade = tradeFilter === "all" || r.trade === tradeFilter;
    return matchesSearch && matchesTrade;
  });

  return (
    <div>
      {/* Portfolio Roster Overview Header Metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:10, marginBottom:16 }}>
        <KpiCard label="Active Team" value={`${activeResources}`} sub="PMs, Foreman & Trades" />
        <KpiCard label="Overbooked (>100%)" value={`${overAllocated}`} valueColor={C.red} sub="Booked beyond full time" />
        <KpiCard label="Spare Capacity (<20%)" value={`${underUtilised}`} valueColor={C.amber} sub="Lots of free time" />
        <KpiCard label="Average Workload" value={`${avgUtil}%`} trend="↑ Healthy balance" />
      </div>

      <Card>
        {/* Filter Board containing Search and Import Wizards */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize:13, fontWeight:600, color:C.text }}>Site Team & Subcontractors</span>
          
          <div style={{ display:"flex", gap:8, alignItems: "center", flexWrap: "wrap", width: "100%", justifyContent: "flex-end" }}>
            {/* Search Input Filter */}
            <div style={{ position: "relative", minWidth: 220 }}>
              <input 
                type="text" 
                placeholder="Search by name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: 12,
                  padding: "6px 12px 6px 30px",
                  borderRadius: 8,
                  border: `0.5px solid ${C.grayLight}`,
                  background: C.white,
                  fontFamily: "inherit",
                  outline: "none"
                }}
              />
              <Search size={13} color={C.gray} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
            </div>

            {/* Trade Selection Filter */}
            <select 
              value={tradeFilter} 
              onChange={e => setTradeFilter(e.target.value)}
              style={{ fontSize:12, padding:"5px 12px", borderRadius:8, border:`0.5px solid ${C.grayLight}`, background:C.white, color:C.text, fontFamily:"inherit" }}
            >
              <option value="all">All Trades</option>
              {trades.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            
            <Btn onClick={() => setShowImportModal(true)}>📤 Import Roster</Btn>
            <Btn primary small onClick={() => { setShowAddOptional(false); setShowAddModal(true); }}>+ Add Resource</Btn>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: C.gray, fontSize: 12 }}>
            No team members match your filters. Try clearing the search or filters.
          </div>
        ) : (
          filtered.map(r => {
            let badgeText = "Balanced";
            let badgeBg: string = C.greenBg;
            let badgeColor: string = C.greenDark;

            if (r.util > 100) {
              badgeText = "Overbooked";
              badgeBg = C.redBg;
              badgeColor = C.redDark;
            } else if (r.util < 20) {
              badgeText = "Spare capacity";
              badgeBg = C.amberBg;
              badgeColor = C.amber;
            }

            const isExpanded = expandedResId === r.id;

            return (
              <div key={r.id} style={{ border:`0.5px solid ${C.grayLight}`, borderRadius:10, marginBottom:8, overflow:"hidden", transition:"all 0.2s" }}>
                {/* Accordion List Header */}
                <div 
                  onClick={() => handleExpandResource(r)}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background: isExpanded ? "#F8FAFC" : C.white, cursor:"pointer", flexWrap: "wrap", justifyContent: "space-between" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background: isExpanded ? C.blueLight : "#B5D4F4", color: isExpanded ? C.navy : "#0C447C", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {r.initials}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{r.name}</div>
                      <div style={{ fontSize:11, color:C.gray, marginTop: 2 }}>
                        {r.trade} · <span style={{ color: C.navy, fontWeight: 500 }}>{r.company || "Direct Hire"}</span> · Base: <strong>{r.rate || `A$${r.hourlyRateVal}/hr`}</strong>
                      </div>
                      {r.bio && <div style={{ fontSize:10.5, color:"#94A3B8", marginTop: 3, maxWidth: 460 }}>{r.bio}</div>}
                      {r.skills && r.skills.length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop: 5 }}>
                          {r.skills.map(s => (
                            <span key={s} style={{ fontSize:9, padding:"1px 6px", borderRadius:4, background:C.blueLight, color:C.blue, fontWeight:600 }}>{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <span style={{
                      fontSize:9.5, fontWeight:600, padding:"2px 8px", borderRadius:6,
                      background: badgeBg, color: badgeColor, minWidth: 90, textAlign: "center"
                    }}>
                      {badgeText}
                    </span>
                    <UtilBar util={r.util} />
                    <span style={{ fontSize: 11, color: C.gray }}>{isExpanded ? "▲ Hide Option" : "▼ Edit Professional Detail"}</span>
                  </div>
                </div>

                {/* Subcontractor Panel / Accordion Drawer Detail */}
                {isExpanded && (
                  <div style={{ padding: "18px 24px", borderTop: `1px solid ${C.grayLight}`, background: "#F1F5F9" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy, marginBottom: 12, display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><FileText size={14} /> Detail Card & Site Allowances Config ({r.name})</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
                      
                      {/* Dropdown vs Free text selector for Employer */}
                      <div>
                        <label style={{ display:"block", fontSize:10, color:C.gray, textTransform:"uppercase", fontWeight:600, marginBottom:4 }}>Subcontractor Company / Employer</label>
                        <select
                          value={editCompanySelect}
                          onChange={e => setEditCompanySelect(e.target.value)}
                          style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, background: C.white, marginBottom: editCompanySelect === customCompanyLabel ? 6 : 0 }}
                        >
                          {companyOptions.map(comp => (
                            <option key={comp} value={comp}>{comp}</option>
                          ))}
                        </select>
                        {editCompanySelect === customCompanyLabel && (
                          <input 
                            type="text" 
                            placeholder="Enter Custom Subcontractor Company Name"
                            value={editCompanyCustom} 
                            onChange={e => setEditCompanyCustom(e.target.value)} 
                            style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, background: C.white }}
                          />
                        )}
                      </div>

                      <div>
                        <label style={{ display:"block", fontSize:10, color:C.gray, textTransform:"uppercase", fontWeight:600, marginBottom:4 }}>Primary Notification Email</label>
                        <input 
                          type="email" 
                          value={editEmail} 
                          onChange={e => setEditEmail(e.target.value)} 
                          style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, background: C.white }}
                        />
                      </div>

                      <div>
                        <label style={{ display:"block", fontSize:10, color:C.gray, textTransform:"uppercase", fontWeight:600, marginBottom:4 }}>Base Hourly Rate (A$/hr)</label>
                        <input 
                          type="number" 
                          value={editRate} 
                          onChange={e => setEditRate(e.target.value)} 
                          style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, background: C.white }}
                        />
                      </div>

                      <div>
                        <label style={{ display:"block", fontSize:10, color:C.gray, textTransform:"uppercase", fontWeight:600, marginBottom:4 }}>Overtime Loader Rate (A$/hr)</label>
                        <input 
                          type="number" 
                          value={editOvertime} 
                          onChange={e => setEditOvertime(e.target.value)} 
                          style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, background: C.white }}
                        />
                      </div>

                      <div>
                        <label style={{ display:"block", fontSize:10, color:C.gray, textTransform:"uppercase", fontWeight:600, marginBottom:4 }}>Daily Site Allowance / Per-Diem (A$)</label>
                        <input 
                          type="number" 
                          value={editAllowance} 
                          placeholder="e.g. 50"
                          onChange={e => setEditAllowance(e.target.value)} 
                          style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, background: C.white }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Btn primary small onClick={() => handleSaveChanges(r.id)} style={{ padding: "6px 14px" }}>
                        {isSaving ? "Saving…" : "Save Roster"}
                      </Btn>
                      <Btn onClick={() => setExpandedResId(null)} style={{ padding: "6px 14px" }}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </Card>

      {/* Add Resource Modal — simplified to 5 core fields */}
      {showAddModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99 }}>
          <Card style={{ width: 400, padding: 22, overflowY: "auto", maxHeight: "90vh" }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Add Resource / Subcontractor</div>
            <div style={{ fontSize:11, color:C.gray, marginBottom:16 }}>Register a team member or subcontractor company for scheduling.</div>

            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Full Name *</label>
              <input
                type="text"
                placeholder="e.g. Wayne Roberts"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
              />
            </div>

            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Trade / Role *</label>
              <select value={newTrade} onChange={e => setNewTrade(e.target.value)} style={{ width:"100%", fontSize:12, padding:"7px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}>
                {(masters?.trades || []).map(t => (
                  <option key={t.id} value={t.label}>{t.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>State *</label>
                <select value={newState} onChange={e => setNewState(e.target.value)} style={{ width:"100%", fontSize:12, padding:"7px 6px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}>
                  {(masters?.states || []).map(s => (
                    <option key={s.id} value={s.code || s.label}>{s.code || s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Base Rate (A$/hr) *</label>
                <input
                  type="number"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Company / Employer *</label>
              <select
                value={newCompanySelect}
                onChange={e => setNewCompanySelect(e.target.value)}
                style={{ width:"100%", fontSize:12, padding:"7px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, marginBottom: newCompanySelect === customCompanyLabel ? 6 : 0 }}
              >
                {companyOptions.map(comp => (
                  <option key={comp} value={comp}>{comp}</option>
                ))}
              </select>
              {newCompanySelect === customCompanyLabel && (
                <input
                  type="text"
                  placeholder="Enter company name"
                  value={newCompanyCustom}
                  onChange={e => setNewCompanyCustom(e.target.value)}
                  style={{ width:"100%", fontSize:12, padding:"7px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                />
              )}
            </div>

            {/* Optional details accordion */}
            <button
              type="button"
              onClick={() => setShowAddOptional(v => !v)}
              style={{ width:"100%", background:"#F8FAFC", border:`0.5px solid ${C.grayLight}`, borderRadius:8, padding:"8px 12px", fontSize:11.5, color:C.gray, cursor:"pointer", textAlign:"left", marginBottom:10, display:"flex", justifyContent:"space-between" }}
            >
              <span>Optional details (email, overtime, allowance)</span>
              <span>{showAddOptional ? "▲" : "▼"}</span>
            </button>
            {showAddOptional && (
              <div style={{ marginBottom:14, display:"flex", flexDirection:"column", gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Email</label>
                  <input
                    type="email"
                    placeholder="e.g. wayne@subby.com.au"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                  />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Overtime Rate (A$/hr)</label>
                    <input
                      type="number"
                      value={newOvertime}
                      placeholder={`e.g. ${Math.round(Number(newRate || 65) * 1.5)}`}
                      onChange={e => setNewOvertime(e.target.value)}
                      style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Daily Allowance (A$)</label>
                    <input
                      type="number"
                      value={newAllowance}
                      placeholder="e.g. 50"
                      onChange={e => setNewAllowance(e.target.value)}
                      style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Bio / Summary</label>
                  <textarea
                    rows={2}
                    value={newBio}
                    placeholder="e.g. 8 yrs concrete formwork. Strong on post-tension decks."
                    onChange={e => setNewBio(e.target.value)}
                    style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, resize:"vertical", fontFamily:"inherit" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Skills <span style={{ fontWeight:400 }}>(comma-separated)</span></label>
                  <input
                    type="text"
                    value={newSkillsText}
                    placeholder="e.g. Jump-form, Post-tension decks, Crane coordination"
                    onChange={e => setNewSkillsText(e.target.value)}
                    style={{ width:"100%", fontSize:12, padding:"6px 10px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                  />
                </div>
              </div>
            )}

            <div style={{ display:"flex", gap:8 }}>
              <Btn primary onClick={handleAddResource}>Add Resource</Btn>
              <Btn onClick={() => { setShowAddModal(false); setShowAddOptional(false); setNewBio(""); setNewSkillsText(""); }}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Bulk Resource Import Modal */}
      {showImportModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99 }}>
          <Card style={{ width: 550, padding: 22, overflowY: "auto", maxHeight: "90vh" }}>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>Import Team Roster</div>
              <div style={{ fontSize:11, color:C.gray, marginBottom:12 }}>Paste CSV/tab-separated rows — or load the sample team to see it in action instantly.</div>
              <button
                onClick={loadPresetDemoTeam}
                style={{
                  width:"100%", padding:"10px 14px", fontSize:12.5, fontWeight:700, borderRadius:8,
                  background: C.blue, color:C.white, border:"none", cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom:10
                }}
              >
                ✨ Load sample team (5 people, one click)
              </button>
              <div style={{ fontSize:10.5, color:C.gray, textAlign:"center" }}>— or paste your own below —</div>
            </div>

            <p style={{ fontSize: 10.5, color: C.gray, lineHeight: "1.4", marginBottom: 8 }}>
              Column order: <strong>Name, Trade, Rate, Company, Email, State, Overtime, Allowance</strong>
            </p>

            <textarea 
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Example format:&#10;John Smith, Formwork Foreman, 80, Apex Foundations, john@apex.com, NSW, 120, 50&#10;Alice Brown, Structural Foreman, 85, Elite Formwork, alice@elite.com, VIC"
              style={{
                width: "100%",
                height: 180,
                fontSize: 11.5,
                fontFamily: "monospace",
                padding: 10,
                borderRadius: 6,
                border: `0.5px solid ${C.grayLight}`,
                outline: "none",
                background: "#FAFBFD",
                marginBottom: 8
              }}
            />

            {importError && (
              <div style={{ color:C.red, fontSize:11.5, fontWeight:600, marginBottom:10, display:"inline-flex", alignItems:"center", gap:5 }}>
                <AlertTriangle size={12} /> {importError}
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <Btn primary onClick={handleBulkImportSubmit}>Import All</Btn>
              <Btn onClick={() => { setShowImportModal(false); setImportError(""); }}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
