import { useState, useMemo, useEffect } from "react";
import { Card, SectionHeader, Btn } from "./Dashboard";

const C = {
  blue:       "#1A5FA8",
  blueMid:    "#3A8ADE",
  green:      "#1D9E75",
  amber:      "#B87316",
  purple:     "#7F77DD",
  gray:       "#64748B",
  grayLight:  "#E2E8F0",
  text:       "#1E293B",
  bgSecond:   "#EEF2F8",
  white:      "#FFFFFF",
  blueLight:  "#E6F0FB",
};

type ReportCategory = "all" | "schedule" | "finance" | "resources" | "safety" | "weather";

interface ReportDef {
  icon: string;
  title: string;
  sub: string;
  color: string;
  category: ReportCategory;
  exportType: string;
  metrics: { label: string; value: string }[];
  lastGenerated?: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface RecentExport {
  icon: string;
  name: string;
  by: string;
  when: string;
  size: string;
  type: string;
  category: ReportCategory;
}

const REPORTS_BASE: ReportDef[] = [
  { icon: "📊", title: "All-Projects Programme Report", sub: "How the schedule is tracking and delivery status for the selected project", color: C.blue, category: "schedule", exportType: "Portfolio-Programme", metrics: [] },
  { icon: "💰", title: "Financial Variance Report", sub: "Contract sums, budget variance, and margin for selected project", color: C.green, category: "finance", exportType: "Financial-Variance-Ledger", metrics: [] },
  { icon: "📋", title: "Project Expense Summary", sub: "Recorded expenses and retention balance for selected project", color: C.amber, category: "finance", exportType: "Project-Expense-Summary", metrics: [] },
];

const RECENT: RecentExport[] = [
  { icon: "📄", name: "Project Expense Summary — May 2025.pdf", by: "S. Hughes", when: "3 hours ago", size: "1.8MB", type: "Project-Expense-Summary", category: "finance" },
  { icon: "📊", name: "Portfolio Programme Report.xlsx", by: "M. O'Brien", when: "yesterday", size: "2.1MB", type: "Portfolio-Programme", category: "schedule" },
  { icon: "🛡️", name: "WHS Safety Council Audit — May 2025.pdf", by: "S. Hughes", when: "2 days ago", size: "940KB", type: "WHS-Compliance", category: "safety" },
];

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  all: "All categories",
  schedule: "Scheduling",
  finance: "Finance",
  resources: "Resources",
  safety: "Safety",
  weather: "Weather",
};

