import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Project, ProgressClaim } from "../types";
import { KpiCard, Card, StatusBadge, Btn, SectionHeader } from "./Dashboard";

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

const COLOR_PALETTE = ["#2563EB", "#1D9E75", "#B87316", "#E04A4A", "#7F77DD", "#64748B", "#EC4899"];

interface ProjectFinDetail {
  name: string;
  contractSumVal: number;
  plannedCostVal: number;
  actualCostVal: number;
  scheduledCostVal?: number;
  profitVal: number;
  marginVal: number;
  costOverrunVal: number;
  revenueVarianceVal: number;
  retentionBalanceVal: number;
  ldExposure: number;
}

interface VariationLogItem {
  id: string;
  project: string;
  description: string;
  amount: number;
  type: string;
  status: string;
}

interface WeeklyRow {
  key: string;
  period: string;
  totalLabel: string;
  totalK: number;
  breakdown: Array<{ projectId: string; projectName: string; valK: number }>;
}

type PeriodFilterId = "all" | "last_30" | "last_90" | "this_year";

const PERIOD_FILTERS: Array<{ id: PeriodFilterId; label: string }> = [
  { id: "all", label: "All time" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "this_year", label: "This year" },
];

const PERIOD_LABELS: Record<PeriodFilterId, string> = {
  all: "All-time",
  last_30: "Last 30 days",
  last_90: "Last 90 days",
  this_year: "Current year",
};

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

