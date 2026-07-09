import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Project, ProgressClaim } from "../types";
import { KpiCard, Card, StatusBadge, Btn } from "./Dashboard";
import { RefreshCw } from "lucide-react";
import { fmtMoney, toDollars } from "../lib/money";
import {
  FinMap, CATEGORY_ORDER,
  portfolioKpis, projectsByType, projectsByRegion, durationWeeks,
  monthlySpendSeries, monthRangeOf, budgetVsCostByType, budgetVsCostByRegion,
  budgetVsCostByContractor, marginByProject, costOverrunByProject,
  expensesShareByProject, categoryStackedByProject, ymOf, monthLabel,
} from "./finance/financeData";
import {
  ChartCard, PieCard, CountPie, DollarPie, RegionTreemap, HorizontalBar,
  GroupedDollarBar, PercentColumn, ContractorComposed, SpendOverTimeArea,
  CategoryStackedBar,
} from "./finance/financeCharts";
import { ChevronDown } from "lucide-react";

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
  navy:       "#0F1F3D",
};

// Fixed categorical order — never cycled/re-derived from filter state, so a
// category or project keeps the same color across every chart on the page.
const COLOR_PALETTE = ["#2563EB", "#1D9E75", "#B87316", "#E04A4A", "#7F77DD", "#64748B", "#EC4899"];
const CATEGORY_COLORS = COLOR_PALETTE;

const filterInputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11.5,
  borderRadius: 8,
  border: `0.5px solid ${C.grayLight}`,
  fontFamily: "inherit",
};

function projectHasAlert(p: Project) {
  return p.overBudget || p.actualCost > p.plannedCost;
}

const PAGES = [
  { id: "overview", label: "Overview" },
  { id: "budgetcost", label: "Budget vs Actual" },
  { id: "expenses", label: "Cost Breakdown" },
  { id: "compare", label: "Compare" },
];