export default function ScreenReports() {
  const [filterSearch, setFilterSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<ReportCategory>("all");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [financialSummary, setFinancialSummary] = useState<any | null>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportDef | null>(null);
  const [selectedRecent, setSelectedRecent] = useState<RecentExport | null>(null);
  const isDev = import.meta.env.DEV;
  const exportDisabledTooltip = isDev ? "On development" : undefined;
  const showDevelopmentOverlay = true;

  const handleExport = (type: string, format: string) => {
    if (!selectedProjectId) return;
    const encodedType = encodeURIComponent(type.replace(/\s+/g, "-"));
    window.open(`/api/v1/reports/export?type=${encodedType}&format=${format}&projectId=${encodeURIComponent(selectedProjectId)}`, "_blank");
  };

  useEffect(() => {
    fetch("/api/v1/projects")
      .then((res) => res.json())
      .then((rows) => {
        const list = Array.isArray(rows) ? rows.map((p: any) => ({ id: p.id, name: p.name })) : [];
        setProjects(list);
        if (list.length > 0) {
          setSelectedProjectId((prev) => prev || list[0].id);
        }
      })
      .catch(() => {});

    fetch("/api/v1/claims")
      .then((res) => res.json())
      .then((rows) => setClaims(Array.isArray(rows) ? rows : []))
      .catch(() => {});

    fetch("/api/v1/tasks")
      .then((res) => res.json())
      .then((rows) => setTasks(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    fetch(`/api/v1/financial/projects/${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => setFinancialSummary(data))
      .catch(() => setFinancialSummary(null));
  }, [selectedProjectId]);

  const dynamicReports = useMemo(() => {
    const projectTasks = selectedProjectId ? tasks.filter((t: any) => t.projectId === selectedProjectId) : [];
    const completed = projectTasks.filter((t: any) => t.status === "completed").length;
    const totalTasks = projectTasks.length;
    const projectClaims = selectedProjectId ? claims.filter((c: any) => c.projectId === selectedProjectId) : [];
    const certified = projectClaims.filter((c: any) => c.status === "certified");
    const pending = projectClaims.filter((c: any) => c.status === "pending");
    const retentionVal = certified.reduce((acc: number, c: any) => acc + (c.retentionVal || 0), 0);

    return REPORTS_BASE.map((r) => {
      if (r.exportType === "Portfolio-Programme") {
        return {
          ...r,
          metrics: [
            { label: "Total tasks", value: String(totalTasks) },
            { label: "Completed tasks", value: String(completed) },
            { label: "Completion rate", value: totalTasks > 0 ? `${Math.round((completed / totalTasks) * 100)}%` : "0%" },
          ],
          lastGenerated: "Live",
        };
      }
      if (r.exportType === "Financial-Variance-Ledger") {
        return {
          ...r,
          metrics: [
            { label: "Contract sum", value: financialSummary ? `A$${Number(financialSummary.contractSumVal || 0).toFixed(1)}M` : "A$0.0M" },
            { label: "Actual cost", value: financialSummary ? `A$${Number(financialSummary.actualCostVal || 0).toFixed(1)}M` : "A$0.0M" },
            { label: "Margin", value: financialSummary ? `${Number(financialSummary.marginVal || 0).toFixed(1)}%` : "0.0%" },
          ],
          lastGenerated: "Live",
        };
      }
      return {
        ...r,
        metrics: [
          { label: "Claims certified", value: String(certified.length) },
          { label: "Pending certification", value: String(pending.length) },
          { label: "Retention held", value: `A$${(retentionVal / 1000).toFixed(0)}K` },
        ],
        lastGenerated: "Live",
      };
    });
  }, [tasks, selectedProjectId, claims, financialSummary]);

  const filteredReports = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return dynamicReports.filter((r) => {
      if (filterCategory !== "all" && r.category !== filterCategory) return false;
      if (!q) return true;
      return r.title.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q);
    });
  }, [filterSearch, filterCategory, dynamicReports]);

  const filteredRecent = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return RECENT.filter((r) => {
      if (filterCategory !== "all" && r.category !== filterCategory) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.by.toLowerCase().includes(q);
    });
  }, [filterSearch, filterCategory]);

  const hasFilters = filterSearch.trim() !== "" || filterCategory !== "all";

  const inputStyle = {
    padding: "6px 10px",
    fontSize: 11.5,
    borderRadius: 8,
    border: `0.5px solid ${C.grayLight}`,
    fontFamily: "inherit",
  };

  const detail = selectedReport || (selectedRecent ? dynamicReports.find((r) => r.exportType === selectedRecent.type) : null);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Filters */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
          marginBottom: 14, padding: "10px 12px",
          background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 10,
        }}>
          <input
            type="search"
            placeholder="Search reports…"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 180px", minWidth: 160 }}
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as ReportCategory)}
            style={{ ...inputStyle, minWidth: 140 }}
          >
            {(Object.keys(CATEGORY_LABELS) as ReportCategory[]).map((k) => (
              <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
            ))}
          </select>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ ...inputStyle, minWidth: 200 }}
          >
            {projects.length === 0 && <option value="">No project</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {hasFilters && (
            <button type="button" onClick={() => { setFilterSearch(""); setFilterCategory("all"); }} style={{ ...inputStyle, background: C.bgSecond, cursor: "pointer", color: C.gray }}>
              Clear
            </button>
          )}
          <span style={{ fontSize: 10.5, color: C.gray, marginLeft: "auto" }}>
            {filteredReports.length} report templates
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
          <Card>
            <SectionHeader title="Generate reports" />
            {filteredReports.length === 0 ? (
              <div style={{ textAlign: "center", color: C.gray, padding: 20, fontSize: 12 }}>No reports match your search.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredReports.map((r) => {
                  const isSel = selectedReport?.title === r.title;
                  return (
                    <div
                      key={r.title}
                      onClick={() => { setSelectedRecent(null); setSelectedReport(isSel ? null : r); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                        border: `0.5px solid ${isSel ? C.blue : C.grayLight}`,
                        borderRadius: 8, flexWrap: "wrap", cursor: "pointer",
                        background: isSel ? C.blueLight : C.white,
                        transition: "border-color 0.15s",
                      }}
                    >
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{r.icon}</span>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, color: C.text }}>{r.title}</div>
                        <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{r.sub}</div>
                        <div style={{ fontSize: 10, color: C.blue, marginTop: 4, fontWeight: 500 }}>
                          {isSel ? "Detail open →" : "View detail →"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5 }} onClick={(e) => e.stopPropagation()}>
                        <span title={exportDisabledTooltip}>
                          <Btn small disabled={isDev} onClick={() => handleExport(r.title, "PDF")}>PDF</Btn>
                        </span>
                        <span title={exportDisabledTooltip}>
                          <Btn small disabled={isDev} onClick={() => handleExport(r.title, "Excel")}>Excel</Btn>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="Recent exports" />
            {filteredRecent.length === 0 ? (
              <div style={{ textAlign: "center", color: C.gray, padding: 20, fontSize: 12 }}>No recent exports match.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredRecent.map((r, ri) => {
                  const isSel = selectedRecent?.name === r.name;
                  return (
                    <div
                      key={ri}
                      onClick={() => { setSelectedReport(null); setSelectedRecent(isSel ? null : r); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                        background: isSel ? C.blueLight : C.white,
                        border: `0.5px solid ${isSel ? C.blue : C.grayLight}`,
                        borderRadius: 8, flexWrap: "wrap", cursor: "pointer",
                      }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{r.by} · {r.when} · {r.size}</div>
                      </div>
                      <span title={exportDisabledTooltip}>
                        <Btn small disabled={isDev} onClick={(e) => { e.stopPropagation(); handleExport(r.type, r.name.endsWith(".xlsx") ? "Excel" : "PDF"); }}>⬇</Btn>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Detail panel */}
      {(selectedReport || selectedRecent) && (
        <aside style={{
          width: 340, flexShrink: 0, background: C.white,
          border: `0.5px solid ${C.grayLight}`, borderRadius: 12,
          position: "sticky", top: 12, alignSelf: "flex-start",
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 18px", borderBottom: `0.5px solid ${C.grayLight}`, gap: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>
                {selectedRecent ? selectedRecent.name : selectedReport?.title}
              </div>
              {selectedRecent && (
                <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
                  Exported by {selectedRecent.by} · {selectedRecent.when}
                </div>
              )}
            </div>
            <button type="button" onClick={() => { setSelectedReport(null); setSelectedRecent(null); }} style={{ border: "none", background: C.bgSecond, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, color: C.gray }}>✕</button>
          </div>

          <div style={{ padding: "14px 18px 18px" }}>
            {selectedRecent && !detail && (
              <>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 12, lineHeight: 1.5 }}>
                  A previously saved report. Re-download to get the same snapshot, or regenerate from the template for up-to-date data.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span title={exportDisabledTooltip}>
                    <Btn primary small disabled={isDev} onClick={() => handleExport(selectedRecent.type, selectedRecent.name.endsWith(".xlsx") ? "Excel" : "PDF")}>Download again</Btn>
                  </span>
                </div>
              </>
            )}

            {detail && (
              <>
                <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.55, marginBottom: 14 }}>{detail.sub}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Snapshot metrics</div>
                {detail.metrics.map((m) => (
                  <div key={m.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `0.5px solid ${C.grayLight}`, fontSize: 12 }}>
                    <span style={{ color: C.gray }}>{m.label}</span>
                    <span style={{ fontWeight: 600, color: C.text }}>{m.value}</span>
                  </div>
                ))}
                {detail.lastGenerated && (
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 12 }}>Last generated: {detail.lastGenerated}</div>
                )}
                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span title={exportDisabledTooltip}>
                    <Btn primary small disabled={isDev} onClick={() => handleExport(detail.title, "PDF")}>Export PDF</Btn>
                  </span>
                  <span title={exportDisabledTooltip}>
                    <Btn small disabled={isDev} onClick={() => handleExport(detail.title, "Excel")}>Export Excel</Btn>
                  </span>
                </div>
                <div style={{ marginTop: 14, padding: 10, background: C.bgSecond, borderRadius: 8, fontSize: 11, color: C.gray, lineHeight: 1.5 }}>
                  Demo: only 3 key reports are shown, and each export uses the project you've selected.
                </div>
              </>
            )}
          </div>
        </aside>
      )}
      </div>
      {showDevelopmentOverlay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(100, 116, 139, 0.42)",
            backdropFilter: "blur(1.5px)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            padding: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              border: `0.5px solid ${C.grayLight}`,
              borderRadius: 12,
              padding: "18px 22px",
              maxWidth: 460,
              boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>On Development</div>
            <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.5 }}>
              Reports & Export is provided based on client request.
              The workflow and output format can be adjusted as requested.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