export default function ScreenFinancial() {
  const isDev = import.meta.env.DEV;
  const exportDisabledTooltip = isDev ? "On development" : undefined;
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [projList, setProjList] = useState<Project[]>([]);
  const [costCategories, setCostCategories] = useState<{ id: string; name: string; is_active?: boolean }[]>([]);
  const [claims, setClaims] = useState<ProgressClaim[]>([]);
  const [projectFinMap, setProjectFinMap] = useState<Record<string, ProjectFinDetail>>({});
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterId>("all");

  const [filterSearch, setFilterSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterHealth, setFilterHealth] = useState("all");

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectFinDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [selectedVariation, setSelectedVariation] = useState<VariationLogItem | null>(null);
  const [selectedWeekly, setSelectedWeekly] = useState<WeeklyRow | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<ProgressClaim | null>(null);
  const [certifyingClaim, setCertifyingClaim] = useState<ProgressClaim | null>(null);
  const [certifiedVal, setCertifiedVal] = useState("");

  const [variations, setVariations] = useState<VariationLogItem[]>([
    { id: "VAR-001", project: "Parramatta Square — Tower C", description: "Inclement Wet Weather EOT Section 34.2 NSW", amount: 1.2, type: "Contract Sum Increase", status: "Certified" },
    { id: "VAR-002", project: "Parramatta Square — Tower C", description: "Formwork Reinforcement pricing Indexation", amount: 0.8, type: "Cost Item Addition", status: "Approved" },
    { id: "VAR-003", project: "Victoria Harbour — Stage 2", description: "Piling Ground Obstruction excavation delay compensation VIC", amount: 0.45, type: "Contract Sum Increase", status: "Approved" },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selProjectId, setSelProjectId] = useState("p1");
  const [varDesc, setVarDesc] = useState("");
  const [varAmount, setVarAmount] = useState("0.5");
  const [varType, setVarType] = useState("contract_sum_addition");
  const [showAllOperationalRows, setShowAllOperationalRows] = useState(false);
  const [showAllBreakdownRows, setShowAllBreakdownRows] = useState(false);
  const [showAllVarianceRows, setShowAllVarianceRows] = useState(false);

  const exportFinancialReport = (format: "PDF" | "Excel") => {
    const type = encodeURIComponent("Financial-Variance-Ledger");
    const projectParam = filterProject !== "all" ? `&projectId=${encodeURIComponent(filterProject)}` : "";
    window.open(`/api/v1/reports/export?type=${type}&format=${format}${projectParam}`, "_blank");
  };
  const exportScopeLabel = filterProject === "all" ? "All" : "Project";

  const loadFinancialData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/v1/projects").then((res) => res.json()),
      fetch("/api/v1/cost_categories").then((res) => res.json()),
      fetch("/api/v1/claims").then((res) => res.json()),
    ])
      .then(([projs, cats, claimsData]) => {
        const projectList = Array.isArray(projs) ? projs : [];
        setProjList(projectList);
        setCostCategories(Array.isArray(cats) ? cats : []);
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
          const map: Record<string, ProjectFinDetail> = {};
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
    setSelectedVariation(null);
    setSelectedWeekly(null);
    setSelectedClaim(null);
  };

  const hasActiveFilters =
    filterSearch.trim() !== "" || filterProject !== "all" || filterHealth !== "all" || periodFilter !== "all";

  const clearFilters = () => {
    setFilterSearch("");
    setFilterProject("all");
    setFilterHealth("all");
    setPeriodFilter("all");
    setShowAllOperationalRows(false);
    setShowAllBreakdownRows(false);
    setShowAllVarianceRows(false);
  };

  const filteredProjects = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return projList.filter((p) => {
      if (filterProject !== "all" && p.id !== filterProject) return false;
      if (filterHealth === "completed" && p.status !== "COMPLETED") return false;
      if (filterHealth === "alert" && !projectHasAlert(p)) return false;
      if (filterHealth === "ok" && (projectHasAlert(p) || p.status === "COMPLETED")) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.contractor.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
      );
    });
  }, [projList, filterSearch, filterProject, filterHealth]);

  const filteredVariations = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return variations
      .filter((v) => {
        if (filterProject !== "all") {
          const proj = projList.find((p) => p.id === filterProject);
          if (proj && !v.project.includes(proj.name.split("—")[0].trim())) return false;
        }
        if (!q) return true;
        return (
          v.id.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.project.toLowerCase().includes(q) ||
          v.type.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const rank = (status: string) => (status === "Certified" ? 2 : status === "Approved" ? 1 : 0);
        const byStatus = rank(b.status) - rank(a.status);
        if (byStatus !== 0) return byStatus;
        return b.amount - a.amount;
      });
  }, [variations, filterSearch, filterProject, projList]);

  const handleLogVariation = () => {
    if (!varDesc.trim()) {
      alert("Please provide variation description.");
      return;
    }
    const val = parseFloat(varAmount) || 0;
    const targetProj = projList.find((p) => p.id === selProjectId);
    if (!targetProj) return;

    fetch("/api/v1/financial/variance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: selProjectId,
        description: varDesc,
        amountVal: val,
        type: varType,
      }),
    })
      .then((res) => res.json())
      .then(() => {
        const newVarItem: VariationLogItem = {
          id: `VAR-${String(variations.length + 1).padStart(3, "0")}`,
          project: targetProj.name,
          description: varDesc,
          amount: val,
          type: varType === "contract_sum_addition" ? "Contract Sum Increase" : "Cost Item Addition",
          status: "Certified",
        };
        setVariations([newVarItem, ...variations]);
        setVarDesc("");
        setShowAddModal(false);
        loadFinancialData();
      })
      .catch((err) => console.error("Error logging financial variation:", err));
  };

  const tabs = [
    { id: "overview", label: "All Projects" },
    { id: "planvscertified", label: "Planned vs Actual" },
    { id: "weekly", label: "Weekly Spend" },
    { id: "breakdown", label: "Cost Breakdown" },
    { id: "variance", label: "Variation Log" },
  ];

  const totalContract = projList.reduce((acc, p) => acc + p.finalContractSum, 0);
  // Retention held = 5% of certified cost on projects not yet at practical completion.
  // Moved here from the Projects tab so all the deep finance figures live together.
  const totalRetention = projList.reduce(
    (acc, p) => acc + (p.status !== "PRACTICAL_COMPLETION" ? p.actualCost * 0.05 : 0),
    0
  );
  const totalProfitPool = projList.reduce((acc, p) => acc + (p.finalContractSum - p.actualCost), 0);
  const weightedMargin = totalContract > 0 ? (totalProfitPool / totalContract) * 100 : 0;

  const activeCostCategories = costCategories.filter((c) => c.is_active !== false);
  const certifiedClaims = claims.filter((c) => c.status === "certified" || c.status === "released");
  const parseClaimDate = (claim: ProgressClaim) => {
    const date = new Date(claim.dueDate);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const isClaimInPeriod = (claim: ProgressClaim, period: PeriodFilterId) => {
    if (period === "all") return true;
    const claimDate = parseClaimDate(claim);
    if (!claimDate) return false;
    const now = new Date();
    if (period === "last_30") {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      return claimDate >= start;
    }
    if (period === "last_90") {
      const start = new Date(now);
      start.setDate(now.getDate() - 90);
      return claimDate >= start;
    }
    return claimDate.getFullYear() === now.getFullYear();
  };
  const periodClaims = certifiedClaims.filter((c) => isClaimInPeriod(c, periodFilter));
  const totalCertifiedClaimsVal = periodClaims.reduce((acc, c) => acc + (c.certifiedVal || 0), 0) / 1000000;

  const categoryTotals: Record<string, number> = {};
  periodClaims.forEach((c) => {
    const catId = c.costCategoryId || "uncategorized";
    categoryTotals[catId] = (categoryTotals[catId] || 0) + (c.certifiedVal || 0);
  });

  const dynamicCategoriesData = activeCostCategories.map((c, i) => {
    const catVal = (categoryTotals[c.id] || 0) / 1000000;
    const pct = totalCertifiedClaimsVal > 0 ? Math.round((catVal / totalCertifiedClaimsVal) * 100) : 0;
    return { label: c.name, pct, amt: `A$${catVal.toFixed(1)}M`, color: COLOR_PALETTE[i % COLOR_PALETTE.length] };
  });

  const totalScheduled = filteredProjects.reduce(
    (acc, p) => acc + (projectFinMap[p.id]?.scheduledCostVal ?? 0),
    0
  );
  const totalCertifiedFiltered = filteredProjects.reduce((acc, p) => acc + p.actualCost, 0);
  const portfolioVariance = totalCertifiedFiltered - totalScheduled;
  const MAX_VISIBLE_ROWS = 8;
  const activeProjects = filteredProjects.filter((p) => p.status !== "COMPLETED");
  const getOverrun = (p: Project) => p.actualCost - p.plannedCost;
  const getOpsVariance = (p: Project) => p.actualCost - (projectFinMap[p.id]?.scheduledCostVal ?? 0);
  const sortedOverviewProjects = [...filteredProjects].sort((a, b) => {
    const aRisk = (projectHasAlert(a) ? 1 : 0) * 1000 + Math.max(0, getOverrun(a)) * 100 + (a.ldRatePerDay || 0) / 1000;
    const bRisk = (projectHasAlert(b) ? 1 : 0) * 1000 + Math.max(0, getOverrun(b)) * 100 + (b.ldRatePerDay || 0) / 1000;
    return bRisk - aRisk;
  });
  const sortedOperationalProjects = [...filteredProjects].sort((a, b) => getOpsVariance(b) - getOpsVariance(a));
  const sortedBreakdownProjects = [...activeProjects].sort((a, b) => {
    const aTotal = periodClaims.filter((c) => c.projectId === a.id).reduce((acc, c) => acc + (c.certifiedVal || 0), 0);
    const bTotal = periodClaims.filter((c) => c.projectId === b.id).reduce((acc, c) => acc + (c.certifiedVal || 0), 0);
    return bTotal - aTotal;
  });
  const sortedVarianceProjects = [...filteredProjects].sort((a, b) => {
    const bOverrun = getOverrun(b);
    const aOverrun = getOverrun(a);
    if (bOverrun !== aOverrun) return bOverrun - aOverrun;
    return (b.ldRatePerDay || 0) - (a.ldRatePerDay || 0);
  });
  const operationalProjects = showAllOperationalRows ? sortedOperationalProjects : sortedOperationalProjects.slice(0, MAX_VISIBLE_ROWS);
  const breakdownProjects = showAllBreakdownRows ? sortedBreakdownProjects : sortedBreakdownProjects.slice(0, MAX_VISIBLE_ROWS);
  const varianceProjects = showAllVarianceRows ? sortedVarianceProjects : sortedVarianceProjects.slice(0, MAX_VISIBLE_ROWS);

  const detailClaims = selectedProject
    ? claims.filter((c) => c.projectId === selectedProject.id)
    : [];

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

  const detailCategoryBreakdown = useMemo(() => {
    if (!selectedProject) return [];
    const byCategory = new Map<string, number>();
    detailClaims
      .filter((c) => c.status === "certified" || c.status === "released")
      .forEach((c) => {
        const label = c.costCategoryName || "Uncategorized";
        byCategory.set(label, (byCategory.get(label) || 0) + (c.certifiedVal || 0));
      });
    return Array.from(byCategory.entries())
      .map(([label, total]) => ({ label, totalM: total / 1000000 }))
      .sort((a, b) => b.totalM - a.totalM);
  }, [detailClaims, selectedProject]);

  const weeklyRows = useMemo<WeeklyRow[]>(() => {
    const byPeriod = new Map<string, Map<string, number>>();
    periodClaims.forEach((claim) => {
      const periodKey = claim.period || "Unspecified period";
      if (!byPeriod.has(periodKey)) byPeriod.set(periodKey, new Map<string, number>());
      const projectMap = byPeriod.get(periodKey)!;
      projectMap.set(claim.projectId, (projectMap.get(claim.projectId) || 0) + (claim.certifiedVal || 0));
    });
    return Array.from(byPeriod.entries())
      .map(([period, projectMap]) => {
        const breakdown = Array.from(projectMap.entries())
          .map(([projectId, value]) => ({
            projectId,
            projectName: projList.find((p) => p.id === projectId)?.name || "Unknown project",
            valK: value / 1000,
          }))
          .sort((a, b) => b.valK - a.valK);
        const totalK = breakdown.reduce((acc, item) => acc + item.valK, 0);
        return {
          key: period,
          period,
          totalLabel: totalK >= 1000 ? `A$${(totalK / 1000).toFixed(2)}M` : `A$${Math.round(totalK).toLocaleString()}K`,
          totalK,
          breakdown,
        };
      })
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [periodClaims, projList]);

  const weeklyTopProjects = useMemo(() => {
    const totals = new Map<string, { projectName: string; totalK: number }>();
    weeklyRows.forEach((row) => {
      row.breakdown.forEach((item) => {
        const prev = totals.get(item.projectId);
        totals.set(item.projectId, {
          projectName: item.projectName,
          totalK: (prev?.totalK || 0) + item.valK,
        });
      });
    });
    return Array.from(totals.entries())
      .map(([projectId, data], idx) => ({
        projectId,
        projectName: data.projectName,
        totalK: data.totalK,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
      }))
      .sort((a, b) => b.totalK - a.totalK)
      .slice(0, 5);
  }, [weeklyRows]);

  if (loading) {
    return (
      <div style={{ padding: 20, color: C.gray, fontSize: 13 }}>
        Loading financial portfolio data…
      </div>
    );
  }

  const DetailPanel = () => {
    if (!selectedProject && !selectedVariation && !selectedWeekly) return null;

    if (selectedWeekly) {
      const w = selectedWeekly;
      return (
        <aside style={panelStyle}>
          <PanelHeader title={`Certified spend — ${w.period}`} onClose={closeDetail} />
          <div style={{ padding: "0 18px 18px", overflowY: "auto", flex: 1 }}>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>Claim period: <strong style={{ color: C.text }}>{w.period}</strong></div>
            <div style={{ fontSize: 22, fontWeight: 600, color: C.blue, marginBottom: 16 }}>{w.totalLabel}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Project breakdown</div>
            {w.breakdown.map((s, idx) => {
              const share = w.totalK > 0 ? Math.round((s.valK / w.totalK) * 100) : 0;
              const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
              const valueLabel = s.valK >= 1000 ? `A$${(s.valK / 1000).toFixed(2)}M` : `A$${Math.round(s.valK).toLocaleString()}K`;
              return (
                <div key={s.projectId} style={{ marginBottom: 12, padding: 12, border: `0.5px solid ${C.grayLight}`, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{s.projectName}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color }}>{valueLabel}</span>
                  </div>
                  <div style={{ height: 6, background: C.bgSecond, borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${share}%`, background: color, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.gray, marginTop: 4 }}>{share}% of period certified value</div>
                </div>
              );
            })}
            <div style={{ marginTop: 14, padding: 12, background: C.blueLight, borderRadius: 8, fontSize: 11.5, color: C.navy, lineHeight: 1.5 }}>
              Certified weekly costs come from recorded project expenses. Use the Project Expenses screen to reconcile individual entries.
            </div>
          </div>
        </aside>
      );
    }

    if (selectedVariation) {
      const v = selectedVariation;
      return (
        <aside style={panelStyle}>
          <PanelHeader title={v.id} onClose={closeDetail} />
          <div style={{ padding: "0 18px 18px", overflowY: "auto", flex: 1 }}>
            <DetailRow label="Status" value={<span style={{ fontSize: 10, background: C.greenBg, color: C.greenDark, padding: "2px 8px", borderRadius: 4 }}>{v.status}</span>} />
            <DetailRow label="Project" value={v.project} />
            <DetailRow label="Adjustment type" value={v.type} />
            <DetailRow label="Certified value" value={`+A$${v.amount.toFixed(2)}M`} highlight />
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Description</div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55, padding: 12, background: "#F8FAFC", borderRadius: 8, border: `0.5px solid ${C.grayLight}` }}>
                {v.description}
              </div>
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: C.gray, lineHeight: 1.5 }}>
              Registered variation records adjust the final contract sum and are reflected in portfolio margin calculations.
            </div>
          </div>
        </aside>
      );
    }

    if (!selectedProject) return null;
    const p = selectedProject;
    const profitMetric = p.finalContractSum - p.actualCost;
    const marginMetric = p.finalContractSum > 0 ? (profitMetric / p.finalContractSum) * 100 : 0;
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Original contract", value: `A$${p.originalContractSum.toFixed(2)}M` },
                  { label: "Final adjusted sum", value: `A$${p.finalContractSum.toFixed(2)}M` },
                  { label: "Planned cost target", value: `A$${p.plannedCost.toFixed(2)}M` },
                  { label: "Scheduled (tasks)", value: `A$${(fin?.scheduledCostVal ?? 0).toFixed(3)}M`, color: C.blue },
                  { label: "Certified spend", value: `A$${p.actualCost.toFixed(2)}M` },
                  { label: "Projected margin", value: `A$${profitMetric.toFixed(2)}M`, color: C.greenDark },
                  { label: "Gross margin", value: `${marginMetric.toFixed(1)}%`, color: marginMetric > 12 ? C.green : C.amber },
                ].map((item) => (
                  <div key={item.label} style={{ padding: 10, background: "#F8FAFC", borderRadius: 8, border: `0.5px solid ${C.grayLight}` }}>
                    <div style={{ fontSize: 9.5, color: C.gray, textTransform: "uppercase" }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: item.color || C.text, marginTop: 4 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {fin && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Financial performance</div>
                  <DetailRow label="Plan vs actual" value={`${fin.actualCostVal > fin.plannedCostVal ? "+" : ""}A$${(fin.actualCostVal - fin.plannedCostVal).toFixed(2)}M`} highlight={fin.actualCostVal > fin.plannedCostVal} />
                  <DetailRow label="Revenue variance" value={`A$${fin.revenueVarianceVal.toFixed(2)}M`} />
                  <DetailRow label="Cost overrun" value={`A$${fin.costOverrunVal.toFixed(2)}M`} highlight={fin.costOverrunVal > 0} />
                  <DetailRow label="Retention held" value={`A$${(fin.retentionBalanceVal / 1000).toFixed(0)}K`} />
                  <DetailRow label="LD exposure (est.)" value={`A$${fin.ldExposure.toLocaleString()}`} highlight />
                  <DetailRow label="LD rate / day" value={`A$${(p.ldRatePerDay || 0).toLocaleString()}`} />
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                Cost category breakdown
              </div>
              {detailCategoryBreakdown.length === 0 ? (
                <div style={{ fontSize: 12, color: C.gray, padding: 12, background: "#F8FAFC", borderRadius: 8, marginBottom: 14 }}>
                  No certified claims with cost category yet.
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  {detailCategoryBreakdown.map((item) => (
                    <DetailRow key={item.label} label={item.label} value={`A$${item.totalM.toFixed(2)}M`} />
                  ))}
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

  return (
    <div style={{ display: "flex", gap: 0, position: "relative" }}>
      <div style={{ flex: 1, minWidth: 0, transition: "margin-right 0.2s" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Portfolio contract sum" value={`A$${totalContract.toFixed(1)}M`} valueColor={C.blue} sub={`${projList.length} active contracts · ${PERIOD_LABELS[periodFilter]}`} />
          <KpiCard label="Certified value" value={`A$${totalCertifiedClaimsVal.toFixed(1)}M`} sub={`${((totalCertifiedClaimsVal / totalContract) * 100 || 0).toFixed(0)}% of contract sum · ${PERIOD_LABELS[periodFilter]}`} />
          <KpiCard label="Total margin pool" value={`A$${totalProfitPool.toFixed(1)}M`} valueColor={C.greenDark} sub="All active projects (all-time)" />
          <KpiCard label="Retention held (5%)" value={`A$${totalRetention.toFixed(2)}M`} sub="Held under standard AS 4000-1997" />
          <KpiCard label="Margin health" value={weightedMargin > 11 ? `${weightedMargin.toFixed(1)}%` : "In review"} valueColor={weightedMargin > 11 ? C.green : C.amber} sub="Portfolio-weighted (all-time)" />
        </div>

        {/* Filter bar */}
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
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={{ ...filterInputStyle, minWidth: 160 }}
          >
            <option value="all">All projects</option>
            {projList.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterHealth}
            onChange={(e) => setFilterHealth(e.target.value)}
            style={filterInputStyle}
          >
            <option value="all">All cost status</option>
            <option value="ok">Within bounds</option>
            <option value="alert">In audit review</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PeriodFilterId)}
            style={filterInputStyle}
          >
            {PERIOD_FILTERS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} style={{ ...filterInputStyle, background: C.bgSecond, cursor: "pointer", color: C.gray }}>
              Clear filters
            </button>
          )}
          <span title={exportDisabledTooltip}>
            <Btn small disabled={isDev} onClick={() => exportFinancialReport("PDF")}>{`Export PDF (${exportScopeLabel})`}</Btn>
          </span>
          <span title={exportDisabledTooltip}>
            <Btn small disabled={isDev} onClick={() => exportFinancialReport("Excel")}>{`Export Excel (${exportScopeLabel})`}</Btn>
          </span>
          <Btn small onClick={loadFinancialData}>↻ Refresh</Btn>
          <span style={{ fontSize: 10.5, color: C.gray, marginLeft: "auto" }}>
            {filteredProjects.length} of {projList.length} projects
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `0.5px solid ${C.grayLight}`, overflowX: "auto" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); closeDetail(); }}
              style={{
                padding: "10px 14px", fontSize: 12.5, cursor: "pointer", border: "none", background: "none",
                borderBottom: `2.5px solid ${tab === t.id ? C.blue : "transparent"}`,
                color: tab === t.id ? C.blue : C.gray,
                fontWeight: tab === t.id ? 600 : 400,
                marginBottom: -0.5, whiteSpace: "nowrap", fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && (
          <>
            {filteredProjects.length === 0 ? (
              <Card><div style={{ textAlign: "center", color: C.gray, padding: 24, fontSize: 13 }}>No projects match your filters.</div></Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                {filteredProjects.map((p) => {
                  const profitMetric = p.finalContractSum - p.actualCost;
                  const marginMetric = p.finalContractSum > 0 ? (profitMetric / p.finalContractSum) * 100 : 0;
                  const isDoneProject = p.status === "COMPLETED";
                  const hasAlert = projectHasAlert(p);
                  const isSelected = selectedProject?.id === p.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => openProjectDetail(p)}
                      style={{
                        border: `0.5px solid ${isSelected ? C.blue : C.grayLight}`,
                        borderRadius: 12, padding: "16px 20px", background: isSelected ? C.blueLight : C.white,
                        cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.name}</div>
                          <div style={{ fontSize: 11.5, color: C.gray, marginTop: 3 }}>
                            {p.contractor} · {p.location}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
                            background: isDoneProject ? C.blueLight : hasAlert ? C.redBg : C.greenBg,
                            color: isDoneProject ? C.blue : hasAlert ? C.redDark : C.greenDark,
                            textTransform: "uppercase",
                          }}>
                            {isDoneProject ? "Completed" : hasAlert ? "Audit review" : "On track"}
                          </span>
                          <span style={{ fontSize: 11, color: C.blue, fontWeight: 500 }}>View detail →</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                        {[
                          { label: "Contract sum", value: `A$${p.finalContractSum.toFixed(2)}M` },
                          { label: "Certified spend", value: `A$${p.actualCost.toFixed(2)}M` },
                          { label: "Margin", value: `A$${profitMetric.toFixed(2)}M`, color: C.greenDark },
                          { label: "Margin %", value: `${marginMetric.toFixed(1)}%`, color: marginMetric > 12 ? C.green : C.amber },
                        ].map((item) => (
                          <div key={item.label} style={{ flex: "1 1 120px" }}>
                            <div style={{ fontSize: 9.5, color: C.gray, textTransform: "uppercase" }}>{item.label}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: item.color || C.text, marginTop: 3 }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
              <Card style={{ padding: 18 }}>
                <SectionHeader title="Plan vs actual spend" />
                {filteredProjects.map((p) => (
                  <div key={p.id} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 6 }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 10.5, color: C.gray, width: 52 }}>Planned</span>
                      <div style={{ flex: 1, height: 7, background: C.bgSecond, borderRadius: 4 }}>
                        <div style={{ height: "100%", width: `${Math.min(p.plannedCost, 100)}%`, background: "#94A3B8", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: C.gray, width: 48, textAlign: "right" }}>A${p.plannedCost.toFixed(1)}M</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 10.5, color: C.gray, width: 52 }}>Actual</span>
                      <div style={{ flex: 1, height: 7, background: C.bgSecond, borderRadius: 4 }}>
                        <div style={{ height: "100%", width: `${Math.min(p.actualCost, 100)}%`, background: p.overBudget ? C.red : C.green, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: p.overBudget ? C.red : C.green, width: 48, textAlign: "right", fontWeight: 600 }}>A${p.actualCost.toFixed(1)}M</span>
                    </div>
                  </div>
                ))}
              </Card>

              <Card style={{ padding: 18 }}>
                <SectionHeader title="Cost categories (certified claims)" />
                {dynamicCategoriesData.length === 0 ? (
                  <div style={{ textAlign: "center", color: C.gray, padding: 16, fontSize: 12 }}>No categories configured. Add under Reference Data.</div>
                ) : (
                  dynamicCategoriesData.map((c) => (
                    <div key={c.label} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, background: c.color, borderRadius: "50%", display: "inline-block" }} />
                          {c.label}
                        </span>
                        <span style={{ fontWeight: 600 }}>{c.amt} · {c.pct}%</span>
                      </div>
                      <div style={{ height: 7, background: C.bgSecond, borderRadius: 4 }}>
                        <div style={{ height: "100%", width: `${c.pct}%`, background: c.color, borderRadius: 4 }} />
                      </div>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </>
        )}

        {/* Plan vs Actual */}
        {tab === "planvscertified" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
              <KpiCard
                label="Total scheduled (tasks)"
                value={`A$${totalScheduled.toFixed(3)}M`}
                valueColor={C.blue}
                sub="Sum of task costs from schedule"
              />
              <KpiCard
                label="Total actual"
                value={`A$${totalCertifiedFiltered.toFixed(1)}M`}
                sub="From approved progress claims"
              />
              <KpiCard
                label="Portfolio variance"
                value={`${portfolioVariance >= 0 ? "+" : ""}A$${portfolioVariance.toFixed(3)}M`}
                valueColor={portfolioVariance > 0 ? C.red : C.green}
                sub={portfolioVariance > 0 ? "Certified above scheduled" : "Certified within/below scheduled"}
              />
            </div>

            <Card>
              <SectionHeader
                title="Plan vs actual by project"
                right={<span style={{ fontSize: 10.5, color: C.gray }}>Sorted by variance (highest first) · Scheduled = task rate × duration</span>}
              />
              {filteredProjects.length === 0 ? (
                <div style={{ textAlign: "center", color: C.gray, padding: 24, fontSize: 12 }}>No projects match your filters.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        {["Project", "Planned budget", "Scheduled (tasks)", "Actual", "Variance"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontSize: 11, color: C.gray, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((p) => {
                        const scheduled = projectFinMap[p.id]?.scheduledCostVal ?? 0;
                        const certified = p.actualCost;
                        const variance = certified - scheduled;
                        const overScheduled = variance > 0;
                        return (
                          <tr key={p.id} onClick={() => openProjectDetail(p)} style={{ cursor: "pointer" }}>
                            <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 500 }}>{p.name}</td>
                            <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}` }}>A${p.plannedCost.toFixed(2)}M</td>
                            <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, color: C.blue, fontWeight: 600 }}>A${scheduled.toFixed(3)}M</td>
                            <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 600 }}>A${certified.toFixed(2)}M</td>
                            <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, color: overScheduled ? C.red : C.green, fontWeight: 600 }}>
                              {variance >= 0 ? "+" : ""}A${variance.toFixed(3)}M
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredProjects.length > MAX_VISIBLE_ROWS && (
                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: C.gray }}>
                    Showing {operationalProjects.length} of {filteredProjects.length} projects
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllOperationalRows((prev) => !prev)}
                    style={{ ...filterInputStyle, cursor: "pointer", background: C.bgSecond }}
                  >
                    {showAllOperationalRows ? "Show less" : "Show all"}
                  </button>
                </div>
              )}
            </Card>

            <Card style={{ padding: 16, marginTop: 14 }}>
              <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.55 }}>
                <strong style={{ color: C.text }}>How to read this:</strong> Scheduled cost is calculated from Gantt tasks (resource rate × duration, including overrides).
                Certified cost comes from progress claims. Use task selection when creating a claim to align certified values with schedule progress.
              </div>
            </Card>
          </>
        )}

        {/* Weekly */}
        {tab === "weekly" && (
          <>
            <Card style={{ padding: 18 }}>
              <SectionHeader title={`Certified spend by claim period (${PERIOD_LABELS[periodFilter]})`} />
              <div style={{ fontSize: 11, color: C.gray, marginBottom: 12 }}>
                Top 5 projects shown per period, remaining certified value is grouped as Others.
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
                {weeklyTopProjects.map((p) => (
                  <div key={p.projectId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.gray }}>
                    <span style={{ width: 20, height: 3, background: p.color, borderRadius: 2 }} />{p.projectName}
                  </div>
                ))}
                {weeklyTopProjects.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.gray }}>
                    <span style={{ width: 20, height: 3, background: C.grayLight, borderRadius: 2 }} />Others
                  </div>
                )}
              </div>
              {weeklyRows.length === 0 ? (
                <div style={{ textAlign: "center", color: C.gray, padding: 16, fontSize: 12 }}>No certified claims in this period.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {weeklyRows.map((row) => {
                    let coveredK = 0;
                    return (
                      <div key={row.key} style={{ cursor: "pointer" }} onClick={() => setSelectedWeekly(selectedWeekly?.key === row.key ? null : row)}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                          <span style={{ color: C.text, fontWeight: 500 }}>{row.period}</span>
                          <span style={{ color: C.blue, fontWeight: 600 }}>{row.totalLabel}</span>
                        </div>
                        <div style={{ height: 14, display: "flex", background: C.bgSecond, borderRadius: 7, overflow: "hidden" }}>
                          {weeklyTopProjects.map((p) => {
                            const k = row.breakdown.find((b) => b.projectId === p.projectId)?.valK || 0;
                            coveredK += k;
                            if (k <= 0) return null;
                            const widthPct = row.totalK > 0 ? (k / row.totalK) * 100 : 0;
                            return <div key={p.projectId} style={{ width: `${widthPct}%`, background: p.color }} title={`${p.projectName}: A$${(k / 1000).toFixed(2)}M`} />;
                          })}
                          {row.totalK - coveredK > 0 && (
                            <div style={{ width: `${((row.totalK - coveredK) / row.totalK) * 100}%`, background: C.grayLight }} title={`Others: A$${((row.totalK - coveredK) / 1000).toFixed(2)}M`} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <SectionHeader title="Period detail table" right={<span style={{ fontSize: 10.5, color: C.gray }}>Click row for breakdown</span>} />
              {weeklyRows.length === 0 ? (
                <div style={{ textAlign: "center", color: C.gray, padding: 20, fontSize: 12 }}>No period data available.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        {["Period", ...weeklyTopProjects.slice(0, 4).map((p) => p.projectName), "Others", "Portfolio total"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontSize: 11, color: C.gray, fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyRows.map((row) => {
                        const isSel = selectedWeekly?.key === row.key;
                        const topVals = weeklyTopProjects.slice(0, 4).map((p) => row.breakdown.find((b) => b.projectId === p.projectId)?.valK || 0);
                        const topTotal = topVals.reduce((acc, val) => acc + val, 0);
                        const others = Math.max(0, row.totalK - topTotal);
                        return (
                          <tr key={row.key} onClick={() => setSelectedWeekly(isSel ? null : row)} style={{ cursor: "pointer", background: isSel ? C.blueLight : "transparent" }}>
                            <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 500 }}>{row.period}</td>
                            {topVals.map((val, idx) => (
                              <td key={idx} style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}` }}>{val > 0 ? `A$${(val / 1000).toFixed(2)}M` : "—"}</td>
                            ))}
                            <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}` }}>{others > 0 ? `A$${(others / 1000).toFixed(2)}M` : "—"}</td>
                            <td style={{ padding: "11px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 600 }}>{row.totalLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {/* Breakdown */}
        {tab === "breakdown" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
              {dynamicCategoriesData.map((c) => (
                <KpiCard key={c.label} label={c.label} value={c.amt} valueColor={c.color} sub={`${c.pct}% of certified`} />
              ))}
            </div>
            <Card style={{ padding: 18 }}>
              <SectionHeader title={`Expenditure by project & category (${PERIOD_LABELS[periodFilter]})`} />
              {breakdownProjects.map((p) => {
                const projClaims = periodClaims.filter((c) => c.projectId === p.id);
                const projTotal = projClaims.reduce((acc, c) => acc + (c.certifiedVal || 0), 0) / 1000000;
                if (projTotal <= 0) return null;
                return (
                  <div key={p.id} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 8 }}>{p.name}</div>
                    <div style={{ display: "flex", gap: 3, height: 24 }}>
                      {dynamicCategoriesData.map((cat, idx) => {
                        const catClaimVal = projClaims
                          .filter((c) => c.costCategoryName === cat.label)
                          .reduce((acc, c) => acc + (c.certifiedVal || 0), 0) / 1000000;
                        if (catClaimVal <= 0) return null;
                        const flexPct = Math.max(4, Math.round((catClaimVal / projTotal) * 100));
                        return (
                          <div key={idx} style={{ flex: flexPct, background: cat.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 20 }} title={`${cat.label}: A$${catClaimVal.toFixed(1)}M`}>
                            <span style={{ fontSize: 9, color: C.white, fontWeight: 600 }}>A${catClaimVal.toFixed(1)}M</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {filteredProjects.filter((p) => p.status !== "COMPLETED").length > MAX_VISIBLE_ROWS && (
                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: C.gray }}>
                    Showing {breakdownProjects.length} of {filteredProjects.filter((p) => p.status !== "COMPLETED").length} active projects
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllBreakdownRows((prev) => !prev)}
                    style={{ ...filterInputStyle, cursor: "pointer", background: C.bgSecond }}
                  >
                    {showAllBreakdownRows ? "Show less" : "Show all"}
                  </button>
                </div>
              )}
            </Card>
          </>
        )}

        {/* Variance */}
        {tab === "variance" && (
          <>
            <Card>
              <SectionHeader
                title="Contract variance & LD risk"
                right={<Btn primary small onClick={() => setShowAddModal(true)}>+ Add variation</Btn>}
              />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["Project", "Original sum", "Final sum", "Certified cost", "Cost status", "LD / day", "Status"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `0.5px solid ${C.grayLight}`, fontSize: 11, color: C.gray, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {varianceProjects.map((p) => {
                      const costOverrun = p.actualCost - p.plannedCost;
                      const isDoneProject = p.status === "COMPLETED";
                      const hasOverrun = costOverrun > 0;
                      return (
                        <tr key={p.id} onClick={() => openProjectDetail(p)} style={{ cursor: "pointer" }}>
                          <td style={{ padding: "12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 500 }}>{p.name}</td>
                          <td style={{ padding: "12px", borderBottom: `0.5px solid ${C.grayLight}` }}>A${p.originalContractSum.toFixed(1)}M</td>
                          <td style={{ padding: "12px", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 600 }}>A${p.finalContractSum.toFixed(1)}M</td>
                          <td style={{ padding: "12px", borderBottom: `0.5px solid ${C.grayLight}` }}>A${p.actualCost.toFixed(1)}M</td>
                          <td style={{ padding: "12px", borderBottom: `0.5px solid ${C.grayLight}`, color: hasOverrun ? C.red : C.green, fontWeight: 600 }}>
                            {hasOverrun ? `+A$${costOverrun.toFixed(2)}M overrun` : `A$${Math.abs(costOverrun).toFixed(2)}M under`}
                          </td>
                          <td style={{ padding: "12px", borderBottom: `0.5px solid ${C.grayLight}`, color: C.red }}>A${(p.ldRatePerDay || 45000).toLocaleString()}</td>
                          <td style={{ padding: "12px", borderBottom: `0.5px solid ${C.grayLight}` }}>
                            <StatusBadge status={isDoneProject ? "completed" : hasOverrun ? "conflict" : "ok"} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredProjects.length > MAX_VISIBLE_ROWS && (
                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: C.gray }}>
                    Showing {varianceProjects.length} of {filteredProjects.length} projects
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllVarianceRows((prev) => !prev)}
                    style={{ ...filterInputStyle, cursor: "pointer", background: C.bgSecond }}
                  >
                    {showAllVarianceRows ? "Show less" : "Show all"}
                  </button>
                </div>
              )}
            </Card>

            <Card>
              <SectionHeader title="Registered variations" right={<span style={{ fontSize: 10.5, color: C.gray }}>{filteredVariations.length} records · click for detail</span>} />
              {filteredVariations.length === 0 ? (
                <div style={{ textAlign: "center", color: C.gray, padding: 20, fontSize: 12 }}>No variations match your filters.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredVariations.map((item) => {
                    const isSel = selectedVariation?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => { setSelectedProject(null); setSelectedWeekly(null); setSelectedVariation(isSel ? null : item); }}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "12px 16px", border: `0.5px solid ${isSel ? C.blue : C.grayLight}`,
                          borderRadius: 8, background: isSel ? C.blueLight : "#F8FAFC", cursor: "pointer",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{item.id} — {item.description}</div>
                          <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{item.project} · {item.type}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>+A${item.amount.toFixed(2)}M</div>
                          <span style={{ fontSize: 10, background: C.greenBg, color: C.greenDark, padding: "2px 6px", borderRadius: 4, display: "inline-block", marginTop: 4 }}>{item.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}

        {showAddModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,31,61,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
            <div style={{ background: C.white, borderRadius: 12, width: 360, padding: 22, border: `0.5px solid ${C.grayLight}`, boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14 }}>Add a contract variation</div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Project</label>
                <select value={selProjectId} onChange={(e) => setSelProjectId(e.target.value)} style={{ width: "100%", ...filterInputStyle }}>
                  {projList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Description</label>
                <input type="text" placeholder="e.g. Inclement weather EOT §34.2" value={varDesc} onChange={(e) => setVarDesc(e.target.value)} style={{ width: "100%", ...filterInputStyle }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Type</label>
                <select value={varType} onChange={(e) => setVarType(e.target.value)} style={{ width: "100%", ...filterInputStyle }}>
                  <option value="contract_sum_addition">Contract sum increase</option>
                  <option value="actual_cost_addition">Certified cost addition</option>
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: C.gray, display: "block", marginBottom: 4 }}>Amount (A$ millions)</label>
                <input type="number" value={varAmount} step="0.05" onChange={(e) => setVarAmount(e.target.value)} style={{ width: "100%", ...filterInputStyle }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn primary onClick={handleLogVariation}>Commit</Btn>
                <Btn onClick={() => setShowAddModal(false)}>Cancel</Btn>
              </div>
            </div>
          </div>
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