export default function ScreenFinancial() {
  const [page, setPage] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [projList, setProjList] = useState<Project[]>([]);
  const [claims, setClaims] = useState<ProgressClaim[]>([]);
  const [projectFinMap, setProjectFinMap] = useState<FinMap>({});

  // Slicers — mirror the Power BI report: Project Name, Location, Contractor, Project Type.
  const [filterSearch, setFilterSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterContractor, setFilterContractor] = useState("all");
  const [filterType, setFilterType] = useState("all");

  // Project show/hide checkboxes — null means "all visible" (default, before
  // the project list has loaded or nothing's been unchecked yet).
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(new Set());
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // Date range (year-month, e.g. "2026-03") — clips the spend-over-time chart
  // and narrows every tab to projects active within the range.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDetail, setProjectDetail] = useState<FinMap[string] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ProgressClaim | null>(null);
  const [certifyingClaim, setCertifyingClaim] = useState<ProgressClaim | null>(null);
  const [certifiedVal, setCertifiedVal] = useState("");

  const loadFinancialData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/v1/projects").then((res) => res.json()),
      fetch("/api/v1/claims").then((res) => res.json()),
    ])
      .then(([projs, claimsData]) => {
        const projectList = Array.isArray(projs) ? projs : [];
        setProjList(projectList);
        setClaims(Array.isArray(claimsData) ? claimsData : []);
        return Promise.all(
          projectList.map((p: Project) =>
            fetch(`/api/v1/financial/projects/${p.id}`)
              .then((res) => res.json())
              .then((detail) => ({ id: p.id, detail }))
          )
        );
      })
      .then((finRows) => {
        if (finRows) {
          const map: FinMap = {};
          finRows.forEach(({ id, detail }) => {
            map[id] = detail;
          });
          setProjectFinMap(map);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Financial: Error fetching financial reports state:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  const openProjectDetail = (p: Project) => {
    setSelectedProject(p);
    setProjectDetail(null);
    setDetailLoading(true);
    fetch(`/api/v1/financial/projects/${p.id}`)
      .then((res) => res.json())
      .then((data) => {
        setProjectDetail(data);
        setDetailLoading(false);
      })
      .catch(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setSelectedProject(null);
    setProjectDetail(null);
    setSelectedClaim(null);
  };

  const locations = useMemo(() => Array.from(new Set(projList.map((p) => p.location))).sort(), [projList]);
  const contractors = useMemo(() => Array.from(new Set(projList.map((p) => p.contractor))).sort(), [projList]);
  const types = useMemo(() => Array.from(new Set(projList.map((p) => p.type))).sort(), [projList]);

  const hasActiveFilters =
    filterSearch.trim() !== "" || filterProject !== "all" || filterLocation !== "all" ||
    filterContractor !== "all" || filterType !== "all" || hiddenProjectIds.size > 0 ||
    dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setFilterSearch("");
    setFilterProject("all");
    setFilterLocation("all");
    setFilterContractor("all");
    setFilterType("all");
    setHiddenProjectIds(new Set());
    setDateFrom("");
    setDateTo("");
  };

  const fullRange = useMemo(() => monthRangeOf(projList), [projList]);
  const monthOptions = useMemo(() => {
    if (!fullRange) return [] as string[];
    const opts: string[] = [];
    let [y, m] = fullRange.minYM.split("-").map(Number);
    const [ey, em] = fullRange.maxYM.split("-").map(Number);
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard < 240) {
      opts.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
      guard++;
    }
    return opts;
  }, [fullRange]);

  const toggleProjectVisible = (id: string) =>
    setHiddenProjectIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filteredProjects = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return projList.filter((p) => {
      if (hiddenProjectIds.has(p.id)) return false;
      if (filterProject !== "all" && p.id !== filterProject) return false;
      if (filterLocation !== "all" && p.location !== filterLocation) return false;
      if (filterContractor !== "all" && p.contractor !== filterContractor) return false;
      if (filterType !== "all" && p.type !== filterType) return false;
      if (dateFrom && ymOf(p.pcEndDate) < dateFrom) return false;
      if (dateTo && ymOf(p.pcStartDate) > dateTo) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.contractor.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
      );
    });
  }, [projList, filterSearch, filterProject, filterLocation, filterContractor, filterType, hiddenProjectIds, dateFrom, dateTo]);

  const detailClaims = selectedProject ? claims.filter((c) => c.projectId === selectedProject.id) : [];

  const getProjectRetentionPct = (projectId: string) => {
    const proj = projList.find((p) => p.id === projectId);
    return proj?.retentionPercent ?? 5.0;
  };

  const certRetentionPreview = certifyingClaim
    ? (parseFloat(certifiedVal) || 0) * (getProjectRetentionPct(certifyingClaim.projectId) / 100) * 1000
    : 0;

  const handleCertifyClaim = () => {
    if (!certifyingClaim) return;
    const certNum = parseFloat(certifiedVal) || 1.0;
    fetch(`/api/v1/claims/${certifyingClaim.id}/certify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certifiedAmountVal: certNum }),
    })
      .then((res) => res.json())
      .then(() => {
        setCertifyingClaim(null);
        setCertifiedVal("");
        loadFinancialData();
      })
      .catch((err) => console.error("Error certifying claim:", err));
  };

  const openClaimsPage = () => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/claims") {
      window.history.pushState({}, "", "/claims");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  // ── Chart data — pure selectors over the filtered project set (finance/financeData.ts) ──
  const kpis = useMemo(() => portfolioKpis(filteredProjects, projectFinMap), [filteredProjects, projectFinMap]);
  const typeData = useMemo(() => projectsByType(filteredProjects), [filteredProjects]);
  const regionData = useMemo(() => projectsByRegion(filteredProjects), [filteredProjects]);
  const durationData = useMemo(() => durationWeeks(filteredProjects), [filteredProjects]);
  const spendOverTime = useMemo(
    () => monthlySpendSeries(filteredProjects, projectFinMap, { fromYM: dateFrom || undefined, toYM: dateTo || undefined }),
    [filteredProjects, projectFinMap, dateFrom, dateTo]
  );
  const byType = useMemo(() => budgetVsCostByType(filteredProjects, projectFinMap), [filteredProjects, projectFinMap]);
  const byRegion = useMemo(() => budgetVsCostByRegion(filteredProjects, projectFinMap), [filteredProjects, projectFinMap]);
  const byContractor = useMemo(() => budgetVsCostByContractor(filteredProjects, projectFinMap), [filteredProjects, projectFinMap]);
  const marginData = useMemo(() => marginByProject(filteredProjects, projectFinMap), [filteredProjects, projectFinMap]);
  const overrunData = useMemo(() => costOverrunByProject(filteredProjects, projectFinMap), [filteredProjects, projectFinMap]);
  const expensesShare = useMemo(() => expensesShareByProject(filteredProjects, projectFinMap), [filteredProjects, projectFinMap]);
  const categoryStacked = useMemo(() => categoryStackedByProject(filteredProjects, projectFinMap), [filteredProjects, projectFinMap]);

  if (loading) {
    return (
      <div style={{ padding: 20, color: C.gray, fontSize: 13 }}>
        Loading financial portfolio data…
      </div>
    );
  }

  const DetailPanel = () => {
    if (!selectedProject) return null;
    const p = selectedProject;
    const isDoneProject = p.status === "COMPLETED";
    const hasAlert = projectHasAlert(p);
    const fin = projectDetail;

    return (
      <aside style={panelStyle}>
        <PanelHeader title={p.name} onClose={closeDetail} />
        <div style={{ padding: "0 18px 18px", overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 11.5, color: C.gray, marginBottom: 14 }}>
            {p.contractor} · {p.location} · {p.state}
          </div>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
            background: isDoneProject ? C.blueLight : hasAlert ? C.redBg : C.greenBg,
            color: isDoneProject ? C.blue : hasAlert ? C.redDark : C.greenDark,
            textTransform: "uppercase", display: "inline-block", marginBottom: 16,
          }}>
            {isDoneProject ? "Completed" : hasAlert ? "In Audit Review" : "Cost Within Bounds"}
          </span>

          {detailLoading ? (
            <div style={{ color: C.gray, fontSize: 12, padding: 20 }}>Loading project financials…</div>
          ) : (
            <>
              {/* Clean expected-vs-actual breakdown, by category — Labour, Materials,
                  Subcontractors, Plant & custom lines, each with its own variance. */}
              <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                Expected vs actual
              </div>
              {fin && fin.categoryBreakdown && fin.categoryBreakdown.length > 0 ? (
                <div style={{ marginBottom: 12, border: `0.5px solid ${C.grayLight}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", padding: "8px 10px", background: "#F8FAFC", fontSize: 10, fontWeight: 600, color: C.gray, textTransform: "uppercase" }}>
                    <span>Category</span><span style={{ textAlign: "right" }}>Expected</span><span style={{ textAlign: "right" }}>Actual</span><span style={{ textAlign: "right" }}>Variance</span>
                  </div>
                  {fin.categoryBreakdown.map((row) => (
                    <div key={row.category} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", padding: "8px 10px", fontSize: 12, borderTop: `0.5px solid ${C.grayLight}` }}>
                      <span style={{ color: C.text }}>{row.category}</span>
                      <span style={{ textAlign: "right", color: C.text }}>{fmtMoney(row.expected)}</span>
                      <span style={{ textAlign: "right", color: C.text, fontWeight: 600 }}>{fmtMoney(row.actual)}</span>
                      <span style={{ textAlign: "right", fontWeight: 600, color: row.variance > 0 ? C.red : row.variance < 0 ? C.green : C.gray }}>
                        {row.variance >= 0 ? "+" : ""}{fmtMoney(row.variance)}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", padding: "8px 10px", fontSize: 12, fontWeight: 700, borderTop: `1px solid ${C.grayLight}`, background: "#F8FAFC" }}>
                    <span>Total</span>
                    <span style={{ textAlign: "right" }}>{fmtMoney(fin.budgetLinesTotalDollars ?? 0)}</span>
                    <span style={{ textAlign: "right" }}>{fmtMoney(fin.actualLinesTotalDollars ?? 0)}</span>
                    <span style={{ textAlign: "right", color: (fin.actualLinesTotalDollars ?? 0) > (fin.budgetLinesTotalDollars ?? 0) ? C.red : C.green }}>
                      {fmtMoney((fin.actualLinesTotalDollars ?? 0) - (fin.budgetLinesTotalDollars ?? 0))}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.gray, padding: 12, background: "#F8FAFC", borderRadius: 8, marginBottom: 12 }}>
                  No cost lines yet — add a projected budget when the project is created, or an actual cost from the Projects tab.
                </div>
              )}

              {fin && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "Contract sum", value: fmtMoney(fin.contractSumDollars ?? toDollars(p.finalContractSum)) },
                    { label: "Revenue received", value: fmtMoney(fin.revenueDollars ?? 0), color: C.greenDark },
                    { label: "Projected profit", value: fmtMoney(fin.projectedProfitDollars ?? 0), color: (fin.projectedProfitDollars ?? 0) >= 0 ? C.greenDark : C.red },
                    { label: "Actual profit", value: fmtMoney(fin.actualProfitDollars ?? 0), color: (fin.actualProfitDollars ?? 0) >= 0 ? C.greenDark : C.red },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: 10, background: "#F8FAFC", borderRadius: 8, border: `0.5px solid ${C.grayLight}` }}>
                      <div style={{ fontSize: 9.5, color: C.gray, textTransform: "uppercase" }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: item.color || C.text, marginTop: 4 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {fin && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Contract detail</div>
                  <DetailRow label="Original contract" value={fmtMoney(toDollars(p.originalContractSum))} />
                  <DetailRow label="Final adjusted sum" value={fmtMoney(toDollars(p.finalContractSum))} />
                  <DetailRow label="Retention held" value={fmtMoney(fin.retentionBalanceVal)} />
                  <DetailRow label="LD exposure (est.)" value={fmtMoney(fin.ldExposure)} highlight={fin.ldExposure > 0} />
                  <DetailRow label="LD rate / day" value={fmtMoney(p.ldRatePerDay || 0)} />
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                Progress claims ({detailClaims.length})
              </div>
              {detailClaims.length === 0 ? (
                <div style={{ fontSize: 12, color: C.gray, padding: 12, background: "#F8FAFC", borderRadius: 8 }}>No claims on record for this project.</div>
              ) : (
                detailClaims.map((c) => (
                  <div key={c.id} style={{ marginBottom: 8 }}>
                    <div
                      onClick={() => setSelectedClaim(selectedClaim?.id === c.id ? null : c)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 12px",
                        border: `0.5px solid ${selectedClaim?.id === c.id ? C.blue : C.grayLight}`,
                        borderRadius: 8,
                        fontSize: 12,
                        cursor: "pointer",
                        background: selectedClaim?.id === c.id ? C.blueLight : C.white,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, color: C.text }}>{c.claimNumber}</div>
                        <div style={{ fontSize: 10.5, color: C.gray, marginTop: 2 }}>{c.period} · {c.costCategoryName || "—"}</div>
                        {c.description && (
                          <div style={{ fontSize: 10.5, color: C.text, marginTop: 4, lineHeight: 1.4 }}>{c.description}</div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600 }}>{c.certifiedAmount || c.claimedAmount}</div>
                        <StatusBadge status={c.status} />
                        <div style={{ fontSize: 10.5, color: C.blue, marginTop: 4 }}>View detail</div>
                      </div>
                    </div>
                    {selectedClaim?.id === c.id && (
                      <div style={{ marginTop: 8, padding: 12, border: `0.5px solid ${C.grayLight}`, borderRadius: 8, background: "#F8FAFC" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{selectedClaim.claimNumber}</div>
                          <StatusBadge status={selectedClaim.status} />
                        </div>
                        <DetailRow label="Project" value={selectedClaim.project} />
                        <DetailRow label="Category" value={selectedClaim.costCategoryName || "—"} />
                        <DetailRow label="Period" value={selectedClaim.period} />
                        <DetailRow label="Claimed" value={selectedClaim.claimedAmount} />
                        <DetailRow label="Certified" value={selectedClaim.certifiedAmount || "—"} />
                        <DetailRow label="Due date" value={selectedClaim.dueDate} />
                        {selectedClaim.description && (
                          <div style={{ fontSize: 11, color: C.text, marginTop: 8, lineHeight: 1.45 }}>{selectedClaim.description}</div>
                        )}
                        {selectedClaim.status === "pending" && (
                          <div style={{ marginTop: 10 }}>
                            <Btn
                              primary
                              small
                              onClick={() => {
                                setCertifyingClaim(selectedClaim);
                                setCertifiedVal(selectedClaim.claimedAmount.replace(/[^\d.]/g, ""));
                              }}
                            >
                              Approve / Certify
                            </Btn>
                          </div>
                        )}
                        <div style={{ marginTop: 8 }}>
                          <Btn small onClick={openClaimsPage}>Open full Claims page</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </aside>
    );
  };

  const chartGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 14 };

  return (
    <div style={{ display: "flex", gap: 0, position: "relative" }}>
      <div style={{ flex: 1, minWidth: 0, transition: "margin-right 0.2s" }}>
        {/* Slicers — filter every chart on every page, Power BI style */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
          marginBottom: 14, padding: "10px 12px",
          background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 10,
        }}>
          <input
            type="search"
            placeholder="Search project, contractor, location…"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            style={{ ...filterInputStyle, flex: "1 1 200px", minWidth: 180 }}
          />
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ ...filterInputStyle, minWidth: 150 }}>
            <option value="all">Project Name: All</option>
            {projList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} style={{ ...filterInputStyle, minWidth: 140 }}>
            <option value="all">Location: All</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filterContractor} onChange={(e) => setFilterContractor(e.target.value)} style={{ ...filterInputStyle, minWidth: 140 }}>
            <option value="all">Contractor: All</option>
            {contractors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...filterInputStyle, minWidth: 150 }}>
            <option value="all">Project Type: All</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Show/hide projects by checkbox — complements the single-select Project
              Name dropdown above; ticking off a few also declutters busy legends. */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowProjectPicker((v) => !v)}
              style={{ ...filterInputStyle, minWidth: 130, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, background: hiddenProjectIds.size > 0 ? C.blueLight : C.white }}
            >
              Projects{hiddenProjectIds.size > 0 ? ` (${projList.length - hiddenProjectIds.size}/${projList.length})` : ": All"}
              <ChevronDown size={13} />
            </button>
            {showProjectPicker && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.1)", padding: 10, width: 240, maxHeight: 280, overflowY: "auto" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 11 }}>
                  <button type="button" onClick={() => setHiddenProjectIds(new Set())} style={{ border: "none", background: "none", color: C.blue, cursor: "pointer", fontWeight: 600 }}>All</button>
                  <button type="button" onClick={() => setHiddenProjectIds(new Set(projList.map((p) => p.id)))} style={{ border: "none", background: "none", color: C.gray, cursor: "pointer", fontWeight: 600 }}>None</button>
                </div>
                {projList.map((p) => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12, cursor: "pointer", color: C.text }}>
                    <input type="checkbox" checked={!hiddenProjectIds.has(p.id)} onChange={() => toggleProjectVisible(p.id)} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <select value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...filterInputStyle, minWidth: 110 }}>
            <option value="">From: earliest</option>
            {monthOptions.map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
          </select>
          <select value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...filterInputStyle, minWidth: 110 }}>
            <option value="">To: latest</option>
            {monthOptions.map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
          </select>

          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} style={{ ...filterInputStyle, background: C.bgSecond, cursor: "pointer", color: C.gray }}>
              Clear filters
            </button>
          )}
          <Btn small onClick={loadFinancialData}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><RefreshCw size={13} /> Refresh</span></Btn>
          <span style={{ fontSize: 10.5, color: C.gray, marginLeft: "auto" }}>
            {filteredProjects.length} of {projList.length} projects
          </span>
        </div>

        {/* Page tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `0.5px solid ${C.grayLight}`, overflowX: "auto" }}>
          {PAGES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setPage(t.id); closeDetail(); }}
              style={{
                padding: "10px 14px", fontSize: 12.5, cursor: "pointer", border: "none", background: "none",
                borderBottom: `2.5px solid ${page === t.id ? C.blue : "transparent"}`,
                color: page === t.id ? C.blue : C.gray,
                fontWeight: page === t.id ? 600 : 400,
                marginBottom: -0.5, whiteSpace: "nowrap", fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filteredProjects.length === 0 && (
          <Card><div style={{ textAlign: "center", color: C.gray, padding: 24, fontSize: 13 }}>No projects match your filters.</div></Card>
        )}

        {/* Overview */}
        {page === "overview" && filteredProjects.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
              <KpiCard label="Number of Projects" value={`${kpis.numProjects}`} valueColor={C.blue} />
              <KpiCard label="Total Contract Price" value={fmtMoney(kpis.totalContract)} />
              <KpiCard label="Total Profit" value={fmtMoney(kpis.totalProfit)} valueColor={kpis.totalProfit >= 0 ? C.greenDark : C.red} />
              <KpiCard label="Total Costs" value={fmtMoney(kpis.totalCosts)} />
              <KpiCard label="Average Margin" value={`${(kpis.avgMargin * 100).toFixed(0)}%`} valueColor={kpis.avgMargin >= 0 ? C.green : C.red} />
            </div>

            <div style={chartGrid}>
              <PieCard title="Project Type" description="Share of projects by sector (e.g. residential vs commercial).">
                <CountPie data={typeData} colors={COLOR_PALETTE} />
              </PieCard>
              <ChartCard title="Project Location" description="Number of projects in each state; a larger box means more projects there.">
                <RegionTreemap data={regionData} baseColor={C.blue} />
              </ChartCard>
              <ChartCard title="Project Duration (weeks)" description="Duration of each project in weeks, start to finish, with the longest at the top.">
                <HorizontalBar data={durationData} dataKey="weeks" color={C.blueMid} />
              </ChartCard>
            </div>

            <ChartCard title="Spend Over Time" description="Actual cost incurred each month across the portfolio, one colour per project." height={300}>
              <SpendOverTimeArea rows={spendOverTime.rows} seriesNames={spendOverTime.seriesNames} colors={COLOR_PALETTE} />
            </ChartCard>
          </>
        )}

        {/* Budget vs Actual */}
        {page === "budgetcost" && filteredProjects.length > 0 && (
          <>
            <div style={chartGrid}>
              <ChartCard title="Budget vs Actual by Project Type" description="Contract value vs actual cost to date, grouped by sector.">
                <GroupedDollarBar data={byType} seriesA="Contract sum" seriesB="Actual cost" colorA={C.blueMid} colorB={C.amber} />
              </ChartCard>
              <ChartCard title="Budget vs Actual by Region" description="Contract value vs actual cost to date, grouped by state.">
                <GroupedDollarBar data={byRegion} seriesA="Contract sum" seriesB="Actual cost" colorA={C.blueMid} colorB={C.amber} />
              </ChartCard>
            </div>
            {/* Full-width — one bar per project, needs more room per label than the 2-up grid gives it. */}
            <ChartCard title="Profit Margin (projected)" description="Projected profit on each project as a percentage of its contract value; a negative value indicates a projected loss." height={280}>
              <PercentColumn data={marginData} color={C.green} />
            </ChartCard>
            <ChartCard title="Budget vs Actual by Contractor" description="Contract value (line) vs actual cost (bars) for each head contractor." height={320}>
              <ContractorComposed data={byContractor} barColor={C.amber} lineColor={C.blue} />
            </ChartCard>
          </>
        )}

        {/* Expenses */}
        {page === "expenses" && filteredProjects.length > 0 && (
          <>
            <div style={chartGrid}>
              <ChartCard title="Cost Overrun by Project" description="How far actual cost is over or under the projected budget; a bar to the right of A$0 is over budget.">
                <HorizontalBar data={overrunData} dataKey="overrun" color={C.red} unit="dollars" />
              </ChartCard>
              <PieCard title="Actual Spend by Project" description="Each slice is one project's share of total actual spend across the portfolio. A larger slice means higher spend; the percentage is that project's share of the total.">
                <DollarPie data={expensesShare} colors={COLOR_PALETTE} />
              </PieCard>
            </div>
            <ChartCard title="Cost Breakdown by Project" description="Total actual spend per project, split by cost type — Labour, Materials, Subcontractors, Plant. Bar height is the project's total spend; each segment is that category's amount. Hover a segment for the exact figure." height={320}>
              <CategoryStackedBar data={categoryStacked} categories={CATEGORY_ORDER} colors={CATEGORY_COLORS} />
            </ChartCard>
            <ChartCard title="Spend Over Time" description="Actual spend per calendar month across all projects. Each segment within a month is one project; a taller month means higher total spend." height={300}>
              <SpendOverTimeArea rows={spendOverTime.rows} seriesNames={spendOverTime.seriesNames} colors={COLOR_PALETTE} />
            </ChartCard>
          </>
        )}

        {/* Compare — plain numbers table, no charts. Click a row for the full category drawer. */}
        {page === "compare" && filteredProjects.length > 0 && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Projected vs actual, by project</span>
              <span style={{ fontSize: 10.5, color: C.gray }}>Click a row for the full category breakdown</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    {["Project", "Projected final", "Actual", "Variance", "Revenue received", "Profit (actual)"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontSize: 11, color: C.gray, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((p) => {
                    const fin = projectFinMap[p.id];
                    const projected = fin?.budgetLinesTotalDollars ?? toDollars(p.plannedCost);
                    const actual = fin?.actualLinesTotalDollars ?? toDollars(p.actualCost);
                    const revenue = fin?.revenueDollars ?? p.revenueReceived ?? 0;
                    const profit = fin?.actualProfitDollars ?? (revenue - actual);
                    const variance = actual - projected;
                    return (
                      <tr key={p.id} onClick={() => openProjectDetail(p)} style={{ cursor: "pointer" }}>
                        <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 500 }}>{p.name}</td>
                        <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, color: C.blue, fontWeight: 600 }}>{fmtMoney(projected)}</td>
                        <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 600 }}>{fmtMoney(actual)}</td>
                        <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, color: variance > 0 ? C.red : C.green, fontWeight: 600 }}>
                          {variance >= 0 ? "+" : ""}{fmtMoney(variance)}
                        </td>
                        <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}` }}>{fmtMoney(revenue)}</td>
                        <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 600, color: profit >= 0 ? C.greenDark : C.red }}>{fmtMoney(profit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <DetailPanel />
      {certifyingClaim && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,31,61,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <Card style={{ width: 340, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Approve / Certify {certifyingClaim.claimNumber}</div>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>Claimed: <strong>{certifyingClaim.claimedAmount}</strong></div>
            {certifyingClaim.description && (
              <div style={{ fontSize: 11, color: C.text, marginBottom: 10, padding: 10, background: "#F8FAFC", borderRadius: 6, lineHeight: 1.45 }}>
                {certifyingClaim.description}
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Certified Value (A$ Millions)</label>
              <input
                type="number"
                step="0.1"
                value={certifiedVal}
                onChange={(e) => setCertifiedVal(e.target.value)}
                style={{ width: "100%", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `0.5px solid ${C.grayLight}` }}
              />
              <div style={{ fontSize: 10, color: C.gray, marginTop: 4 }}>
                * {getProjectRetentionPct(certifyingClaim.projectId)}% retention (A${certRetentionPreview.toFixed(0)}K) will be held.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn primary onClick={handleCertifyClaim}>Approve</Btn>
              <Btn onClick={() => setCertifyingClaim(null)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 380,
  flexShrink: 0,
  background: "#FFFFFF",
  border: `0.5px solid #E2E8F0`,
  borderRadius: 12,
  marginLeft: 14,
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100vh - 120px)",
  position: "sticky",
  top: 12,
  alignSelf: "flex-start",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 18px", borderBottom: "0.5px solid #E2E8F0", gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1E293B", lineHeight: 1.35 }}>{title}</div>
      <button type="button" onClick={onClose} style={{ border: "none", background: "#EEF2F8", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, color: "#64748B", flexShrink: 0 }}>✕</button>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #E2E8F0", fontSize: 12 }}>
      <span style={{ color: "#64748B" }}>{label}</span>
      <span style={{ fontWeight: highlight ? 600 : 500, color: highlight ? "#E04A4A" : "#1E293B" }}>{value}</span>
    </div>
  );
}
