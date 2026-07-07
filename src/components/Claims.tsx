import { useState, useEffect, useMemo } from "react";
import { ProgressClaim, CostCategory } from "../types";
import { KpiCard, Card, Btn, StatusBadge } from "./Dashboard";
import { LabelWithInfo } from "./InfoTip";

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

export default function ScreenClaims() {
  const isDev = import.meta.env.DEV;
  const exportDisabledTooltip = isDev ? "On development" : undefined;
  const [claims, setClaims] = useState<ProgressClaim[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [costCategories, setCostCategories] = useState<CostCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNewModal, setShowNewModal] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [costCategoryId, setCostCategoryId] = useState("");
  const [projectTasks, setProjectTasks] = useState<Array<{
    id: string;
    name: string;
    projectId: string;
    assigneeId?: string | null;
    assignee?: string;
    percent_complete?: number;
    calculatedCostVal?: number;
  }>>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [claimAmountTouched, setClaimAmountTouched] = useState(false);
  const [claimDescription, setClaimDescription] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<ProgressClaim | null>(null);
  const [isEditingExpense, setIsEditingExpense] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [certifyingClaim, setCertifyingClaim] = useState<ProgressClaim | null>(null);
  const [certifiedVal, setCertifiedVal] = useState("");
  const [certifying, setCertifying] = useState(false);
  const [removing, setRemoving] = useState(false);

  const exportClaimsReport = (format: "PDF" | "Excel") => {
    const type = encodeURIComponent("Project-Expense-Summary");
    const projectParam = filterProject !== "all" ? `&projectId=${encodeURIComponent(filterProject)}` : "";
    window.open(`/api/v1/reports/export?type=${type}&format=${format}${projectParam}`, "_blank");
  };
  const exportScopeLabel = filterProject === "all" ? "All" : "Project";

  const filterInputStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 11.5,
    borderRadius: 8,
    border: `0.5px solid ${C.grayLight}`,
    fontFamily: "inherit",
  };

  const loadClaims = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/v1/claims").then(res => res.json()),
      fetch("/api/v1/projects").then(res => res.json()),
      fetch("/api/v1/cost_categories").then(res => res.json()),
    ])
      .then(([claimsData, projectsData, categoriesData]) => {
        setClaims(claimsData);
        setProjects(projectsData);
        const activeCats = (Array.isArray(categoriesData) ? categoriesData : []).filter(
          (c: CostCategory) => c.is_active !== false
        );
        setCostCategories(activeCats);
        setLoading(false);
      })
      .catch(err => {
        console.error("Expenses: Error loading expenses and projects:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadClaims();
  }, []);

  const selectedCategory = costCategories.find((c) => c.id === costCategoryId);
  const isLabourCategory = selectedCategory?.name.toLowerCase() === "labour";

  const taskClaimStatusMap = useMemo(() => {
    const statuses = new Map<string, "paid" | "pending">();
    claims
      .filter((c) => c.projectId === projectId && c.taskIds)
      .forEach((c) => {
        const nextStatus: "paid" | "pending" =
          c.status === "certified" || c.status === "released" ? "paid" : "pending";
        c.taskIds!
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((id) => {
            const current = statuses.get(id);
            if (current === "paid") return;
            statuses.set(id, nextStatus);
          });
      });
    return statuses;
  }, [claims, projectId]);

  useEffect(() => {
    if (!showNewModal || !projectId || !isLabourCategory) {
      if (!showNewModal || !isLabourCategory) setProjectTasks([]);
      return;
    }
    setTasksLoading(true);
    setSelectedTaskIds([]);
    setSelectedAssigneeIds([]);
    setClaimAmountTouched(false);
    fetch("/api/v1/dashboard/tasks")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setProjectTasks(list.filter((t: { projectId: string }) => t.projectId === projectId));
        setTasksLoading(false);
      })
      .catch((err) => {
        console.error("Expenses: Error loading tasks for expense:", err);
        setProjectTasks([]);
        setTasksLoading(false);
      });
  }, [showNewModal, projectId, isLabourCategory]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    projectTasks.forEach((t) => {
      if (!t.assigneeId) return;
      map.set(t.assigneeId, t.assignee || "Unassigned");
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectTasks]);

  const filteredTasksByAssignee = useMemo(() => {
    if (selectedAssigneeIds.length === 0) return projectTasks;
    return projectTasks.filter((t) => t.assigneeId && selectedAssigneeIds.includes(t.assigneeId));
  }, [projectTasks, selectedAssigneeIds]);

  const selectableTasks = useMemo(
    () => filteredTasksByAssignee.filter((t) => taskClaimStatusMap.get(t.id) !== "paid"),
    [filteredTasksByAssignee, taskClaimStatusMap]
  );

  const suggestedClaimValM = useMemo(() => {
    const total = selectableTasks
      .filter((t) => selectedTaskIds.includes(t.id))
      .reduce((acc, t) => {
        const fullCost = t.calculatedCostVal || 0;
        const pct = t.percent_complete ?? 0;
        return acc + fullCost * (pct / 100);
      }, 0);
    return Math.round((total / 1_000_000) * 1000) / 1000;
  }, [selectableTasks, selectedTaskIds]);

  useEffect(() => {
    if (!showNewModal || claimAmountTouched || !isLabourCategory) return;
    if (selectedTaskIds.length > 0) {
      setClaimAmount(suggestedClaimValM > 0 ? String(suggestedClaimValM) : "0.001");
    }
  }, [showNewModal, selectedTaskIds, suggestedClaimValM, claimAmountTouched, isLabourCategory]);

  useEffect(() => {
    if (!isLabourCategory) {
      setSelectedTaskIds([]);
      setSelectedAssigneeIds([]);
    }
  }, [isLabourCategory]);

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const toggleAssigneeSelection = (assigneeId: string) => {
    setSelectedAssigneeIds((prev) =>
      prev.includes(assigneeId) ? prev.filter((id) => id !== assigneeId) : [...prev, assigneeId]
    );
  };

  const openNewClaimModal = () => {
    setProjectId("");
    setCostCategoryId("");
    setClaimAmount("");
    setClaimAmountTouched(false);
    setSelectedTaskIds([]);
    setSelectedAssigneeIds([]);
    setProjectTasks([]);
    setClaimDescription("");
    setShowNewModal(true);
  };

  const openExpenseDetail = (expense: ProgressClaim) => {
    setSelectedExpense(expense);
    setIsEditingExpense(false);
    setEditAmount((expense.claimedVal / 1000000).toString());
    setEditCategoryId(expense.costCategoryId || "");
    setEditDescription(expense.description || "");
  };

  const formatTaskEarned = (task: { calculatedCostVal?: number; percent_complete?: number }) => {
    const fullCost = task.calculatedCostVal || 0;
    const pct = task.percent_complete ?? 0;
    const earned = fullCost * (pct / 100);
    if (earned >= 1_000_000) return `A$${(earned / 1_000_000).toFixed(2)}M`;
    if (earned >= 1000) return `A$${(earned / 1000).toFixed(1)}K`;
    return `A$${earned.toFixed(0)}`;
  };

  const getTaskPaymentStatus = (taskId: string): "unpaid" | "pending" | "paid" => {
    const status = taskClaimStatusMap.get(taskId);
    if (status === "paid") return "paid";
    if (status === "pending") return "pending";
    return "unpaid";
  };

  const taskStatusBadgeStyle = (status: "unpaid" | "pending" | "paid"): React.CSSProperties => {
    if (status === "paid") {
      return { background: C.greenBg, color: C.greenDark };
    }
    if (status === "pending") {
      return { background: C.amberBg, color: C.amber };
    }
    return { background: C.bgSecond, color: C.gray };
  };

  const handleCreateClaim = () => {
    if (!projectId) {
      alert("Please select a project.");
      return;
    }
    if (!costCategoryId) {
      alert("Please select a cost category.");
      return;
    }
    const val = parseFloat(claimAmount);
    if (!claimAmount.trim() || Number.isNaN(val) || val <= 0) {
      alert("Please enter a valid expense amount.");
      return;
    }
    fetch("/api/v1/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        claimedAmountVal: val,
        dueDate: "2026-06-30",
        costCategoryId,
        taskIds: isLabourCategory ? selectedTaskIds.join(",") : "",
        description: claimDescription.trim().slice(0, 200),
      })
    })
      .then(res => res.json())
      .then(() => {
        setShowNewModal(false);
        loadClaims();
      })
      .catch(err => console.error("Error creating project expense:", err));
  };

  const handleSaveExpenseEdit = () => {
    if (!selectedExpense) return;
    const amountNum = parseFloat(editAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      alert("Please enter a valid expense amount.");
      return;
    }
    if (!editCategoryId) {
      alert("Please select a cost category.");
      return;
    }

    setSavingEdit(true);
    fetch(`/api/v1/claims/${selectedExpense.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimedAmountVal: amountNum,
        costCategoryId: editCategoryId,
        description: editDescription,
      }),
    })
      .then((res) => res.json())
      .then((updated) => {
        setClaims((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSelectedExpense(updated);
        setIsEditingExpense(false);
        setSavingEdit(false);
      })
      .catch((err) => {
        console.error("Error updating expense:", err);
        setSavingEdit(false);
      });
  };

  const getProjectRetentionPct = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    return proj?.retentionPercent ?? 5.0;
  };

  const openCertifyModal = (claim: ProgressClaim) => {
    setCertifyingClaim(claim);
    setCertifiedVal((claim.claimedVal / 1_000_000).toString());
  };

  const handleCertifyClaim = () => {
    if (!certifyingClaim) return;
    const val = parseFloat(certifiedVal);
    if (!Number.isFinite(val) || val <= 0) {
      alert("Please enter a valid certified amount.");
      return;
    }
    setCertifying(true);
    fetch(`/api/v1/claims/${certifyingClaim.id}/certify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certifiedAmountVal: val }),
    })
      .then((res) => res.json())
      .then((updated) => {
        setClaims((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSelectedExpense(null);
        setCertifyingClaim(null);
        setCertifying(false);
      })
      .catch((err) => {
        console.error("Error certifying claim:", err);
        setCertifying(false);
      });
  };

  const handleRemoveClaim = (claim: ProgressClaim) => {
    if (!window.confirm(`Remove expense ${claim.claimNumber}? This can't be undone.`)) return;
    setRemoving(true);
    fetch(`/api/v1/claims/${claim.id}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) return res.json().then((e) => { throw new Error(e.error || "Failed to remove"); });
        return res.json();
      })
      .then(() => {
        setClaims((prev) => prev.filter((c) => c.id !== claim.id));
        setSelectedExpense(null);
        setRemoving(false);
      })
      .catch((err) => {
        console.error("Error removing claim:", err);
        alert(err.message || "Failed to remove expense.");
        setRemoving(false);
      });
  };

  const certRetentionPreview = certifyingClaim
    ? (parseFloat(certifiedVal) || 0) * (getProjectRetentionPct(certifyingClaim.projectId) / 100) * 1000
    : 0;

  const categoryFilterOptions = useMemo(() => {
    const names = new Set<string>();
    claims.forEach((c) => {
      if (c.costCategoryName) names.add(c.costCategoryName);
    });
    costCategories.forEach((c) => names.add(c.name));
    return Array.from(names).sort();
  }, [claims, costCategories]);

  const filteredClaims = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return claims.filter((c) => {
      if (filterProject !== "all" && c.projectId !== filterProject) return false;
      if (filterCategory !== "all" && (c.costCategoryName || "") !== filterCategory) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (!q) return true;
      const haystack = `${c.claimNumber} ${c.project} ${c.period} ${c.costCategoryName || ""} ${c.description || ""} ${c.claimedAmount} ${c.certifiedAmount}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [claims, filterSearch, filterProject, filterCategory, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredClaims.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedClaims = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredClaims.slice(start, start + pageSize);
  }, [filteredClaims, safePage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterSearch, filterProject, filterCategory, filterStatus, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const hasActiveFilters =
    filterSearch.trim() !== "" ||
    filterProject !== "all" ||
    filterCategory !== "all" ||
    filterStatus !== "all";

  const clearFilters = () => {
    setFilterSearch("");
    setFilterProject("all");
    setFilterCategory("all");
    setFilterStatus("all");
  };

  if (loading && claims.length === 0) {
    return <div style={{ padding: 20, color: C.gray }}>Loading project expense history...</div>;
  }

  const claimsTotalValue = claims.reduce((acc, c) => acc + c.claimedVal, 0) / 1000000;

  return (
    <div>
      <div style={{
        marginBottom: 16, padding: "12px 14px",
        background: C.blueLight, border: `0.5px solid ${C.grayLight}`, borderRadius: 10,
        fontSize: 12, color: C.text, lineHeight: 1.5,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>What this screen does</div>
        <div style={{ color: C.gray }}>
          A <strong>progress claim</strong> records money spent on a project as work gets done — each row is one
          expense against a project and a cost category (Labour, Materials, Subcontractors, Plant).
          Add an entry with <strong>+ New Expense</strong>: pick the project and category, then enter the amount.
          For <strong>Labour</strong>, select completed tasks and the amount is suggested automatically from each
          task's cost × % complete. Every entry feeds the cost figures on the <strong>Finance</strong> dashboard.
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:10, marginBottom:16 }}>
        <KpiCard label="Total Expenses" value={`A$${claimsTotalValue.toFixed(1)}M`} sub={`${claims.length} entries`} />
        <KpiCard label="Recorded Expenses" value={`${claims.length}`} valueColor={C.blue} sub="All logged expenses" />
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
        marginBottom: 14, padding: "10px 12px",
        background: C.white, border: `0.5px solid ${C.grayLight}`, borderRadius: 10,
      }}>
        <input
          type="search"
          placeholder="Search expense no., project, period…"
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
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ ...filterInputStyle, minWidth: 140 }}
        >
          <option value="all">All categories</option>
          {categoryFilterOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ ...filterInputStyle, minWidth: 130 }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="certified">Certified</option>
          <option value="released">Released</option>
        </select>
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} style={{ ...filterInputStyle, background: C.bgSecond, cursor: "pointer", color: C.gray }}>
            Clear filters
          </button>
        )}
        <span title={exportDisabledTooltip}>
          <Btn small disabled={isDev} onClick={() => exportClaimsReport("PDF")}>{`Export PDF (${exportScopeLabel})`}</Btn>
        </span>
        <span title={exportDisabledTooltip}>
          <Btn small disabled={isDev} onClick={() => exportClaimsReport("Excel")}>{`Export Excel (${exportScopeLabel})`}</Btn>
        </span>
        <Btn small onClick={loadClaims}>↻ Refresh</Btn>
        <span style={{ fontSize: 10.5, color: C.gray, marginLeft: "auto" }}>
          {filteredClaims.length} of {claims.length} expenses
        </span>
      </div>

      <Card>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize:13, fontWeight:500, color:C.text }}>Progress Claims — History</span>
          <Btn primary small onClick={openNewClaimModal}>+ New Expense</Btn>
        </div>

        {filteredClaims.length === 0 ? (
          <div style={{ textAlign: "center", color: C.gray, padding: 28, fontSize: 12 }}>
            No expenses match your filters. Try clearing search or filters.
          </div>
        ) : (
          <>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    {["Expense No.","Project","Category","Description","Period","Amount","Status"].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, fontSize:11, color:C.gray, fontWeight:500, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedClaims.map(c => (
                    <tr key={c.id} onClick={() => openExpenseDetail(c)} style={{ cursor: "pointer" }}>
                      <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, fontFamily:"monospace", fontSize:11, color:C.gray }}>{c.claimNumber}</td>
                      <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, fontWeight:500 }}>{c.project}</td>
                      <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.gray }}>{c.costCategoryName || "—"}</td>
                      <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.gray, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={c.description || undefined}>
                        {c.description || "—"}
                      </td>
                      <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, color:C.gray }}>{c.period}</td>
                      <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}`, fontWeight:600 }}>{c.claimedAmount}</td>
                      <td style={{ padding:"10px 12px", borderBottom:`0.5px solid ${C.grayLight}` }}><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: C.gray, marginTop: 8 }}>
              Click a row to view details.
            </div>

            {filteredClaims.length > pageSize && (
              <div style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
                gap: 10, marginTop: 14, paddingTop: 12, borderTop: `0.5px solid ${C.grayLight}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.gray }}>
                  <span>Rows per page</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={filterInputStyle}
                  >
                    {[5, 10, 25, 50].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span>
                    {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredClaims.length)} of {filteredClaims.length}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    style={{
                      ...filterInputStyle,
                      cursor: safePage <= 1 ? "not-allowed" : "pointer",
                      opacity: safePage <= 1 ? 0.5 : 1,
                      background: C.white,
                    }}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "ellipsis" ? (
                        <span key={`e-${idx}`} style={{ fontSize: 11, color: C.gray, padding: "0 4px" }}>…</span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setCurrentPage(item)}
                          style={{
                            ...filterInputStyle,
                            minWidth: 32,
                            cursor: "pointer",
                            background: item === safePage ? C.blueLight : C.white,
                            color: item === safePage ? C.blue : C.text,
                            fontWeight: item === safePage ? 600 : 400,
                          }}
                        >
                          {item}
                        </button>
                      )
                    )}
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    style={{
                      ...filterInputStyle,
                      cursor: safePage >= totalPages ? "not-allowed" : "pointer",
                      opacity: safePage >= totalPages ? 0.5 : 1,
                      background: C.white,
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {showNewModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99, padding: 16 }}>
          <Card style={{ width: "min(520px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:12 }}>New Expense Entry</div>

            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Select Build Contract</label>
              <select value={projectId} onChange={e => { setProjectId(e.target.value); setClaimAmountTouched(false); setSelectedTaskIds([]); }} style={{ width:"100%", fontSize:12, padding:"5px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}>
                <option value="">Select project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>
                <LabelWithInfo
                  label="Cost Category"
                  title="Cost Category"
                  body={"Cost category for this expense (Labour, Materials, etc.).\n\nLinks this entry to the Financial Dashboard cost breakdown."}
                />
              </label>
              <select value={costCategoryId} onChange={e => { setCostCategoryId(e.target.value); setClaimAmountTouched(false); }} style={{ width:"100%", fontSize:12, padding:"5px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}>
                <option value="">Select category…</option>
                {costCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {isLabourCategory && projectId && (
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:6 }}>
                <LabelWithInfo
                  label="Task-based estimate"
                  title="Task-based estimate"
                  body={"Select scheduled tasks to auto-suggest expense value.\n\nSuggested amount = task cost (rate × duration) × % complete for each selected task.\n\nTasks already included in a previous expense entry are hidden."}
                />
              </label>
              {tasksLoading ? (
                <div style={{ fontSize:11, color:C.gray, padding:12, background:"#F8FAFC", borderRadius:8 }}>Loading project tasks…</div>
              ) : projectTasks.length === 0 ? (
                <div style={{ fontSize:11, color:C.gray, padding:12, background:"#F8FAFC", borderRadius:8 }}>
                  No tasks on this project. Enter expense amount manually below.
                </div>
              ) : (
                <>
                {assigneeOptions.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10.5, color: C.gray, marginBottom: 6 }}>Filter by team member (multi-select)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {assigneeOptions.map((a) => {
                        const checked = selectedAssigneeIds.includes(a.id);
                        return (
                          <label
                            key={a.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 8px",
                              border: `0.5px solid ${checked ? C.blue : C.grayLight}`,
                              borderRadius: 999,
                              background: checked ? C.blueLight : C.white,
                              cursor: "pointer",
                              fontSize: 10.5,
                              color: checked ? C.blue : C.text,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssigneeSelection(a.id)}
                            />
                            {a.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{ border:`0.5px solid ${C.grayLight}`, borderRadius:8, maxHeight:220, overflowY:"auto" }}>
                  {filteredTasksByAssignee.map((t) => {
                    const checked = selectedTaskIds.includes(t.id);
                    const paymentStatus = getTaskPaymentStatus(t.id);
                    const isPaid = paymentStatus === "paid";
                    return (
                      <label
                        key={t.id}
                        style={{
                          display:"flex", alignItems:"center", gap:10, padding:"8px 10px",
                          borderBottom:`0.5px solid ${C.grayLight}`, cursor:"pointer",
                          background: checked ? C.blueLight : C.white,
                          opacity: isPaid ? 0.7 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isPaid}
                          onChange={() => toggleTaskSelection(t.id)}
                        />
                        <span style={{ flex:1, fontSize:11.5, color:C.text }}>
                          {t.name}
                          <span style={{ fontSize: 10.5, color: C.gray, marginLeft: 6 }}>
                            · {t.assignee || "Unassigned"}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            padding: "2px 6px",
                            borderRadius: 999,
                            textTransform: "uppercase",
                            fontWeight: 600,
                            ...taskStatusBadgeStyle(paymentStatus),
                          }}
                        >
                          {paymentStatus}
                        </span>
                        <span style={{ fontSize:10.5, color:C.gray, minWidth:36, textAlign:"right" }}>{t.percent_complete ?? 0}%</span>
                        <span style={{ fontSize:10.5, fontWeight:600, color:C.blue, minWidth:72, textAlign:"right" }}>{formatTaskEarned(t)}</span>
                      </label>
                    );
                  })}
                  {filteredTasksByAssignee.length === 0 && (
                    <div style={{ fontSize: 11, color: C.gray, padding: 10 }}>
                      No tasks match selected team members.
                    </div>
                  )}
                </div>
                </>
              )}
              {selectedTaskIds.length > 0 && (
                <div style={{ fontSize:11, color:C.blue, fontWeight:600, marginTop:8 }}>
                  Suggested from {selectedTaskIds.length} task{selectedTaskIds.length > 1 ? "s" : ""}: A${suggestedClaimValM.toFixed(3)}M
                </div>
              )}
              <div style={{ fontSize: 10, color: C.gray, marginTop: 6 }}>
                Paid tasks are locked; pending/unpaid tasks can still be selected.
              </div>
            </div>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>
                Description <span style={{ fontWeight:400 }}>(optional)</span>
              </label>
              <textarea
                value={claimDescription}
                onChange={e => setClaimDescription(e.target.value.slice(0, 200))}
                placeholder="e.g. May progress — formwork L4, structural steel"
                rows={3}
                style={{ width:"100%", fontSize:12, padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, resize:"vertical", fontFamily:"inherit" }}
              />
              <div style={{ fontSize:10, color:C.gray, marginTop:4 }}>
                {claimDescription.length}/200 characters
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Expense Amount (A$ Millions)</label>
              <input
                type="number"
                step="0.001"
                value={claimAmount}
                onChange={e => { setClaimAmount(e.target.value); setClaimAmountTouched(true); }}
                placeholder="e.g. 3.0"
                style={{ width:"100%", fontSize:12, padding:"5px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
              />
              {isLabourCategory && (
              <div style={{ fontSize:10, color:C.gray, marginTop:4 }}>
                Prefilled from selected tasks; you can override manually.
              </div>
              )}
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <Btn primary onClick={handleCreateClaim}>Save Expense</Btn>
              <Btn onClick={() => setShowNewModal(false)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {selectedExpense && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:99, padding: 16 }}>
          <Card style={{ width: "min(500px, 100%)", padding: 20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12 }}>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Expense Details</div>
              <button
                type="button"
                onClick={() => setSelectedExpense(null)}
                style={{ border: "none", background: "transparent", color: C.gray, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                aria-label="Close expense details"
              >
                ×
              </button>
            </div>
            {!isEditingExpense ? (
              <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", rowGap: 8, columnGap: 10, fontSize: 12 }}>
                <div style={{ color: C.gray }}>Expense No.</div><div style={{ fontFamily:"monospace" }}>{selectedExpense.claimNumber}</div>
                <div style={{ color: C.gray }}>Status</div><div><StatusBadge status={selectedExpense.status} /></div>
                <div style={{ color: C.gray }}>Project</div><div>{selectedExpense.project}</div>
                <div style={{ color: C.gray }}>Category</div><div>{selectedExpense.costCategoryName || "—"}</div>
                <div style={{ color: C.gray }}>Amount</div><div style={{ fontWeight: 600 }}>{selectedExpense.claimedAmount}</div>
                {selectedExpense.status !== "pending" && (
                  <>
                    <div style={{ color: C.gray }}>Certified</div><div style={{ fontWeight: 600 }}>{selectedExpense.certifiedAmount || "—"}</div>
                  </>
                )}
                <div style={{ color: C.gray }}>Period</div><div>{selectedExpense.period}</div>
                <div style={{ color: C.gray }}>Description</div><div>{selectedExpense.description || "—"}</div>
                <div style={{ color: C.gray }}>Task Links</div><div>{selectedExpense.taskIds || "—"}</div>
              </div>
            ) : (
              <div style={{ display: "grid", rowGap: 10, fontSize: 12 }}>
                <div>
                  <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Expense Amount (A$ Millions)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    style={{ width:"100%", fontSize:12, padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                  />
                </div>
                <div>
                  <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Cost Category</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    style={{ width:"100%", fontSize:12, padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
                  >
                    <option value="">Select category…</option>
                    {costCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value.slice(0, 200))}
                    rows={3}
                    style={{ width:"100%", fontSize:12, padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, resize:"vertical", fontFamily:"inherit" }}
                  />
                </div>
              </div>
            )}
            <div style={{ marginTop: 14, display:"flex", justifyContent:"flex-end", gap: 8, flexWrap: "wrap" }}>
              {isEditingExpense ? (
                <>
                  <Btn onClick={() => setIsEditingExpense(false)}>Cancel</Btn>
                  <Btn primary onClick={handleSaveExpenseEdit}>{savingEdit ? "Saving..." : "Save"}</Btn>
                </>
              ) : (
                <>
                  <Btn onClick={() => setSelectedExpense(null)}>Close</Btn>
                  {selectedExpense.status === "pending" && (
                    <>
                      <Btn onClick={() => handleRemoveClaim(selectedExpense)}>{removing ? "Removing..." : "Remove"}</Btn>
                      <Btn onClick={() => setIsEditingExpense(true)}>Edit</Btn>
                      <Btn primary onClick={() => openCertifyModal(selectedExpense)}>Approve / Certify</Btn>
                    </>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {certifyingClaim && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,31,61,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding: 16 }}>
          <Card style={{ width: "min(340px, 100%)", padding: 20 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:12 }}>Approve / Certify {certifyingClaim.claimNumber}</div>
            <div style={{ fontSize:11, color:C.gray, marginBottom:10 }}>Claimed: <strong>{certifyingClaim.claimedAmount}</strong></div>
            {certifyingClaim.description && (
              <div style={{ fontSize:11, color:C.text, marginBottom:10, padding:10, background:"#F8FAFC", borderRadius:6, lineHeight:1.45 }}>
                {certifyingClaim.description}
              </div>
            )}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:C.gray, display:"block", marginBottom:4 }}>Certified Value (A$ Millions)</label>
              <input
                type="number"
                step="0.1"
                value={certifiedVal}
                onChange={(e) => setCertifiedVal(e.target.value)}
                style={{ width:"100%", fontSize:12, padding:"5px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}` }}
              />
              <div style={{ fontSize:10, color:C.gray, marginTop:4 }}>
                * {getProjectRetentionPct(certifyingClaim.projectId)}% retention (A${certRetentionPreview.toFixed(0)}K) will be held.
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn primary onClick={handleCertifyClaim}>{certifying ? "Approving..." : "Approve"}</Btn>
              <Btn onClick={() => setCertifyingClaim(null)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
