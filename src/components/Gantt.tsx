import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Task, Resource, Project } from "../types";
import { LabelWithInfo } from "./InfoTip";
import { useMasters } from "../hooks/useMasters";
import { useProgrammeSettings } from "../hooks/useProgrammeSettings";
import { parseProgrammeDate, localIsoDate, todayLocalIso } from "../lib/programmeDate";
import { formatAud, formatCostDelta, formatProjectDeltaM, formatProjectScheduledM } from "../server/taskCost";
import {
  applyDraftConflictStatus,
  buildDraftAssigneePatch,
  buildSmartRecommendations,
  buildConflictConstraintInsight,
  detectManpowerOverlaps,
  mergeTasksWithDrafts,
  getConflictedResourceIds,
  type DraftManpowerConflict,
  type PendingDraft,
  type SmartRecommendation,
} from "../lib/ganttDraft";
import {
  computeAdjustment,
  applyMoves,
  computeSimulatedStatuses,
  detectAdjustmentWarnings,
  summarizeAdjustment,
  type CascadeMode,
  type TaskMove,
} from "../lib/timelineAdjust";
import { changeHistory, makeChangeSetId, type ChangeSet } from "../lib/changeHistory";
import TimelineAdjustPanel from "./TimelineAdjustPanel";
import ChangeHistoryTab from "./ChangeHistoryTab";
import { Timer, Users, FolderKanban, HardHat, Columns3, History } from "lucide-react";

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
  textMuted:  "#475569",
  bgSecond:   "#EEF2F8",
  white:      "#FFFFFF",
};

function getTaskBarColor(task: Task): string {
  if (task.status === "completed" || (task.percent_complete ?? 0) >= 100) return C.green;
  if (task.status === "conflict") return C.red;
  if (task.status === "fragile") return C.amber;
  if (task.status === "overdue") return C.redDark;
  if (task.status === "weather") return C.blue;
  return C.blueMid;
}

const PROJECT_COLORS: Record<string, string> = {
  "Parramatta Square — Tower C": C.blue,
  "Victoria Harbour — Stage 2": C.green,
  "Southbank Residences — T1": C.purple,
  "North Ryde Business Park — S1": C.gray,
};

function getProjectColor(projectName: string | undefined): string {
  if (!projectName) return C.blueMid;
  return PROJECT_COLORS[projectName] || C.blueMid;
}

function getResourceViewBarColor(task: Task): string {
  if (task.status === "conflict") return C.red;
  if (task.status === "fragile") return C.amber;
  if (task.status === "overdue") return C.redDark;
  if (task.status === "completed" || (task.percent_complete ?? 0) >= 100) return C.green;
  return getProjectColor(task.project);
}

function taskDisplayName(task: Task): string {
  return (task.name || "").split(" — ")[0] || "Unnamed Task";
}

function TaskNameWithId({
  task,
  onClick,
  title,
  nameStyle,
  idStyle,
}: {
  task: Task;
  onClick?: () => void;
  title?: string;
  nameStyle?: React.CSSProperties;
  idStyle?: React.CSSProperties;
}) {
  return (
    <span
      onClick={onClick}
      title={title ?? task.name}
      style={{ cursor: onClick ? "pointer" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
    >
      <span style={{ fontWeight: 600, ...nameStyle }}>{taskDisplayName(task)}</span>
      <span style={{ fontWeight: 400, color: C.gray, ...idStyle }}> ({task.id})</span>
    </span>
  );
}

function isTaskDone(task: Task): boolean {
  return task.status === "completed" || (task.percent_complete ?? 0) >= 100;
}

function isDraftTaskId(taskId: string, pendingDrafts: Record<string, PendingDraft>): boolean {
  return taskId.startsWith("DRAFT-") || pendingDrafts[taskId] !== undefined;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const isAll = selected.length === 0;

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          padding: "8px 12px", fontSize: 12.5, borderRadius: 8,
          border: `0.5px solid ${isAll ? C.grayLight : C.blue}`,
          background: isAll ? C.white : C.blueLight,
          color: isAll ? C.text : C.blue,
          fontWeight: isAll ? 400 : 600,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          minWidth: 140, whiteSpace: "nowrap",
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>
          {isAll ? label : `${label} (${selected.length})`}
        </span>
        <span style={{ fontSize: 9 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          background: C.white, border: `0.5px solid ${C.grayLight}`,
          borderRadius: 10, boxShadow: "0 8px 24px rgba(15,31,61,0.12)",
          zIndex: 300, minWidth: 230, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: `0.5px solid ${C.grayLight}` }}>
            <input
              type="text"
              placeholder={`Search ${label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{ width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: `0.5px solid ${C.grayLight}`, boxSizing: "border-box" }}
            />
          </div>
          {!isAll && (
            <button type="button" onClick={() => { onChange([]); setSearch(""); }}
              style={{ fontSize: 11, color: C.red, padding: "6px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: `0.5px solid ${C.grayLight}`, fontWeight: 600 }}>
              ✕ Clear selection
            </button>
          )}
          <div style={{ overflowY: "auto", maxHeight: 220 }}>
            {filtered.length === 0 && (
              <div style={{ padding: "12px", fontSize: 12, color: C.gray, textAlign: "center" }}>No results</div>
            )}
            {filtered.map(opt => (
              <label key={opt.value} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
                cursor: "pointer", fontSize: 12.5,
                background: selected.includes(opt.value) ? C.blueLight : "transparent",
                transition: "background 0.1s",
              }}>
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  style={{ cursor: "pointer", accentColor: C.blue, flexShrink: 0 }}
                />
                <span style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScreenGantt({ onNav }: { onNav?: (screen: string) => void }) {
  const { masters } = useMasters(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [weatherForecast, setWeatherForecast] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Editing form State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingMsg, setSavingMsg] = useState<string | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, PendingDraft>>({});
  const [draftNewTasks, setDraftNewTasks] = useState<Task[]>([]);
  const [recRefreshSeeds, setRecRefreshSeeds] = useState<Record<string, number>>({});
  const [showTaskAdvanced, setShowTaskAdvanced] = useState(false);
  const [showConflictExpanded, setShowConflictExpanded] = useState(false);

  // Form Fields
  const [formProject, setFormProject] = useState("");
  const [formName, setFormName] = useState("");
  const [formStart, setFormStart] = useState("2026-06-01");
  const [formEnd, setFormEnd] = useState("2026-06-05");
  const [formLagDays, setFormLagDays] = useState(0);
  const [formAssigneeId, setFormAssigneeId] = useState("");
  const [formTrade, setFormTrade] = useState("Labour");
  const [formDependencies, setFormDependencies] = useState("");
  const [formDepType, setFormDepType] = useState("FS"); // FS or SS next to lag days
  const [formCostOverrideActive, setFormCostOverrideActive] = useState(false);
  const [formCostOverride, setFormCostOverride] = useState("");
  const [formCostOverrideType, setFormCostOverrideType] = useState("hourly");

  // Drag & drop interaction state
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    type: "move" | "resize";
    startX: number;
    startCol: number;
    duration: number;
  } | null>(null);

  const [dragDeltaCols, setDragDeltaCols] = useState(0);
  const dragDidMoveRef = useRef(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const displayTasksRef = useRef<Task[]>([]);
  const { autoCascadeDependents } = useProgrammeSettings();
  const autoCascadeRef = useRef(autoCascadeDependents);
  autoCascadeRef.current = autoCascadeDependents;
  const [scheduleViewMode, setScheduleViewMode] = useState<"projectteam" | "overall" | "resource" | "kanban" | "history">("projectteam");

  // Timeline adjustment (staged delay) state
  const MAX_DELAY_DAYS = 30;
  const [adjustAnchorId, setAdjustAnchorId] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState<CascadeMode>("full");
  const [adjustDelay, setAdjustDelay] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [changeSets, setChangeSets] = useState<ChangeSet[]>(() => changeHistory.list());
  const adjustActive = adjustAnchorId !== null;
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const [leftColWidth, setLeftColWidth] = useState(340);
  const [isResizingLeftCol, setIsResizingLeftCol] = useState(false);
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterResources, setFilterResources] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTrade, setFilterTrade] = useState("all");

  // Column (day) width in px — stateful so the timeline can be zoomed with the
  // wheel (hold left-drag + scroll, or Ctrl/Cmd + scroll). 40px is the default.
  const DEFAULT_CW = 40;
  const MIN_CW = 14;
  const MAX_CW = 96;
  const [CW, setCW] = useState(DEFAULT_CW);
  const MIN_LEFT_COL_WIDTH = 240;
  const MAX_LEFT_COL_WIDTH = 560;
  const LW = leftColWidth; // Left label column width pixels (resizable)
  const ROW_HEIGHT = 44;
  const BAR_HEIGHT = 26;

  // Live refs so the imperative pan/zoom listeners read current values without re-binding.
  const cwRef = useRef(CW);
  cwRef.current = CW;
  const lwRef = useRef(LW);
  lwRef.current = LW;

  const zoomBy = useCallback(
    (factor: number) => setCW((prev) => Math.round(Math.min(MAX_CW, Math.max(MIN_CW, prev * factor)))),
    []
  );
  const resetZoom = useCallback(() => setCW(DEFAULT_CW), []);

  const GANTT_SCROLL_MAX_HEIGHT = "min(85vh, calc(100vh - 220px))";

  const stickyLeft = (background: string = C.white): React.CSSProperties => ({
    position: "sticky",
    left: 0,
    zIndex: 60,
    width: LW,
    minWidth: LW,
    maxWidth: LW,
    flexShrink: 0,
    background,
    boxShadow: "3px 0 8px rgba(15,31,61,0.06)",
    isolation: "isolate",
  });

  const stickyTimelineHeaderLeft = (background: string = C.bgSecond): React.CSSProperties => ({
    ...stickyLeft(background),
    position: "sticky",
    top: 0,
    zIndex: 80,
    borderRight: `0.5px solid ${C.grayLight}`,
  });

  const leftColResizeHandleStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    width: 18,
    height: "100%",
    cursor: "ew-resize",
    zIndex: 50,
    background: "rgba(148,163,184,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "none",
    borderLeft: `0.5px solid ${C.grayLight}`,
  };

  const startLeftColumnResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = { startX: e.clientX, startWidth: leftColWidth };
    setIsResizingLeftCol(true);
  };

  useEffect(() => {
    if (!isResizingLeftCol) return;

    const onMouseMove = (e: MouseEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) return;
      const nextWidth = resizeStart.startWidth + (e.clientX - resizeStart.startX);
      const clamped = Math.max(MIN_LEFT_COL_WIDTH, Math.min(MAX_LEFT_COL_WIDTH, nextWidth));
      setLeftColWidth(Math.round(clamped));
    };

    const onMouseUp = () => {
      setIsResizingLeftCol(false);
      resizeStartRef.current = null;
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizingLeftCol]);

  const resolveDefaultRateLabel = (assigneeId: string, projectName: string): string => {
    if (!assigneeId) return "";
    const resource = resources.find(r => r.id === assigneeId);
    if (!resource) return "";
    const project = projects.find(p => p.name === projectName);
    let baseRate = resource.hourlyRateVal || 75;
    let suffix = "";
    if (project && resource.projectRateOverrides?.[project.id] !== undefined) {
      baseRate = resource.projectRateOverrides[project.id];
      suffix = " (Proj Override)";
    }
    return `A$${baseRate}/hr${suffix}`;
  };

  const defaultRateLabel = useMemo(
    () => resolveDefaultRateLabel(formAssigneeId, formProject),
    [formAssigneeId, formProject, resources, projects]
  );

  const loadAllData = () => {
    setLoading(true);
    // Fetch tasks, resources and weather forecast
    fetch("/api/v1/dashboard/tasks")
      .then(res => res.json())
      .then(data => {
        setTasks(data);
        return fetch("/api/v1/resources");
      })
      .then(res => res.json())
      .then(resData => {
        setResources(resData);
        return fetch("/api/v1/projects");
      })
      .then(res => res.json())
      .then(projData => {
        const list = Array.isArray(projData) ? projData : [];
        setProjects(list);
        setFormProject(prev => prev || list[0]?.name || "");
        return fetch("/api/v1/weather/forecast");
      })
      .then(res => res.json())
      .then(forecastData => {
        setWeatherForecast(forecastData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Gantt: Error fetching data:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const draftConflicts = useMemo(
    () => detectManpowerOverlaps(mergeTasksWithDrafts(tasks, pendingDrafts, draftNewTasks)),
    [tasks, pendingDrafts, draftNewTasks]
  );

  const displayTasks = useMemo(() => {
    const merged = mergeTasksWithDrafts(tasks, pendingDrafts, draftNewTasks);
    return applyDraftConflictStatus(merged, draftConflicts);
  }, [tasks, pendingDrafts, draftNewTasks, draftConflicts]);

  displayTasksRef.current = displayTasks;

  // ── Timeline adjustment simulation ──────────────────────────────────────────
  const stateFor = useCallback(
    (task: Task) => {
      const proj = projects.find((p) => p.id === task.projectId || p.name === task.project);
      if (proj?.state) return proj.state;
      const res = resources.find((r) => r.id === task.assigneeId);
      return res?.state || "NSW";
    },
    [projects, resources]
  );

  // Eligible anchors: assigned, concrete (server) tasks that are not yet complete.
  const adjustCandidateTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.assigneeId && t.assignee !== "Unassigned" && (t.percent_complete ?? 0) < 100
      ),
    [tasks]
  );

  const adjustAnchorTask = useMemo(
    () => (adjustAnchorId ? tasks.find((t) => t.id === adjustAnchorId) ?? null : null),
    [adjustAnchorId, tasks]
  );

  const adjustMoves = useMemo<TaskMove[]>(() => {
    if (!adjustAnchorId) return [];
    return computeAdjustment(tasks, adjustAnchorId, adjustDelay, adjustMode, stateFor);
  }, [adjustAnchorId, tasks, adjustDelay, adjustMode, stateFor]);

  const adjustMovesById = useMemo(() => {
    const map = new Map<string, TaskMove>();
    adjustMoves.forEach((m) => map.set(m.taskId, m));
    return map;
  }, [adjustMoves]);

  const adjustSimTasks = useMemo(() => {
    if (!adjustActive) return tasks;
    return computeSimulatedStatuses(applyMoves(tasks, adjustMoves), stateFor);
  }, [adjustActive, tasks, adjustMoves, stateFor]);

  const adjustWarnings = useMemo(
    () => (adjustActive ? detectAdjustmentWarnings(adjustSimTasks, adjustMoves) : []),
    [adjustActive, adjustSimTasks, adjustMoves]
  );

  const adjustSummary = useMemo(
    () => summarizeAdjustment(adjustMoves, adjustSimTasks, tasks),
    [adjustMoves, adjustSimTasks, tasks]
  );

  const taskHasDependents = useCallback(
    (taskId: string) =>
      displayTasks.some((t) => {
        const deps = (t.dependencies || "")
          .split(",")
          .map((d) => d.trim())
          .filter((d) => d && d !== "-");
        return deps.includes(taskId);
      }),
    [displayTasks]
  );

  const hasPendingDrafts =
    Object.keys(pendingDrafts).length > 0 || draftNewTasks.length > 0;

  const pendingChangeCount = Object.keys(pendingDrafts).length;

  const clearDrafts = () => {
    setPendingDrafts({});
    setDraftNewTasks([]);
  };

  const discardDrafts = () => {
    clearDrafts();
    setSavingMsg(null);
  };

  const commitDrafts = async () => {
    if (!hasPendingDrafts) return;
    if (draftConflicts.length > 0) return;

    setSavingMsg("Saving programme changes…");
    try {
      const dateAndEditIds = Object.entries(pendingDrafts).filter(
        ([, d]) => d.kind === "dates" || d.kind === "edit"
      ) as Array<[string, Extract<PendingDraft, { kind: "dates" | "edit" }>]>;
      const createEntries = Object.entries(pendingDrafts).filter(
        ([, d]) => d.kind === "create"
      ) as Array<[string, Extract<PendingDraft, { kind: "create" }>]>;

      for (const [taskId, draft] of dateAndEditIds) {
        if (draft.kind === "dates") {
          const res = await fetch(`/api/v1/tasks/${taskId}/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              start: draft.start,
              end: draft.end,
              cascade: draft.cascade,
            }),
          });
          const data = await res.json();
          if (!data.success) throw new Error("Failed to save schedule change");
        } else if (draft.kind === "edit") {
          const res = await fetch(`/api/v1/tasks/${taskId}/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...draft.payload, cascade: autoCascadeDependents }),
          });
          const data = await res.json();
          if (!data.success) throw new Error("Failed to save task edit");
        }
      }

      for (const [, draft] of createEntries) {
        if (draft.kind !== "create") continue;
        const res = await fetch("/api/v1/tasks/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft.payload, cascade: autoCascadeDependents }),
        });
        const data = await res.json();
        if (!data.success) throw new Error("Failed to create task");
      }

      clearDrafts();
      await new Promise<void>((resolve) => {
        setLoading(true);
        fetch("/api/v1/dashboard/tasks")
          .then((res) => res.json())
          .then((data) => {
            setTasks(data);
            setLoading(false);
            resolve();
          })
          .catch(() => {
            setLoading(false);
            resolve();
          });
      });

      const conflictRes = await fetch("/api/v1/conflicts");
      const conflictData = await conflictRes.json();
      const hardConflicts = conflictData?.metrics?.hardConflicts ?? conflictData?.length ?? 0;
      setSavingMsg(
        hardConflicts > 0
          ? `Saved. ${hardConflicts} manpower conflict(s) detected — check Conflicts Hub.`
          : "Programme saved successfully."
      );
      window.setTimeout(() => setSavingMsg(null), 4000);
    } catch (err) {
      console.error("Error committing draft programme:", err);
      setSavingMsg("Could not save changes. Try again.");
      window.setTimeout(() => setSavingMsg(null), 3000);
    }
  };

  const groupedDraftConflicts = useMemo(() => {
    const byResource = new Map<string, DraftManpowerConflict[]>();
    for (const c of draftConflicts) {
      const list = byResource.get(c.resourceId) || [];
      list.push(c);
      byResource.set(c.resourceId, list);
    }
    return Array.from(byResource.entries());
  }, [draftConflicts]);

  const conflictedResourceIds = useMemo(
    () => getConflictedResourceIds(displayTasks),
    [displayTasks]
  );

  const applyDraftRecommendation = (taskId: string, candidateId: string) => {
    const resource = resources.find((r) => r.id === candidateId);
    if (!resource) return;

    const current = displayTasks.find((t) => t.id === taskId);
    if (!current) return;

    const patch = buildDraftAssigneePatch(current, resource);

    if (taskId.startsWith("DRAFT-")) {
      setDraftNewTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                assigneeId: resource.id,
                assignee: resource.name,
                trade: resource.trade,
                tradeRequired: resource.trade,
              }
            : t
        )
      );
      setPendingDrafts((prev) => {
        const existing = prev[taskId];
        if (existing?.kind !== "create") return prev;
        return {
          ...prev,
          [taskId]: {
            kind: "create",
            payload: { ...existing.payload, ...patch },
          },
        };
      });
      setSavingMsg(`Draft updated: ${resource.name} assigned to ${taskDisplayName(current)} (not saved yet).`);
      window.setTimeout(() => setSavingMsg(null), 3500);
      return;
    }

    const serverTask = tasks.find((t) => t.id === taskId);
    setPendingDrafts((prev) => ({
      ...prev,
      [taskId]: {
        kind: "edit",
        payload: patch,
        savedTask: serverTask || current,
      },
    }));
    setSavingMsg(`Draft updated: ${resource.name} assigned to ${taskDisplayName(current)} (not saved yet).`);
    window.setTimeout(() => setSavingMsg(null), 3500);
  };

  const applyRescheduleDraft = (taskId: string, start: string, end: string) => {
    const current = displayTasks.find((t) => t.id === taskId);
    if (!current) return;

    if (taskId.startsWith("DRAFT-")) {
      setDraftNewTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, start, end } : t))
      );
      setPendingDrafts((prev) => {
        const existing = prev[taskId];
        if (existing?.kind !== "create") return prev;
        return {
          ...prev,
          [taskId]: {
            kind: "create",
            payload: { ...existing.payload, start, end },
          },
        };
      });
    } else {
      const serverTask = tasks.find((t) => t.id === taskId);
      setPendingDrafts((prev) => ({
        ...prev,
        [taskId]: {
          kind: "dates",
          start,
          end,
          cascade: false,
          savedStart: serverTask?.start ?? current.start,
          savedEnd: serverTask?.end ?? current.end,
        },
      }));
    }

    setSavingMsg(`Draft updated: ${taskDisplayName(current)} moved to ${start} – ${end} (not saved yet).`);
    window.setTimeout(() => setSavingMsg(null), 3500);
  };

  const applySmartRecommendation = (rec: SmartRecommendation) => {
    if (rec.kind === "reschedule") {
      applyRescheduleDraft(rec.taskId, rec.start, rec.end);
      return;
    }
    applyDraftRecommendation(rec.taskId, rec.resourceId);
  };

  // ── Timeline adjustment handlers ────────────────────────────────────────────
  const openAdjust = (anchorId?: string) => {
    if (hasPendingDrafts) {
      setSavingMsg("Save or discard your draft changes before staging a delay.");
      window.setTimeout(() => setSavingMsg(null), 3500);
      return;
    }
    const target = anchorId || selectedTaskId || adjustCandidateTasks[0]?.id || null;
    if (!target) {
      setSavingMsg("No assigned tasks available to delay.");
      window.setTimeout(() => setSavingMsg(null), 3000);
      return;
    }
    setAdjustAnchorId(target);
    setAdjustMode("full");
    setAdjustDelay(0);
    if (scheduleViewMode === "kanban" || scheduleViewMode === "history") {
      setScheduleViewMode("projectteam");
    }
  };

  const closeAdjust = () => {
    setAdjustAnchorId(null);
    setAdjustDelay(0);
  };

  const confirmAdjust = async () => {
    if (!adjustAnchorTask || adjustMoves.length === 0) return;
    const warningMessages = adjustWarnings.map((w) => w.message);
    if (warningMessages.length > 0) {
      const ok = window.confirm(
        `This adjustment creates ${warningMessages.length} warning(s):\n\n` +
          warningMessages.slice(0, 8).join("\n") +
          `\n\nConfirm and apply to the live programme anyway?`
      );
      if (!ok) return;
    }

    setSavingMsg("Applying timeline adjustment…");
    try {
      for (const m of adjustMoves) {
        const res = await fetch(`/api/v1/tasks/${m.taskId}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: m.toStart, end: m.toEnd, cascade: false }),
        });
        const data = await res.json();
        if (!data.success) throw new Error("Failed to apply move");
      }

      const cs: ChangeSet = {
        id: makeChangeSetId(),
        createdAt: new Date().toISOString(),
        anchorTaskId: adjustAnchorTask.id,
        anchorTaskName: adjustAnchorTask.name,
        mode: adjustMode,
        delayWorkingDays: adjustDelay,
        moves: adjustMoves,
        warningsAtConfirm: warningMessages,
        reverted: false,
      };
      changeHistory.add(cs);
      setChangeSets(changeHistory.list());
      closeAdjust();
      loadAllData();
      setSavingMsg(`Adjustment applied — ${cs.moves.length} task(s) moved.`);
      window.setTimeout(() => setSavingMsg(null), 4000);
    } catch (err) {
      console.error("Error applying timeline adjustment:", err);
      setSavingMsg("Could not apply adjustment. Try again.");
      window.setTimeout(() => setSavingMsg(null), 3000);
    }
  };

  const revertChangeSet = async (cs: ChangeSet) => {
    setSavingMsg("Reverting adjustment…");
    try {
      for (const m of cs.moves) {
        const res = await fetch(`/api/v1/tasks/${m.taskId}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: m.fromStart, end: m.fromEnd, cascade: false }),
        });
        const data = await res.json();
        if (!data.success) throw new Error("Failed to revert move");
      }
      changeHistory.update(cs.id, { reverted: true, revertedAt: new Date().toISOString() });
      setChangeSets(changeHistory.list());
      loadAllData();
      setSavingMsg("Adjustment reverted — tasks restored to prior dates.");
      window.setTimeout(() => setSavingMsg(null), 3500);
    } catch (err) {
      console.error("Error reverting adjustment:", err);
      setSavingMsg("Could not revert. Try again.");
      window.setTimeout(() => setSavingMsg(null), 3000);
    }
  };

  /** Shared ghost-original + arrow overlay rendered behind a moved task's new bar. */
  const AdjustmentGhost = ({
    move,
    rowHeight,
  }: {
    move: TaskMove;
    rowHeight: number;
  }) => {
    const fromLeft = LW + getColFromDate(move.fromStart) * CW;
    const fromWidth = Math.max(26, getColDuration(move.fromStart, move.fromEnd) * CW);
    const toLeft = LW + getColFromDate(move.toStart) * CW;
    const top = (rowHeight - BAR_HEIGHT) / 2;
    const cy = top + BAR_HEIGHT / 2;
    const ghostRight = fromLeft + fromWidth;
    const gap = toLeft - ghostRight;
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: fromLeft,
            width: fromWidth,
            top,
            height: BAR_HEIGHT,
            borderRadius: 6,
            border: `1.5px dotted ${C.gray}`,
            background: "rgba(148,163,184,0.18)",
            zIndex: 1,
            pointerEvents: "none",
          }}
          title={`Was: ${move.fromStart} → ${move.fromEnd}`}
        />
        {gap > 6 && (
          <svg
            style={{ position: "absolute", left: ghostRight, top: 0, width: gap, height: rowHeight, overflow: "visible", pointerEvents: "none", zIndex: 3 }}
          >
            <line x1={0} y1={cy} x2={gap} y2={cy} stroke={C.purple} strokeWidth={1.6} strokeDasharray="3 2" />
            <path d={`M ${gap - 6} ${cy - 4} L ${gap} ${cy} L ${gap - 6} ${cy + 4}`} fill="none" stroke={C.purple} strokeWidth={1.6} />
          </svg>
        )}
      </>
    );
  };

  // When a delay is staged (with a non-zero shift), every timeline view renders
  // from the simulated set (new positions + recomputed statuses); otherwise from
  // the normal draft view.
  const renderSourceTasks = adjustActive && adjustMoves.length > 0 ? adjustSimTasks : displayTasks;

  const filteredTasks = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return renderSourceTasks.filter((t) => {
      if (filterProjects.length > 0 && !filterProjects.includes(t.project || "")) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      const tradeLabel = t.trade || t.tradeRequired || "";
      if (filterTrade !== "all" && tradeLabel !== filterTrade) return false;
      if (filterResources.length > 0 && !filterResources.includes(t.assigneeId || "unassigned")) return false;
      if (q) {
        const haystack = `${t.id} ${t.name} ${t.project || ""} ${t.assignee || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [renderSourceTasks, filterProjects, filterStatus, filterTrade, filterResources, filterSearch]);

  const tradeFilterOptions = useMemo(() => {
    const set = new Set<string>();
    displayTasks.forEach((t) => {
      const label = t.trade || t.tradeRequired;
      if (label) set.add(label);
    });
    return Array.from(set).sort();
  }, [displayTasks]);

  const timeline = useMemo(() => {
    const parseDate = parseProgrammeDate;
    const dayMs = 86400000;
    let minTime = parseDate("2026-06-01").getTime();
    let maxTime = parseDate("2026-08-31").getTime();

    displayTasks.forEach((t) => {
      if (t.start) minTime = Math.min(minTime, parseDate(t.start).getTime());
      if (t.end) maxTime = Math.max(maxTime, parseDate(t.end).getTime());
    });
    projects.forEach((p) => {
      if (p.pcStartDate) minTime = Math.min(minTime, parseDate(p.pcStartDate).getTime());
      if (p.pcEndDate) maxTime = Math.max(maxTime, parseDate(p.pcEndDate).getTime());
    });

    const todayIso = todayLocalIso();
    const todayTime = parseDate(todayIso).getTime();
    minTime = Math.min(minTime, todayTime);
    maxTime = Math.max(maxTime, todayTime);

    minTime -= 7 * dayMs;
    maxTime += 14 * dayMs;

    const chartStart = new Date(minTime);
    const chartEnd = new Date(maxTime);
    const cols = Math.max(42, Math.ceil((chartEnd.getTime() - chartStart.getTime()) / dayMs) + 1);
    const chartStartIso = localIsoDate(chartStart);

    const todayCol = Math.max(
      0,
      Math.min(
        Math.floor((todayTime - chartStart.getTime()) / dayMs),
        cols - 1
      )
    );

    const weekLabels: string[] = [];
    for (let i = 0; i < cols; i += 7) {
      const d = new Date(chartStart);
      d.setDate(d.getDate() + i);
      weekLabels.push(d.toLocaleDateString("en-AU", { month: "short", day: "numeric" }));
    }

    const todayLabel = parseDate(todayIso).toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return { chartStartIso, cols, todayCol, weekLabels, todayLabel };
  }, [displayTasks, projects]);

  const { chartStartIso, cols: COLS, todayCol: TODAY_COL, weekLabels: weeks, todayLabel } = timeline;

  const getColFromDate = useCallback(
    (dateStr: string): number => {
      try {
        const d = new Date(`${dateStr}T12:00:00`);
        const epoch = new Date(`${chartStartIso}T12:00:00`);
        const diffDays = Math.floor((d.getTime() - epoch.getTime()) / 86400000);
        return Math.max(0, Math.min(diffDays, COLS - 1));
      } catch {
        return 0;
      }
    },
    [chartStartIso, COLS]
  );

  const getDateFromCol = useCallback(
    (colIndex: number): string => {
      const epoch = new Date(`${chartStartIso}T12:00:00`);
      epoch.setDate(epoch.getDate() + colIndex);
      return localIsoDate(epoch);
    },
    [chartStartIso]
  );

  const getColDuration = useCallback(
    (startStr: string, endStr: string): number => {
      const s = getColFromDate(startStr);
      const e = getColFromDate(endStr);
      return Math.max(1, e - s + 1);
    },
    [getColFromDate]
  );

  /** Day-of-month only — week row carries "20 May" style labels to avoid cramped headers. */
  const formatColDay = useCallback(
    (colIndex: number) => {
      const d = parseProgrammeDate(getDateFromCol(colIndex));
      return String(d.getDate());
    },
    [getDateFromCol]
  );

  useEffect(() => {
    if (loading || scheduleViewMode === "kanban") return;
    const el = timelineScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = TODAY_COL * CW;
    });
  }, [loading, scheduleViewMode, TODAY_COL, COLS]);

  // Pan (hold left-drag on empty timeline) + zoom (while holding, or Ctrl/Cmd, +
  // wheel). All three timeline views share `timelineScrollRef`, so this binds once
  // per active view. Bars carry data-no-pan so a press there still drags the task.
  useEffect(() => {
    if (loading || scheduleViewMode === "kanban" || scheduleViewMode === "history") return;
    const el = timelineScrollRef.current;
    if (!el) return;

    let panning = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onInteractive = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest('[data-no-pan], button, a, input, select, textarea, [role="switch"], [role="separator"]');

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Don't pan from the sticky label gutter or from any interactive element.
      if (e.clientX - el.getBoundingClientRect().left < lwRef.current) return;
      if (onInteractive(e.target)) return;
      panning = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.scrollLeft;
      startTop = el.scrollTop;
      el.style.cursor = "grabbing";
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!panning) return;
      el.scrollLeft = startLeft - (e.clientX - startX);
      el.scrollTop = startTop - (e.clientY - startY);
    };

    const endPan = () => {
      if (!panning) return;
      panning = false;
      el.style.cursor = "grab";
    };

    // Zoom is coalesced into one state update per animation frame. Wheel/trackpad
    // pinch can fire dozens of events per gesture; applying setCW to each would
    // trigger dozens of synchronous re-renders of the whole timeline and lock the
    // tab. Instead we accumulate a target width and commit it once per frame.
    let zoomRAF = 0;
    let pendingTargetCW = 0;
    let pendingCursorX = 0;

    const commitZoom = () => {
      zoomRAF = 0;
      const appliedCW = cwRef.current;
      const targetCW = pendingTargetCW;
      const cursorX = pendingCursorX;
      if (!targetCW || targetCW === appliedCW) return;

      // Keep the day under the cursor anchored across the (coalesced) zoom step.
      const col = (el.scrollLeft + cursorX - lwRef.current) / appliedCW;
      const newScrollLeft = Math.max(0, col * targetCW + lwRef.current - cursorX);

      cwRef.current = targetCW;
      setCW(targetCW);
      requestAnimationFrame(() => {
        el.scrollLeft = newScrollLeft;
        if (panning) {
          startLeft = el.scrollLeft;
          startX = cursorX + el.getBoundingClientRect().left;
        }
      });
    };

    const onWheel = (e: WheelEvent) => {
      if (!panning && !e.ctrlKey && !e.metaKey) return; // leave normal scrolling alone
      e.preventDefault();
      const base = zoomRAF ? pendingTargetCW : cwRef.current;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const target = Math.round(Math.min(MAX_CW, Math.max(MIN_CW, base * factor)));
      if (target === base) return;
      pendingTargetCW = target;
      pendingCursorX = e.clientX - el.getBoundingClientRect().left;
      if (!zoomRAF) zoomRAF = requestAnimationFrame(commitZoom);
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endPan);
    return () => {
      el.style.cursor = "";
      if (zoomRAF) cancelAnimationFrame(zoomRAF);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endPan);
    };
  }, [loading, scheduleViewMode]);

  // Global drag tracking — snapshot drag at effect mount; compute delta from mouse on up (avoids stale state).
  useEffect(() => {
    if (!activeDrag) return;

    const drag = activeDrag;
    dragDidMoveRef.current = false;

    const colsShiftFromEvent = (e: MouseEvent) =>
      Math.round((e.clientX - drag.startX) / CW);

    const handleMouseMove = (e: MouseEvent) => {
      const colsShift = colsShiftFromEvent(e);
      if (colsShift !== 0) dragDidMoveRef.current = true;
      setDragDeltaCols(colsShift);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const colsShift = colsShiftFromEvent(e);
      if (colsShift !== 0) dragDidMoveRef.current = true;

      const originalStartCol = drag.startCol;
      const originalEndCol = drag.startCol + drag.duration - 1;

      let finalStartCol = originalStartCol;
      let finalEndCol = originalEndCol;

      if (drag.type === "move") {
        finalStartCol = Math.max(0, originalStartCol + colsShift);
        finalEndCol = Math.max(0, originalEndCol + colsShift);
      } else {
        finalEndCol = Math.max(finalStartCol, originalEndCol + colsShift);
      }

      const finalStartStr = getDateFromCol(finalStartCol);
      const finalEndStr = getDateFromCol(finalEndCol);
      const taskId = drag.id;

      setActiveDrag(null);
      setDragDeltaCols(0);

      const originalTask = displayTasksRef.current.find((t) => t.id === taskId);
      if (
        !originalTask ||
        (originalTask.start === finalStartStr && originalTask.end === finalEndStr)
      ) {
        return;
      }

      let cascade = autoCascadeRef.current;
      if (!cascade && taskHasDependents(taskId)) {
        cascade = window.confirm(
          "Also shift tasks that depend on this one?\n\nOK = move dependents too · Cancel = only this task"
        );
      }

      const serverTask = tasksRef.current.find((t) => t.id === taskId);
      setPendingDrafts((prev) => ({
        ...prev,
        [taskId]: {
          kind: "dates",
          start: finalStartStr,
          end: finalEndStr,
          cascade,
          savedStart: serverTask?.start ?? originalTask.start,
          savedEnd: serverTask?.end ?? originalTask.end,
        },
      }));
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeDrag, getDateFromCol, taskHasDependents]);

  const getWeatherForCol = (colIndex: number) => {
    const dStr = getDateFromCol(colIndex);
    return weatherForecast.find(w => w.dateStr === dStr);
  };

  const getWeatherStyleForCol = (colIndex: number): string => {
    const wx = getWeatherForCol(colIndex);
    if (!wx) return "transparent";
    if (wx.risk === "danger") return "rgba(224,74,74,0.12)"; // storm day (red shade)
    if (wx.risk === "warn") return "rgba(184,115,22,0.1)"; // rain day (amber shade)
    return "transparent";
  };

  const taskHasWeatherRisk = (task: Task): boolean => {
    const tStart = new Date(task.start);
    const tEnd = new Date(task.end);
    return weatherForecast.some(w => {
      if (w.risk === "warn" || w.risk === "danger") {
        const wDate = new Date(w.dateStr);
        return wDate >= tStart && wDate <= tEnd;
      }
      return false;
    });
  };

  const weatherRiskCols = useMemo(() => {
    const cols: number[] = [];
    for (let i = 0; i < COLS; i++) {
      const wx = weatherForecast.find((w) => w.dateStr === getDateFromCol(i));
      if (wx && (wx.risk === "warn" || wx.risk === "danger")) cols.push(i);
    }
    return cols;
  }, [COLS, weatherForecast, getDateFromCol]);

  // Group tasks by project (respects active filters)
  const projectsGroup: { [projName: string]: { color: string; tasks: Task[] } } = {};
  const colorsMap: { [key: string]: string } = {
    "Parramatta Square — Tower C": C.blue,
    "Victoria Harbour — Stage 2": C.green,
    "Southbank Residences — T1": C.purple,
    "North Ryde Business Park — S1": C.gray,
  };

  for (const t of filteredTasks) {
    const projName = t.project || "Other Project";
    if (!projectsGroup[projName]) {
      projectsGroup[projName] = {
        color: colorsMap[projName] || C.blueMid,
        tasks: [],
      };
    }
    projectsGroup[projName].tasks.push(t);
  }

  // Order each project's tasks by schedule: earliest start first, then earliest
  // finish, then task id as a stable tiebreaker. ISO date strings compare
  // chronologically. This drives the row order in the "By Project" view.
  for (const projName in projectsGroup) {
    projectsGroup[projName].tasks.sort((a, b) => {
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      if (a.end !== b.end) return a.end < b.end ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }

  const hasActiveFilters =
    filterProjects.length > 0 ||
    filterResources.length > 0 ||
    filterStatus !== "all" ||
    filterTrade !== "all" ||
    filterSearch.trim().length > 0;

  const clearFilters = () => {
    setFilterProjects([]);
    setFilterResources([]);
    setFilterStatus("all");
    setFilterTrade("all");
    setFilterSearch("");
  };

  const predecessorOptions = useMemo(
    () =>
      displayTasks.filter(
        (t) => t.project === formProject && t.id !== editingTask?.id && !t.id.startsWith("DRAFT-")
      ),
    [displayTasks, formProject, editingTask]
  );

  const tradeOptions = useMemo(
    () => (masters?.trades || []).filter((t) => t.is_active !== false).map((t) => t.label),
    [masters]
  );

  useEffect(() => {
    if (!formDependencies || !formProject) return;
    const current = formDependencies.split(",")[0].trim();
    if (current && !predecessorOptions.some((t) => t.id === current)) {
      setFormDependencies("");
    }
  }, [formProject, predecessorOptions, formDependencies]);

  // Open Edit Dialog for Task
  const handleOpenEdit = (t: Task) => {
    setEditingTask(t);
    setFormProject(t.project);
    setFormName(t.name);
    setFormStart(t.start);
    setFormEnd(t.end);
    setFormLagDays(t.lag_days || 0);
    setFormAssigneeId(t.assigneeId || "");
    setFormTrade(t.trade || "Labour");
    setFormDependencies(t.dependencies || "");
    setFormDepType(t.dependency_type || "FS");
    setFormCostOverrideActive(t.cost_override !== null && t.cost_override !== undefined);
    setFormCostOverride(t.cost_override !== null && t.cost_override !== undefined ? String(t.cost_override) : "");
    setFormCostOverrideType(t.cost_override_type || "hourly");
    setShowTaskAdvanced(!!(t.dependencies && t.dependencies !== "-") || t.lag_days > 0 || (t.cost_override !== null && t.cost_override !== undefined));
    setShowAddModal(true);
  };

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingTask(null);
    setFormName("");
    setFormStart("2026-06-01");
    setFormEnd("2026-06-05");
    setFormLagDays(0);
    setFormAssigneeId("");
    setFormTrade(masters?.trades[0]?.label || "Labour");
    setFormDependencies("");
    setFormDepType("FS");
    setFormCostOverrideActive(false);
    setFormCostOverride("");
    setFormCostOverrideType("hourly");
    setShowTaskAdvanced(false);
    setShowAddModal(true);
  };

  // Submit Task Create/Edit form
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) {
      alert("Please provide a task name");
      return;
    }

    const matchedRes = resources.find((r) => r.id === formAssigneeId);
    const assigneeName = formAssigneeId ? matchedRes?.name ?? "Unassigned" : "Unassigned";
    const projectRow = projects.find((p) => p.name === formProject);

    const payload = {
      project: formProject,
      name: formName,
      start: formStart,
      end: formEnd,
      lag_days: Number(formLagDays) || 0,
      assigneeId: formAssigneeId || null,
      assignee: assigneeName,
      trade: formTrade,
      dependencies: formDependencies,
      dependency_type: formDepType,
      cost_override: !formCostOverrideActive ? null : (parseFloat(formCostOverride) || null),
      cost_override_type: !formCostOverrideActive ? null : formCostOverrideType,
    };

    setShowAddModal(false);

    if (editingTask) {
      setPendingDrafts((prev) => ({
        ...prev,
        [editingTask.id]: {
          kind: "edit",
          payload,
          savedTask: editingTask,
        },
      }));
      setSavingMsg("Task update added to draft — review conflicts, then save programme.");
      window.setTimeout(() => setSavingMsg(null), 3500);
      return;
    }

    const tempId = `DRAFT-${Date.now()}`;
    const durationDays = Math.max(
      1,
      Math.round(
        (new Date(formEnd).getTime() - new Date(formStart).getTime()) / 86400000
      ) + 1
    );
    const draftTask: Task = {
      id: tempId,
      projectId: projectRow?.id || "",
      name: formName,
      assigneeId: formAssigneeId || null,
      tradeRequired: formTrade,
      start: formStart,
      end: formEnd,
      durationDays,
      dependencies: formDependencies || "-",
      status: "scheduled",
      project: formProject,
      assignee: assigneeName,
      trade: formTrade,
      lag_days: Number(formLagDays) || 0,
      dependency_type: formDepType as "FS" | "SS",
      cost_override: payload.cost_override,
      cost_override_type: payload.cost_override_type,
      percent_complete: 0,
    };

    setDraftNewTasks((prev) => [...prev, draftTask]);
    setPendingDrafts((prev) => ({
      ...prev,
      [tempId]: { kind: "create", payload },
    }));
    setSavingMsg("New task added to draft — review conflicts, then save programme.");
    window.setTimeout(() => setSavingMsg(null), 3500);
  };

  const handleReassign = (taskId: string, assigneeId: string) => {
    setSavingMsg("Reassigning subcontractor company team...");
    const matchedRes = resources.find(r => r.id === assigneeId);
    const assigneeName = matchedRes ? matchedRes.name : "Unassigned";
    const tradeName = matchedRes ? matchedRes.trade : "Labour";
    fetch(`/api/v1/tasks/${taskId}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigneeId: assigneeId || null,
        assignee: assigneeName,
        trade: tradeName,
        cascade: autoCascadeDependents
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          loadAllData();
        } else {
          setSavingMsg(null);
        }
      })
      .catch(err => {
        console.error("Error reassigning subcontractor:", err);
        setSavingMsg(null);
      });
  };

  const handlePercentChange = (taskId: string, percent: number) => {
    setSavingMsg(`Updating progress parameters to ${percent}%...`);
    let nextStatus = "inprogress";
    if (percent === 100) nextStatus = "completed";
    else if (percent === 0) nextStatus = "scheduled";

    fetch(`/api/v1/tasks/${taskId}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        percent_complete: percent,
        status: nextStatus,
        cascade: autoCascadeDependents
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          loadAllData();
        } else {
          setSavingMsg(null);
        }
      })
      .catch(err => {
        console.error("Error updating task percent progress:", err);
        setSavingMsg(null);
      });
  };

  if (loading) {
    return <div style={{ padding: 25, color: C.gray, textAlign: "center", fontSize: 14 }}>Loading programme...</div>;
  }

  return (
    <div>
      {/* Conflict alert — compact header, expandable details */}
      {draftConflicts.length > 0 && (
        <div style={{ marginBottom: 16, borderRadius: 12, border: `1.5px solid ${C.red}`, background: C.redBg, overflow: "hidden", boxShadow: "0 4px 14px rgba(224,74,74,0.10)" }}>
          {/* Always-visible compact row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.redDark }}>
                {groupedDraftConflicts.length} scheduling conflict{groupedDraftConflicts.length > 1 ? "s" : ""} — not saved
              </span>
              <span style={{ fontSize: 12, color: C.text, marginLeft: 8 }}>
                {groupedDraftConflicts.map(([, cs]) => cs[0].resourceName).join(" · ")}
              </span>
            </div>
            {hasPendingDrafts && (
              <button type="button" onClick={discardDrafts}
                style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${C.red}`, background: C.white, color: C.redDark, cursor: "pointer", flexShrink: 0 }}>
                Discard
              </button>
            )}
            <button type="button" onClick={() => setShowConflictExpanded(v => !v)}
              style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid #FECACA`, background: showConflictExpanded ? C.redBg : C.white, color: C.redDark, cursor: "pointer", flexShrink: 0 }}>
              {showConflictExpanded ? "Hide ▲" : "Fix ▼"}
            </button>
          </div>

          {/* Expandable details */}
          {showConflictExpanded && (
            <div style={{ borderTop: `1px solid #FECACA`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {groupedDraftConflicts.map(([resourceId, conflicts]) => {
                const resourceRow = resources.find((r) => r.id === resourceId);
                const trade = resourceRow?.trade || displayTasks.find((t) => t.assigneeId === resourceId)?.trade || "Labour";
                const primary = conflicts[0];
                const refreshSeed = recRefreshSeeds[resourceId] || 0;
                const recommendations = buildSmartRecommendations(primary, displayTasks, resources, pendingDrafts, conflictedResourceIds, refreshSeed, projects);
                const constraintInsight = buildConflictConstraintInsight(primary, displayTasks, pendingDrafts);

                return (
                  <div key={resourceId} style={{ background: C.white, borderRadius: 10, border: `1px solid #FECACA`, padding: "12px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.redDark, marginBottom: 6 }}>
                      {primary.resourceName} — scheduling conflict
                    </div>
                    {conflicts.map((c, idx) => (
                      <div key={idx} style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>
                        • {c.taskAName} ({c.datesA}) ↔ {c.taskBName} ({c.datesB})
                      </div>
                    ))}

                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#F3F2FF", border: "1px solid rgba(127,119,221,0.35)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.purple }}>Smart recommendation</span>
                        <button type="button"
                          onClick={() => setRecRefreshSeeds((prev) => ({ ...prev, [resourceId]: (prev[resourceId] || 0) + 1 }))}
                          style={{ padding: "3px 8px", fontSize: 10.5, fontWeight: 600, borderRadius: 6, border: `1px solid ${C.purple}55`, background: C.white, color: C.purple, cursor: "pointer" }}>
                          ↻ Refresh
                        </button>
                      </div>

                      {constraintInsight && (
                        <div style={{ fontSize: 11.5, color: C.text, background: C.white, borderRadius: 8, border: `1px solid ${C.amber}55`, padding: "8px 10px", marginBottom: 10, lineHeight: 1.45 }}>
                          <div style={{ fontWeight: 700, color: C.amber, marginBottom: 6 }}>Which task should stay fixed?</div>
                          <div style={{ marginBottom: 4 }}>
                            <strong>{constraintInsight.taskA.name}</strong>
                            <span style={{ color: constraintInsight.suggestedAnchorTaskId === primary.taskAId ? C.greenDark : C.blue, fontWeight: 600 }}>{constraintInsight.suggestedAnchorTaskId === primary.taskAId ? " · likely fixed" : " · can adjust"}</span>
                            {constraintInsight.taskA.reasons.length > 0 && <span style={{ color: C.textMuted }}> — {constraintInsight.taskA.reasons.join("; ")}</span>}
                          </div>
                          <div>
                            <strong>{constraintInsight.taskB.name}</strong>
                            <span style={{ color: constraintInsight.suggestedAnchorTaskId === primary.taskBId ? C.greenDark : C.blue, fontWeight: 600 }}>{constraintInsight.suggestedAnchorTaskId === primary.taskBId ? " · likely fixed" : " · can adjust"}</span>
                            {constraintInsight.taskB.reasons.length > 0 && <span style={{ color: C.textMuted }}> — {constraintInsight.taskB.reasons.join("; ")}</span>}
                          </div>
                        </div>
                      )}

                      {recommendations.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {recommendations.map((rec, idx) => (
                            <div key={rec.id} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${idx === 0 ? C.green : C.grayLight}`, background: idx === 0 ? C.greenBg : C.white }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: idx === 0 ? C.greenDark : C.gray, marginBottom: 4 }}>
                                {idx === 0 ? "Best option" : `Option ${idx + 1}`} · {rec.kind === "reschedule" ? "Reschedule" : "Reallocate"} · keep "{rec.anchorTaskName}" fixed
                              </div>
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 2 }}>{rec.headline}</div>
                              <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.45, marginBottom: 8 }}>{rec.detail}</div>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11, color: C.gray, marginBottom: 8 }}>
                                <span style={{ fontWeight: 600, color: C.text }}>{formatAud(rec.costImpact.planBefore)}</span>
                                <span>→</span>
                                <span style={{ fontWeight: 600, color: C.text }}>{formatAud(rec.costImpact.planAfter)}</span>
                                <span style={{ fontWeight: 600, color: rec.costImpact.delta > 0 ? C.red : rec.costImpact.delta < 0 ? C.greenDark : C.gray }}>({formatCostDelta(rec.costImpact.delta)})</span>
                              </div>
                              <button type="button" onClick={() => applySmartRecommendation(rec)}
                                style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 600, borderRadius: 8, border: "none", background: idx === 0 ? C.green : C.blueMid, color: C.white, cursor: "pointer" }}>
                                Apply to draft
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.5 }}>
                          No automatic fix found — drag a bar to reschedule, or edit the task to change assignee.
                          <div style={{ marginTop: 4, fontSize: 11, color: C.textMuted }}>Tip: pick another {trade} resource, or shift the later task to start after the earlier one ends.</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View Switcher Tabs & New Task creation action rail */}
      <div style={{ display:"flex", justifyContent:"space-between", gap:14, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        {/* Toggle Switcher */}
        <div style={{ display:"flex", background:"#E2E8F0", padding:3, borderRadius:10, width:"fit-content" }}>
          {([
            { id: "projectteam", label: "Team Allocation", icon: <Users size={14} /> },
            { id: "overall",     label: "By Project",      icon: <FolderKanban size={14} /> },
            { id: "resource",    label: "By Resource",     icon: <HardHat size={14} /> },
            { id: "kanban",      label: "Kanban",          icon: <Columns3 size={14} /> },
            { id: "history",     label: "Change History",  icon: <History size={14} /> },
          ] as const).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScheduleViewMode(tab.id)}
              style={{
                padding:"7px 14px", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
                display:"inline-flex", alignItems:"center", gap:6,
                background: scheduleViewMode === tab.id ? C.white : "transparent",
                color: scheduleViewMode === tab.id ? C.navy : C.textMuted,
                boxShadow: scheduleViewMode === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          {(scheduleViewMode === "projectteam" || scheduleViewMode === "overall" || scheduleViewMode === "resource") && (
            <div
              style={{ display:"flex", alignItems:"center", gap:0, border:`0.5px solid ${C.grayLight}`, borderRadius:8, background:C.white, overflow:"hidden" }}
              title="Zoom timeline — or hold left-drag on the chart and scroll the wheel"
            >
              <button type="button" onClick={() => zoomBy(1 / 1.2)} disabled={CW <= MIN_CW} style={{ padding:"6px 10px", border:"none", background:"transparent", cursor: CW <= MIN_CW ? "not-allowed" : "pointer", fontSize:14, fontWeight:700, color: CW <= MIN_CW ? C.grayLight : C.textMuted }} title="Zoom out">−</button>
              <button type="button" onClick={resetZoom} style={{ padding:"6px 4px", border:"none", borderLeft:`0.5px solid ${C.grayLight}`, borderRight:`0.5px solid ${C.grayLight}`, background:"transparent", cursor:"pointer", fontSize:11, fontWeight:600, color:C.textMuted, minWidth:46, fontVariantNumeric:"tabular-nums" }} title="Reset zoom to 100%">{Math.round((CW / DEFAULT_CW) * 100)}%</button>
              <button type="button" onClick={() => zoomBy(1.2)} disabled={CW >= MAX_CW} style={{ padding:"6px 10px", border:"none", background:"transparent", cursor: CW >= MAX_CW ? "not-allowed" : "pointer", fontSize:14, fontWeight:700, color: CW >= MAX_CW ? C.grayLight : C.textMuted }} title="Zoom in">+</button>
            </div>
          )}
          <button style={{ padding: "8px 14px", background: C.blue, color: C.white, border: "none", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 600 }} onClick={handleOpenCreate}>+ Add Task</button>
          <button
            style={{ padding: "8px 14px", background: adjustActive ? C.purple : "#F3F2FF", color: adjustActive ? C.white : C.purple, border: `0.5px solid ${C.purple}`, borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => (adjustActive ? closeAdjust() : openAdjust())}
            title="Stage a working-day delay with full / partial / no cascade"
          >
            <Timer size={14} /> {adjustActive ? "Close Adjuster" : "Adjust Timeline"}
          </button>
          <button style={{ padding: "8px 14px", background: C.bgSecond, color: C.text, border: `0.5px solid ${C.grayLight}`, borderRadius: 8, fontSize: 12, cursor: "pointer" }} onClick={loadAllData} title="Reload tasks">↻ Refresh</button>
        </div>
      </div>

      {/* Filters — hidden in Change History mode */}
      {scheduleViewMode !== "history" && (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 14,
          padding: "10px 12px",
          background: C.white,
          border: `0.5px solid ${C.grayLight}`,
          borderRadius: 10,
        }}
      >
        <input
          type="search"
          placeholder="Search tasks..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          style={{
            flex: "1 1 200px",
            minWidth: 180,
            padding: "8px 12px",
            fontSize: 12.5,
            borderRadius: 8,
            border: `0.5px solid ${C.grayLight}`,
          }}
        />
        <MultiSelectDropdown
          label="Project"
          options={projects.map(p => ({ value: p.name, label: p.name.split(" —")[0] }))}
          selected={filterProjects}
          onChange={setFilterProjects}
        />
        <MultiSelectDropdown
          label="Resource"
          options={[
            { value: "unassigned", label: "Unassigned" },
            ...resources.map(r => ({ value: r.id, label: r.name })),
          ]}
          selected={filterResources}
          onChange={setFilterResources}
        />
        <button
          type="button"
          onClick={() => setShowAdvancedFilters((v) => !v)}
          style={{
            padding: "8px 12px",
            fontSize: 12,
            borderRadius: 8,
            border: `0.5px solid ${C.grayLight}`,
            background: showAdvancedFilters ? C.blueLight : C.white,
            cursor: "pointer",
            color: C.text,
            fontWeight: 500,
          }}
        >
          {showAdvancedFilters ? "Hide filters" : "More filters"}
        </button>
        {showAdvancedFilters && (
          <>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 12.5, borderRadius: 8, border: `0.5px solid ${C.grayLight}` }}
        >
          <option value="all">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="inprogress">In progress</option>
          <option value="completed">Completed</option>
          <option value="conflict">Conflict</option>
          <option value="fragile">Fragile buffer</option>
          <option value="weather">Weather risk</option>
          <option value="overdue">Overdue</option>
        </select>
        <select
          value={filterTrade}
          onChange={(e) => setFilterTrade(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 12.5, borderRadius: 8, border: `0.5px solid ${C.grayLight}` }}
        >
          <option value="all">All trades</option>
          {tradeFilterOptions.map((tr) => (
            <option key={tr} value={tr}>
              {tr}
            </option>
          ))}
        </select>
          </>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            style={{
              padding: "6px 10px",
              fontSize: 11,
              borderRadius: 8,
              border: `0.5px solid ${C.grayLight}`,
              background: C.bgSecond,
              cursor: "pointer",
              color: C.textMuted,
            }}
          >
            Clear filters
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {filterProjects.map(p => (
            <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 6, background: C.blueLight, color: C.blue, fontWeight: 600 }}>
              {p.split(" —")[0]}
              <button type="button" onClick={() => setFilterProjects(filterProjects.filter(x => x !== p))} style={{ background: "none", border: "none", cursor: "pointer", color: C.blue, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
          {filterResources.map(rid => {
            const r = resources.find(x => x.id === rid);
            const label = rid === "unassigned" ? "Unassigned" : (r?.name || rid);
            return (
              <span key={rid} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#F3F2FF", color: C.purple, fontWeight: 600 }}>
                {label}
                <button type="button" onClick={() => setFilterResources(filterResources.filter(x => x !== rid))} style={{ background: "none", border: "none", cursor: "pointer", color: C.purple, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
              </span>
            );
          })}
          <span style={{ fontSize: 11, color: C.gray }}>
            {filteredTasks.length} / {displayTasks.length} tasks
            {hasPendingDrafts && <span style={{ color: C.amber, fontWeight: 600 }}> · draft</span>}
          </span>
        </div>
      </div>
      )}

      {/* Draft status bar — save only when no conflicts */}
      {hasPendingDrafts && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${draftConflicts.length > 0 ? C.red : C.amber}`,
            background: draftConflicts.length > 0 ? "#FFF5F5" : C.amberBg,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 12.5, color: C.text }}>
            <strong>Draft mode</strong> · {pendingChangeCount} unsaved change{pendingChangeCount === 1 ? "" : "s"}
            {draftConflicts.length > 0 ? (
              <span style={{ color: C.redDark, fontWeight: 600 }}> — resolve conflict above before saving</span>
            ) : (
              <span style={{ color: C.greenDark }}> — ready to save</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!draftConflicts.length && (
              <button
                type="button"
                onClick={discardDrafts}
                style={{
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: `1px solid ${C.grayLight}`,
                  background: C.white,
                  cursor: "pointer",
                  color: C.text,
                }}
              >
                Discard
              </button>
            )}
            <button
              type="button"
              onClick={() => void commitDrafts()}
              disabled={draftConflicts.length > 0}
              title={draftConflicts.length > 0 ? "Resolve conflicts first" : "Save to live programme"}
              style={{
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background: draftConflicts.length > 0 ? C.grayLight : C.blue,
                color: draftConflicts.length > 0 ? C.gray : C.white,
                cursor: draftConflicts.length > 0 ? "not-allowed" : "pointer",
              }}
            >
              Save programme
            </button>
          </div>
        </div>
      )}

      {/* Compact weather strip — only show risky days */}
      {weatherForecast && weatherForecast.some(w => w.risk === "warn" || w.risk === "danger") && (
        <div style={{
          background: "#F8FAFC",
          border: `1px solid ${C.grayLight}`,
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>🌧 Weather risk this week</span>
          {weatherForecast.filter(w => w.risk === "warn" || w.risk === "danger").map(w => (
            <span key={w.date} style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              background: w.risk === "danger" ? C.redBg : C.amberBg,
              color: w.risk === "danger" ? C.redDark : C.amber,
              fontWeight: 600,
            }}>
              {w.date} · {w.desc}
            </span>
          ))}
        </div>
      )}

      {/* Legend rail – hides in Kanban / History mode for clarity */}
      {scheduleViewMode !== "kanban" && scheduleViewMode !== "history" && (
        <div style={{ display:"flex", gap:16, alignItems:"center", fontSize:12, color:C.textMuted, flexWrap: "wrap", marginBottom:14 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:12, height:12, background:C.red, borderRadius:"50%", display:"inline-block" }} />Conflict</span>
          <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:12, height:12, background:C.amber, borderRadius:"50%", display:"inline-block" }} />Fragile</span>
          <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:12, height:12, background:C.blueMid, borderRadius:"50%", display:"inline-block" }} />On track</span>
          <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:12, height:12, border:`2px dashed ${C.amber}`, borderRadius:4, display:"inline-block" }} />Draft (unsaved)</span>
          {(scheduleViewMode === "overall" || scheduleViewMode === "projectteam") && <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ display:"inline-block", width:2, height:14, background:C.blue, borderRadius:1 }} /><span style={{ fontSize:9, marginLeft:1 }}>▼</span>PC Deadline</span>}
        </div>
      )}

      {/* Saving / Processing Floating banner */}
      {savingMsg && (
        <div style={{ background: C.blueMid, color: C.white, padding: "10px 18px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(58,138,222,0.15)" }}>
          <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #FFFFFF", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          {savingMsg}
        </div>
      )}

      {/* Timeline adjustment staging panel */}
      {adjustActive && adjustAnchorTask && scheduleViewMode !== "history" && (
        <TimelineAdjustPanel
          anchorTask={adjustAnchorTask}
          candidateTasks={adjustCandidateTasks}
          mode={adjustMode}
          delayDays={adjustDelay}
          maxDelay={MAX_DELAY_DAYS}
          moves={adjustMoves}
          warnings={adjustWarnings}
          summary={adjustSummary}
          onAnchorChange={(id) => setAdjustAnchorId(id)}
          onModeChange={setAdjustMode}
          onDelayChange={setAdjustDelay}
          onConfirm={() => void confirmAdjust()}
          onCancel={closeAdjust}
        />
      )}

      {/* VIEW RENDER: CHANGE HISTORY */}
      {scheduleViewMode === "history" && (
        <ChangeHistoryTab
          changeSets={changeSets}
          currentTasks={tasks}
          onRevert={(cs) => void revertChangeSet(cs)}
        />
      )}

      {/* VIEW RENDER: PROJECT × TEAM (default) */}
      {scheduleViewMode === "projectteam" && (
        <div style={{ border:`0.5px solid ${C.grayLight}`, borderRadius:12, overflow:"hidden", background:C.white, display:"flex", flexDirection:"column" }}>
          <div ref={timelineScrollRef} style={{ overflow:"auto", maxHeight:GANTT_SCROLL_MAX_HEIGHT, flex:1 }}>
            <div style={{ minWidth: LW + COLS * CW }}>

              {/* Sticky header row */}
              <div style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS * CW }}>
                <div style={{ ...stickyTimelineHeaderLeft(C.bgSecond), padding:"10px 14px", fontSize:11.2, fontWeight:600, color:C.textMuted }}>
                  Project / Resource
                  <div role="separator" style={leftColResizeHandleStyle} onMouseDown={startLeftColumnResize} title="Drag to resize">
                    <div style={{ width:2, height:"70%", borderRadius:2, background: isResizingLeftCol ? C.blue : "#94A3B8" }} />
                  </div>
                </div>
                {Array.from({ length: COLS }).map((_, i) => {
                  const wx = getWeatherForCol(i);
                  const isTd = i === TODAY_COL;
                  const wkIdx = Math.floor(i / 7);
                  return (
                    <div key={i} style={{ width:CW, flexShrink:0, height:44, borderLeft:`0.5px solid ${C.grayLight}`, background:getWeatherStyleForCol(i), position:"sticky", top:0, zIndex:20 }}>
                      {i % 7 === 0 && <span style={{ fontSize:9, color: wx && wx.risk !== "ok" ? (wx.risk === "danger" ? C.redDark : C.amber) : C.gray, fontWeight:600, whiteSpace:"nowrap", position:"absolute", top:3, left:"50%", transform:"translateX(-50%)" }}>{weeks[wkIdx] || ""}</span>}
                      {wx && wx.risk !== "ok" && <span style={{ fontSize:9, position:"absolute", top:16, left:"50%", transform:"translateX(-50%)" }} title={wx.desc}>{wx.icon}</span>}
                      <span style={{ fontSize:10, position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)", color: isTd ? C.red : C.textMuted, fontWeight: isTd ? 700 : 500 }}>{formatColDay(i)}</span>
                      {isTd && <div style={{ position:"absolute", top:0, bottom:0, left:"50%", marginLeft:-1, width:2, background:C.red, opacity:0.75, zIndex:1 }} />}
                    </div>
                  );
                })}
              </div>

              {/* Project groups */}
              {Object.entries(projectsGroup).map(([projName, group]) => {
                const projectData = projects.find(p => p.name === projName);
                const pcEndCol = projectData?.pcEndDate ? getColFromDate(projectData.pcEndDate) : null;

                // Build resource → tasks map for this project
                const resMap = new Map<string, { res: Resource | null; tasks: Task[] }>();
                group.tasks.forEach(task => {
                  if (task.assigneeId && task.assignee !== "Unassigned") {
                    if (!resMap.has(task.assigneeId)) {
                      resMap.set(task.assigneeId, { res: resources.find(r => r.id === task.assigneeId) || null, tasks: [] });
                    }
                    resMap.get(task.assigneeId)!.tasks.push(task);
                  }
                });
                const unassigned = group.tasks.filter(t => !t.assigneeId || t.assignee === "Unassigned");

                return (
                  <div key={projName}>
                    {/* Project section header */}
                    <div style={{ display:"flex", background:"#F8FAFC", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS*CW, minHeight:30, alignItems:"center" }}>
                      <div style={{ ...stickyLeft("#F8FAFC"), padding:"5px 14px", fontSize:11, fontWeight:700, color:C.blue, display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:9, height:9, background:group.color, borderRadius:"50%", display:"inline-block", flexShrink:0 }} />
                        {projName.split(" —")[0]}
                        {projectData?.pcEndDate && <span style={{ fontSize:9.5, fontWeight:500, color:C.gray, marginLeft:4 }}>PC: {projectData.pcEndDate}</span>}
                      </div>
                      {Array.from({length:COLS}).map((_, i) => (
                        <div key={i} style={{ width:CW, flexShrink:0, height:30, borderLeft:`0.5px solid ${C.grayLight}`, background:getWeatherStyleForCol(i), position:"relative" }}>
                          {i === TODAY_COL && <div style={{ position:"absolute", top:0, bottom:0, left:0, width:1.5, background:C.red, opacity:0.4 }} />}
                          {i === pcEndCol && (
                            <div title={`PC Deadline: ${projectData?.pcEndDate}`} style={{ position:"absolute", top:0, bottom:0, left:"50%", marginLeft:-1, width:2, background:group.color, opacity:0.9, zIndex:5 }}>
                              <div style={{ position:"absolute", top:2, left:-3, width:0, height:0, borderLeft:"4px solid transparent", borderRight:"4px solid transparent", borderTop:`7px solid ${group.color}` }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* One row per assigned resource in this project */}
                    {Array.from(resMap.entries()).map(([assigneeId, { res, tasks: resTasks }]) => {
                      const isConflicted = conflictedResourceIds.has(assigneeId);
                      const rowBg = isConflicted ? "#FFF8F8" : C.white;

                      return (
                        <div key={assigneeId} style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS*CW, minHeight:ROW_HEIGHT + 4, alignItems:"center", position:"relative" }}>
                          {/* Resource identity */}
                          <div style={{ ...stickyLeft(rowBg), padding:"5px 12px", display:"flex", alignItems:"center", gap:8, borderRight:`0.5px solid ${isConflicted ? "#FECACA" : "#F1F5F9"}` }}>
                            <div style={{ width:26, height:26, borderRadius:"50%", background: isConflicted ? C.redBg : "#B5D4F4", color: isConflicted ? C.redDark : "#0C447C", fontSize:9.5, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              {res?.initials || "?"}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:600, color: isConflicted ? C.redDark : C.text, display:"flex", alignItems:"center", gap:4 }}>
                                {res?.name || "Unknown"}
                                {isConflicted && <span style={{ fontSize:10, background:C.redBg, color:C.redDark, padding:"1px 5px", borderRadius:4, fontWeight:700, flexShrink:0 }}>⚠ Conflict</span>}
                              </div>
                              <div style={{ fontSize:9.5, color:C.gray }}>{res?.trade || ""} · {res?.state || ""}</div>
                            </div>
                          </div>

                          {/* Timeline columns */}
                          {Array.from({length:COLS}).map((_, i) => (
                            <div key={i} style={{ width:CW, flexShrink:0, height:ROW_HEIGHT + 4, borderLeft:`0.5px solid ${C.grayLight}`, background: isConflicted ? "rgba(254,242,242,0.4)" : getWeatherStyleForCol(i), position:"relative" }}>
                              {i === TODAY_COL && <div style={{ position:"absolute", top:0, bottom:0, left:0, width:1.5, background:C.red, opacity:0.25 }} />}
                            </div>
                          ))}

                          {/* Task bars — full drag/resize support */}
                          {resTasks.map(task => {
                            const sCol = getColFromDate(task.start);
                            const lCol = getColDuration(task.start, task.end);
                            const isThisDragged = activeDrag && activeDrag.id === task.id;
                            let renderedStartCol = sCol;
                            let renderedDurationCol = lCol;
                            if (isThisDragged) {
                              if (activeDrag.type === "move") renderedStartCol = Math.max(0, sCol + dragDeltaCols);
                              else renderedDurationCol = Math.max(1, lCol + dragDeltaCols);
                            }
                            const barColor = getTaskBarColor(task);
                            const done = isTaskDone(task);
                            const isDraft = isDraftTaskId(task.id, pendingDrafts);
                            const adjMove = adjustActive ? adjustMovesById.get(task.id) : undefined;

                            return (
                              <React.Fragment key={task.id}>
                              {adjMove && <AdjustmentGhost move={adjMove} rowHeight={ROW_HEIGHT + 4} />}
                              <div
                                data-no-pan="1"
                                style={{
                                  position:"absolute",
                                  left: LW + renderedStartCol * CW,
                                  width: Math.max(26, renderedDurationCol * CW),
                                  top: (ROW_HEIGHT + 4 - BAR_HEIGHT) / 2, height: BAR_HEIGHT,
                                  background: barColor, borderRadius:6,
                                  display:"flex", alignItems:"center",
                                  padding:"0 16px 0 8px", fontSize:11, fontWeight:600, color:C.white,
                                  overflow:"hidden", whiteSpace:"nowrap",
                                  opacity: isThisDragged ? 0.85 : 1,
                                  zIndex: isThisDragged ? 10 : 2,
                                  cursor: activeDrag ? (activeDrag.id === task.id ? (activeDrag.type === "move" ? "grabbing" : "ew-resize") : "default") : "grab",
                                  boxShadow: isThisDragged ? "0 4px 10px rgba(0,0,0,0.18)" : isDraft ? "0 0 0 2px rgba(184,115,22,0.55)" : task.status === "conflict" ? "0 0 0 2.5px rgba(224,74,74,0.6)" : "0 1px 3px rgba(0,0,0,0.12)",
                                  border: isThisDragged ? "1px dashed rgba(255,255,255,0.6)" : isDraft ? "2px dashed rgba(255,255,255,0.9)" : "none",
                                  transition: activeDrag ? "none" : "left 0.1s ease, width 0.1s ease",
                                  userSelect:"none",
                                }}
                                onMouseDown={(e) => {
                                  if (e.button !== 0) return;
                                  if (adjustActive) return;
                                  e.preventDefault();
                                  dragDidMoveRef.current = false;
                                  setActiveDrag({ id: task.id, type: "move", startX: e.clientX, startCol: sCol, duration: lCol });
                                }}
                                onClick={() => {
                                  if (dragDidMoveRef.current) { dragDidMoveRef.current = false; return; }
                                  if (adjustActive) { setAdjustAnchorId(task.id); return; }
                                  setSelectedTaskId(task.id);
                                  handleOpenEdit(task);
                                }}
                                title={`${task.name} · ${task.start} → ${task.end}`}
                              >
                                {done && <span style={{ marginRight:3 }}>✓</span>}
                                {task.status === "conflict" && <span style={{ marginRight:3 }}>⚠</span>}
                                {taskHasWeatherRisk(task) && <span style={{ marginRight:3 }}>🌧️</span>}
                                {taskDisplayName(task)}
                                {task.percent_complete > 0 && ` (${task.percent_complete}%)`}
                                <div style={{ position:"absolute", right:0, top:0, bottom:0, width:10, cursor:"ew-resize", background:"rgba(255,255,255,0.15)", borderLeft:"0.5px solid rgba(255,255,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, userSelect:"none" }}
                                  onMouseDown={(e) => {
                                    if (adjustActive) return;
                                    e.stopPropagation(); e.preventDefault();
                                    dragDidMoveRef.current = false;
                                    setActiveDrag({ id: task.id, type: "resize", startX: e.clientX, startCol: sCol, duration: lCol });
                                  }}>⋮</div>
                              </div>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      );
                    })}

                    {/* Unassigned row for this project */}
                    {unassigned.length > 0 && (
                      <div style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS*CW, minHeight:ROW_HEIGHT, alignItems:"center", position:"relative", background:"#FAFBFD" }}>
                        <div style={{ ...stickyLeft("#FAFBFD"), padding:"6px 12px 6px 16px", fontSize:11.5, color:C.gray, fontStyle:"italic" }}>
                          <span>📋 Unassigned ({unassigned.length})</span>
                        </div>
                        {Array.from({length:COLS}).map((_, i) => (
                          <div key={i} style={{ width:CW, flexShrink:0, height:ROW_HEIGHT, borderLeft:`0.5px solid ${C.grayLight}` }} />
                        ))}
                        {unassigned.map(task => {
                          const sCol = getColFromDate(task.start);
                          const lCol = getColDuration(task.start, task.end);
                          return (
                            <div key={task.id} data-no-pan="1" onClick={() => handleOpenEdit(task)} title={`Unassigned: ${task.name}`}
                              style={{ position:"absolute", left: LW + sCol * CW, width: Math.max(26, lCol * CW), top:(ROW_HEIGHT - BAR_HEIGHT)/2, height:BAR_HEIGHT, background:"#94A3B8", border:"1px dashed #64748B", borderRadius:6, display:"flex", alignItems:"center", padding:"0 8px", fontSize:11, fontWeight:600, color:C.white, overflow:"hidden", whiteSpace:"nowrap", zIndex:2, cursor:"pointer" }}>
                              {task.name}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{ background:C.bgSecond, padding:"8px 14px", display:"flex", justifyContent:"space-between", fontSize:12, color:C.textMuted, flexShrink:0, borderTop:`0.5px solid ${C.grayLight}` }}>
            <span>Who is on which project · click a bar to edit · drag empty space to pan · hold-drag + scroll to zoom</span>
            <span style={{ background:C.redBg, color:C.red, padding:"2px 8px", borderRadius:4, fontWeight:600 }}>● Today: {todayLabel}</span>
          </div>
        </div>
      )}

      {/* VIEW RENDER: OVERALL PROJECT GANTT */}
      {scheduleViewMode === "overall" && (() => {
        // Pre-compute coordinates for dependency connector lines
        const taskCoordinates: { [id: string]: { xStart: number, xEnd: number, y: number } } = {};
        let bodyHeight = 0;

        Object.entries(projectsGroup).forEach(([, group]) => {
          bodyHeight += 30;

          const activeTasks = group.tasks.filter(t => t.assigneeId !== null && t.assignee !== "Unassigned");
          activeTasks.forEach(task => {
            const sCol = getColFromDate(task.start);
            const lCol = getColDuration(task.start, task.end);
            const xStart = LW + sCol * CW;
            const xEnd = xStart + Math.max(26, lCol * CW);
            taskCoordinates[task.id] = { xStart, xEnd, y: bodyHeight + 19 };
            bodyHeight += ROW_HEIGHT;
          });

          const unassignedTasks = group.tasks.filter(t => t.assigneeId === null || t.assignee === "Unassigned");
          if (unassignedTasks.length > 0) {
            unassignedTasks.forEach(task => {
              const sCol = getColFromDate(task.start);
              const lCol = getColDuration(task.start, task.end);
              const xStart = LW + sCol * CW;
              const xEnd = xStart + Math.max(26, lCol * CW);
              taskCoordinates[task.id] = { xStart, xEnd, y: bodyHeight + 19 };
            });
            bodyHeight += ROW_HEIGHT;
          }
        });

        return (
          <div style={{ border:`0.5px solid ${C.grayLight}`, borderRadius:12, overflow:"hidden", background: C.white, display:"flex", flexDirection:"column" }}>
            <div ref={timelineScrollRef} style={{ overflow:"auto", maxHeight: GANTT_SCROLL_MAX_HEIGHT, flex: 1 }}>
              <div style={{ minWidth: LW + COLS * CW }}>
                {/* Header row — fixed while scrolling task rows vertically */}
                <div style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS * CW }}>
                <div style={{ ...stickyTimelineHeaderLeft(C.bgSecond), padding:"10px 14px", fontSize:11.2, fontWeight:600, color:C.textMuted }}>
                  Tasks
                    <div
                      role="separator"
                      aria-label="Resize task column width"
                      style={leftColResizeHandleStyle}
                      onMouseDown={startLeftColumnResize}
                      title="Drag to resize task column"
                    >
                      <div
                        style={{
                          width: 2,
                          height: "70%",
                          borderRadius: 2,
                          background: isResizingLeftCol ? C.blue : "#94A3B8",
                        }}
                      />
                    </div>
                  </div>
                  {Array.from({ length: COLS }).map((_, i) => {
                    const wx = getWeatherForCol(i);
                    const isTd = i === TODAY_COL;
                    const wkIdx = Math.floor(i / 7);
                    const isWeekStart = i % 7 === 0;
                    return (
                      <div key={i} style={{ width:CW, flexShrink:0, height:44, borderLeft:`0.5px solid ${C.grayLight}`, background: getWeatherStyleForCol(i), position:"sticky", top:0, zIndex:20 }}>
                        {isWeekStart && (
                          <span style={{ fontSize:9, color: wx && wx.risk !== "ok" ? (wx.risk === "danger" ? C.redDark : C.amber) : C.gray, fontWeight:600, whiteSpace:"nowrap", position:"absolute", top:3, left:"50%", transform:"translateX(-50%)" }}>
                            {weeks[wkIdx] || ""}
                          </span>
                        )}
                        {wx && wx.risk !== "ok" && <span style={{ fontSize:9, position:"absolute", top:16, left:"50%", transform:"translateX(-50%)" }} title={wx.desc}>{wx.icon}</span>}
                        <span style={{ fontSize:10, position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)", color: isTd ? C.red : C.textMuted, fontWeight: isTd ? 700 : 500 }}>{formatColDay(i)}</span>
                        {isTd && <div style={{ position:"absolute", top:0, bottom:0, left:"50%", marginLeft:-1, width:2, background:C.red, opacity:0.75, zIndex:1 }} />}
                      </div>
                    );
                  })}
                </div>

                <div style={{ position: "relative", minHeight: bodyHeight }}>
                {/* SVG connection layer */}
                <svg 
                  style={{ 
                    position: "absolute", 
                    top: 0, 
                    left: 0, 
                    width: LW + COLS * CW, 
                    height: bodyHeight, 
                    pointerEvents: "none", 
                    zIndex: 1 
                  }}
                >
                  <defs>
                    <marker 
                      id="arrow" 
                      viewBox="0 0 10 10" 
                      refX="6" 
                      refY="5" 
                      markerWidth="6" 
                      markerHeight="6" 
                      orient="auto"
                    >
                      <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill={C.purple} />
                    </marker>
                  </defs>
                  {Object.entries(taskCoordinates).map(([id, succCoord]) => {
                    const taskObj = displayTasks.find(t => t.id === id);
                    if (!taskObj) return null;
                    const deps = (taskObj.dependencies || "").split(",").map(d => d.trim()).filter(d => d && d !== "-");
                    return deps.map(predId => {
                      const predCoord = taskCoordinates[predId];
                      if (!predCoord) return null;
                      
                      const x1 = predCoord.xEnd;
                      const y1 = predCoord.y;
                      const x2 = succCoord.xStart;
                      const y2 = succCoord.y;
                      
                      // Calculate cubic bezier curves
                      const dx = x2 - x1;
                      const controlOffset = Math.max(25, Math.abs(dx) * 0.4);
                      const cp1x = x1 + controlOffset;
                      const cp1y = y1;
                      const cp2x = x2 - controlOffset;
                      const cp2y = y2;
                      
                      return (
                        <path 
                          key={`${predId}-${id}`}
                          d={`M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`}
                          fill="none"
                          stroke={C.purple}
                          strokeWidth="1.8"
                          strokeOpacity="0.85"
                          markerEnd="url(#arrow)"
                          style={{ transition: "all 0.1s ease" }}
                        />
                      );
                    });
                  })}
                </svg>

            {/* Project groups */}
            {Object.entries(projectsGroup).map(([projName, group]) => {
              const activeTasks = group.tasks.filter(t => t.assigneeId !== null && t.assignee !== "Unassigned");
              const unassignedTasks = group.tasks.filter(t => t.assigneeId === null || t.assignee === "Unassigned");
              const projectData = projects.find(p => p.name === projName);
              const pcEndCol = projectData?.pcEndDate ? getColFromDate(projectData.pcEndDate) : null;

              return (
                <div key={projName}>
                  {/* Project Section Separator with PC milestone marker */}
                  <div style={{ display:"flex", background:"#F8FAFC", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS*CW, minHeight:30, alignItems:"center" }}>
                    <div style={{ ...stickyLeft("#F8FAFC"), padding:"5px 14px", fontSize:11, fontWeight:700, color:C.blue, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:9, height:9, background:group.color, borderRadius:"50%", display:"inline-block", flexShrink:0 }} />
                      {projName.split(" —")[0]}
                      {projectData?.pcEndDate && (
                        <span style={{ fontSize:9.5, fontWeight:500, color:C.gray, marginLeft:4 }}>PC: {projectData.pcEndDate}</span>
                      )}
                    </div>
                    {Array.from({length:COLS}).map((_, i) => (
                      <div key={i} style={{ width:CW, flexShrink:0, height:30, borderLeft:`0.5px solid ${C.grayLight}`, background: getWeatherStyleForCol(i), position: "relative" }}>
                        {i === TODAY_COL && <div style={{ position:"absolute", top:0, bottom:0, left:0, width:1.5, background:C.red, opacity:0.4 }} />}
                        {i === pcEndCol && (
                          <div title={`PC Deadline: ${projectData?.pcEndDate}`} style={{ position:"absolute", top:0, bottom:0, left:"50%", marginLeft:-1, width:2, background: group.color, opacity:0.9, zIndex:5 }}>
                            <div style={{ position:"absolute", top:2, left:-3, width:0, height:0, borderLeft:"4px solid transparent", borderRight:"4px solid transparent", borderTop:`7px solid ${group.color}` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Sub-group 1: Assigned tasks (one row per task) */}
                  {activeTasks.map(task => {
                    const sCol = getColFromDate(task.start);
                    const lCol = getColDuration(task.start, task.end);
                    const isThisDragged = activeDrag && activeDrag.id === task.id;

                    let renderedStartCol = sCol;
                    let renderedDurationCol = lCol;

                    if (isThisDragged) {
                      if (activeDrag.type === "move") {
                        renderedStartCol = Math.max(0, sCol + dragDeltaCols);
                      } else {
                        renderedDurationCol = Math.max(1, lCol + dragDeltaCols);
                      }
                    }

                    const barColor = getTaskBarColor(task);
                    const done = isTaskDone(task);
                    const isDraft = isDraftTaskId(task.id, pendingDrafts);

                    return (
                      <div key={task.id} style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS*CW, minHeight:ROW_HEIGHT, alignItems:"center", position:"relative" }}>
                        
                        {/* Left Assignee info cell */}
                        <div style={{ ...stickyLeft(C.white), padding:"6px 12px 6px 28px", fontSize:12.5, color:C.textMuted, overflow:"hidden", display:"flex", flexDirection:"column", gap:2 }}>
                          <span style={{ fontSize: 12.5, color: C.text, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                            {done && <span style={{ color: C.greenDark, flexShrink: 0 }}>✓</span>}
                            <TaskNameWithId task={task} onClick={() => handleOpenEdit(task)} nameStyle={{ color: C.text }} />
                          </span>
                          <span style={{ fontSize: 9.5, color: C.gray, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            👷 {task.assignee} · {task.trade}
                          </span>
                        </div>

                        {/* Columns backgrounds */}
                        {Array.from({length:COLS}).map((_, i) => (
                          <div key={i} style={{ width:CW, flexShrink:0, height:ROW_HEIGHT, borderLeft:`0.5px solid ${C.grayLight}`, background: getWeatherStyleForCol(i), position:"relative" }}>
                            {i === TODAY_COL && <div style={{ position:"absolute", top:0, bottom:0, left:0, width:1.5, background:C.red, opacity:0.3 }} />}
                          </div>
                        ))}

                        {/* Staged-adjustment ghost (original position) + arrow */}
                        {adjustActive && adjustMovesById.has(task.id) && (
                          <AdjustmentGhost move={adjustMovesById.get(task.id)!} rowHeight={ROW_HEIGHT} />
                        )}

                        {/* Task visualization rendering */}
                          <div
                            data-no-pan="1"
                            style={{
                            position:"absolute",
                            left: LW + renderedStartCol * CW,
                            width: Math.max(26, renderedDurationCol * CW),
                            top: (ROW_HEIGHT - BAR_HEIGHT) / 2, height: BAR_HEIGHT,
                            background: barColor,
                            borderRadius:6,
                            display:"flex", alignItems:"center",
                            padding:"0 18px 0 8px", fontSize:11.5, fontWeight:600, color:C.white,
                            overflow:"hidden", whiteSpace:"nowrap",
                            opacity: task.status === "overdue" ? 0.85 : isThisDragged ? 0.85 : 1,
                            zIndex: isThisDragged ? 10 : 2,
                            cursor: activeDrag ? (activeDrag.id === task.id ? (activeDrag.type === "move" ? "grabbing" : "ew-resize") : "default") : "grab",
                            boxShadow: isThisDragged ? "0 4px 10px rgba(0,0,0,0.18)" : isDraft ? "0 0 0 2px rgba(184,115,22,0.55)" : "none",
                            border: isThisDragged ? "1px dashed rgba(255,255,255,0.6)" : isDraft ? "2px dashed rgba(255,255,255,0.9)" : "none",
                            transition: activeDrag ? "none" : "left 0.1s ease, width 0.1s ease",
                            userSelect: "none"
                          }}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            if (adjustActive) return;
                            e.preventDefault();
                            dragDidMoveRef.current = false;
                            setActiveDrag({
                              id: task.id,
                              type: "move",
                              startX: e.clientX,
                              startCol: sCol,
                              duration: lCol
                            });
                          }}
                          onClick={() => {
                            if (dragDidMoveRef.current) {
                              dragDidMoveRef.current = false;
                              return;
                            }
                            if (adjustActive) { setAdjustAnchorId(task.id); return; }
                            setSelectedTaskId(task.id);
                            handleOpenEdit(task);
                          }}
                          >
                            {done && <span style={{ marginRight: 4 }} title="Completed">✓</span>}
                            {taskHasWeatherRisk(task) && <span style={{ marginRight: 4 }} title="Task overlaps rain/storm forecast dates!">🌧️</span>}
                            <span style={{ fontSize: 9, opacity: 0.85, marginRight: 4, display: "inline-block" }}>
                              {task.assignee ? task.assignee.split(" ")[0] : "Anon"}:
                            </span>
                            {taskDisplayName(task)}
                            {task.percent_complete > 0 && ` (${task.percent_complete}%)`}
                            {task.status === "conflict" && <span style={{ width:6, height:6, background:C.red, borderRadius:"50%", border:`1px solid ${C.white}`, position:"absolute", top: 2, right: 18 }} />}
                            {task.status === "fragile"  && <span style={{ width:6, height:6, background:C.amber, borderRadius:"50%", border:`1px solid ${C.white}`, position:"absolute", top: 2, right: 18 }} />}

                            <div 
                              style={{
                                position: "absolute", right: 0, top: 0, bottom: 0, width: 12, cursor: "ew-resize",
                                background: "rgba(255,255,255,0.2)", borderLeft: "0.5px solid rgba(255,255,255,0.25)",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: "bold", userSelect: "none"
                              }}
                              onMouseDown={(e) => {
                                if (adjustActive) return;
                                e.stopPropagation();
                                e.preventDefault();
                                dragDidMoveRef.current = false;
                                setActiveDrag({
                                  id: task.id,
                                  type: "resize",
                                  startX: e.clientX,
                                  startCol: sCol,
                                  duration: lCol
                                });
                              }}
                              title="Drag to adjust duration"
                            >
                              ⋮
                            </div>
                          </div>

                        {isThisDragged && (
                          <div style={{
                            position: "absolute", left: LW + renderedStartCol * CW, top: -18,
                            background: "#0F172A", color: "#FFFFFF", padding: "2px 8px", borderRadius: 6,
                            fontSize: 9.5, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 8px rgba(0,0,0,0.2)", whiteSpace: "nowrap"
                          }}>
                            {activeDrag.type === "move" 
                              ? `📅 Shift: ${getDateFromCol(renderedStartCol)} to ${getDateFromCol(renderedStartCol + renderedDurationCol - 1)}`
                              : `📏 Extend: ${renderedDurationCol} Working Days (${getDateFromCol(renderedStartCol + renderedDurationCol - 1)})`
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Sub-group 2: Unassigned Tasks Row (Grouped at bottom of corresponding project) */}
                  {unassignedTasks.length > 0 && (
                    <div style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS*CW, minHeight:ROW_HEIGHT, alignItems:"center", position:"relative", background: "#FAFBFD" }}>
                      <div style={{ ...stickyLeft("#FAFBFD"), padding:"6px 12px 6px 28px", fontSize:12, color:C.gray, fontStyle: "italic" }}>
                        <span>📋 Unassigned Backlog</span>
                        <div style={{ fontSize: 9, color: C.gray, fontStyle: "normal" }}>({unassignedTasks.length} tasks)</div>
                      </div>

                      {Array.from({length:COLS}).map((_, i) => (
                        <div key={i} style={{ width:CW, flexShrink:0, height:ROW_HEIGHT, borderLeft:`0.5px solid ${C.grayLight}`, background: getWeatherStyleForCol(i) }} />
                      ))}

                      {unassignedTasks.map(task => {
                        const sCol = getColFromDate(task.start);
                        const lCol = getColDuration(task.start, task.end);

                        return (
                          <div
                            key={task.id}
                            data-no-pan="1"
                            onClick={() => handleOpenEdit(task)}
                            style={{
                              position:"absolute",
                              left: LW + sCol * CW,
                              width: Math.max(26, lCol * CW),
                              top: (ROW_HEIGHT - BAR_HEIGHT) / 2, height: BAR_HEIGHT,
                              background: "#94A3B8",
                              border: "1px dashed #64748B",
                              borderRadius:6,
                              display:"flex", alignItems:"center",
                              padding:"0 8px", fontSize:11.5, fontWeight:600, color:C.white,
                              overflow:"hidden", whiteSpace:"nowrap",
                              zIndex: 3,
                              cursor: "pointer",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                            }}
                            title={`Click to assign resource: ${task.name}`}
                          >
                            {taskHasWeatherRisk(task) && <span style={{ marginRight: 4 }} title="Task overlaps rain/storm forecast dates!">🌧️</span>}
                            <span style={{ fontStyle: "italic", marginRight: 4 }}>Unassigned:</span>
                            {task.name}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
                </div>
              </div>
            </div>

            {/* Table Footer — stays below the scroll area */}
            <div style={{ background:C.bgSecond, padding:"8px 14px", display:"flex", justifyContent:"space-between", fontSize:12, color: C.textMuted, flexShrink: 0, borderTop:`0.5px solid ${C.grayLight}` }}>
              <span>Drag a bar to reschedule · drag empty space to pan · hold-drag + scroll (or Ctrl+scroll) to zoom</span>
              <span
                style={{ background:C.redBg, color:C.red, padding:"2px 8px", borderRadius:4, fontWeight:600 }}
                title="Red line marks today's date on your device calendar."
              >
                ● Today: {todayLabel}
              </span>
            </div>
          </div>
        );
      })()}

      {/* VIEW RENDER: RESOURCE SUBCONTRACTOR GANTT */}
      {scheduleViewMode === "resource" && (
        <div style={{ border:`0.5px solid ${C.grayLight}`, borderRadius:12, overflow:"hidden", background: C.white, display:"flex", flexDirection:"column" }}>
          {/* Project colour legend */}
          <div style={{ padding: "8px 14px", borderBottom: `0.5px solid ${C.grayLight}`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", background: "#F8FAFC" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em" }}>Project colour key</span>
            {projects.map(p => (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: getProjectColor(p.name), display: "inline-block", flexShrink: 0 }} />
                <span style={{ color: C.text, fontWeight: 500 }}>{p.name.split(" —")[0]}</span>
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, marginLeft: "auto" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.red, display: "inline-block" }} />
              <span style={{ color: C.redDark, fontWeight: 600 }}>Conflict</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.amber, display: "inline-block" }} />
              <span style={{ color: C.amber, fontWeight: 600 }}>Fragile</span>
            </span>
          </div>
          <div ref={timelineScrollRef} style={{ overflow:"auto", maxHeight: GANTT_SCROLL_MAX_HEIGHT, flex: 1 }}>
            <div style={{ minWidth: LW + COLS * CW }}>
              {/* Header row — fixed while scrolling resource rows vertically */}
              <div style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS * CW }}>
                <div style={{ ...stickyTimelineHeaderLeft(C.bgSecond), padding:"10px 14px", fontSize:11.2, fontWeight:600, color:C.textMuted }}>
                  Resources
                  <div
                    role="separator"
                    aria-label="Resize task column width"
                    style={leftColResizeHandleStyle}
                    onMouseDown={startLeftColumnResize}
                    title="Drag to resize task column"
                  >
                    <div
                      style={{
                        width: 2,
                        height: "70%",
                        borderRadius: 2,
                        background: isResizingLeftCol ? C.blue : "#94A3B8",
                      }}
                    />
                  </div>
                </div>
                {Array.from({ length: COLS }).map((_, i) => {
                  const wx = getWeatherForCol(i);
                  const isTd = i === TODAY_COL;
                  const wkIdx = Math.floor(i / 7);
                  const isWeekStart = i % 7 === 0;
                  return (
                    <div key={i} style={{ width:CW, flexShrink:0, height:44, borderLeft:`0.5px solid ${C.grayLight}`, background: getWeatherStyleForCol(i), position:"sticky", top:0, zIndex:20 }}>
                      {isWeekStart && (
                        <span style={{ fontSize:9, color: wx && wx.risk !== "ok" ? (wx.risk === "danger" ? C.redDark : C.amber) : C.gray, fontWeight:600, whiteSpace:"nowrap", position:"absolute", top:3, left:"50%", transform:"translateX(-50%)" }}>
                          {weeks[wkIdx] || ""}
                        </span>
                      )}
                      {wx && wx.risk !== "ok" && <span style={{ fontSize:9, position:"absolute", top:16, left:"50%", transform:"translateX(-50%)" }} title={wx.desc}>{wx.icon}</span>}
                      <span style={{ fontSize:10, position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)", color: isTd ? C.red : C.textMuted, fontWeight: isTd ? 700 : 500 }}>{formatColDay(i)}</span>
                      {isTd && <div style={{ position:"absolute", top:0, bottom:0, left:"50%", marginLeft:-1, width:2, background:C.red, opacity:0.75, zIndex:1 }} />}
                    </div>
                  );
                })}
              </div>

            {/* Loop over active contractor personnel */}
            {resources.map(r => {
              const resTasks = filteredTasks.filter(t => t.assigneeId === r.id);
              const utilColor = r.util > 100 ? C.red : r.util > 80 ? C.amber : C.green;

              return (
                <div key={r.id} style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS*CW, minHeight:ROW_HEIGHT + 8, alignItems:"center", position:"relative" }}>
                  
                  {/* Resource Identity Block */}
                  <div style={{ ...stickyLeft("#FDFDFD"), padding:"6px 12px", fontSize:11.5, borderRight:`0.5px solid #F1F5F9`, display:"flex", flexDirection:"column", justifyContent:"center" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ 
                        display: "inline-flex", width: 18, height: 18, borderRadius: "50%", background: C.navy, color: C.white, 
                        fontWeight: 700, fontSize: 8.5, alignItems: "center", justifyContent: "center" 
                      }}>
                        {r.initials || "👷"}
                      </span>
                      <strong style={{ color: C.text, fontSize: 12 }}>{r.name}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontSize: 9.5, color: C.gray, fontWeight: 500 }}>🔨 {r.trade}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, background: `${utilColor}12`, color: utilColor, padding: "1px 5px", borderRadius: 4 }}>
                        {r.util}% cap
                      </span>
                    </div>
                  </div>

                  {/* Columns backgrounds */}
                  {Array.from({length:COLS}).map((_, i) => (
                    <div key={i} style={{ width:CW, flexShrink:0, height:ROW_HEIGHT + 8, borderLeft:`0.5px solid ${C.grayLight}`, background: getWeatherStyleForCol(i), position: "relative" }}>
                      {i === TODAY_COL && <div style={{ position:"absolute", top:0, bottom:0, left:0, width:1.5, background:C.red, opacity:0.2 }} />}
                    </div>
                  ))}

                  {/* Render task timeline bars assigned to this contractor */}
                  {resTasks.map(task => {
                    const sCol = getColFromDate(task.start);
                    const lCol = getColDuration(task.start, task.end);
                    const isThisDragged = activeDrag && activeDrag.id === task.id;

                    let renderedStartCol = sCol;
                    let renderedDurationCol = lCol;

                    if (isThisDragged) {
                      if (activeDrag.type === "move") {
                        renderedStartCol = Math.max(0, sCol + dragDeltaCols);
                      } else {
                        renderedDurationCol = Math.max(1, lCol + dragDeltaCols);
                      }
                    }

                    const barColor = getResourceViewBarColor(task);
                    const done = isTaskDone(task);
                    const isDraft = isDraftTaskId(task.id, pendingDrafts);
                    const projShortName = (task.project || "").split(" —")[0];
                    const adjMove = adjustActive ? adjustMovesById.get(task.id) : undefined;

                    return (
                      <React.Fragment key={task.id}>
                      {adjMove && <AdjustmentGhost move={adjMove} rowHeight={ROW_HEIGHT + 8} />}
                      <div
                        data-no-pan="1"
                        style={{
                          position:"absolute",
                          left: LW + renderedStartCol * CW,
                          width: Math.max(26, renderedDurationCol * CW),
                          top: (ROW_HEIGHT + 8 - BAR_HEIGHT) / 2, height: BAR_HEIGHT,
                          background: barColor,
                          borderRadius:6,
                          display:"flex", alignItems:"center",
                          padding:"0 16px 0 8px", fontSize:11, fontWeight:600, color:C.white,
                          overflow:"hidden", whiteSpace:"nowrap",
                          opacity: isThisDragged ? 0.85 : 1,
                          zIndex: isThisDragged ? 10 : 2,
                          cursor: activeDrag ? (activeDrag.id === task.id ? (activeDrag.type === "move" ? "grabbing" : "ew-resize") : "default") : "grab",
                          boxShadow: isThisDragged ? "0 4px 10px rgba(0,0,0,0.18)" : isDraft ? "0 0 0 2px rgba(184,115,22,0.55)" : task.status === "conflict" ? "0 0 0 2px rgba(224,74,74,0.5)" : "none",
                          border: isThisDragged ? "1px dashed rgba(255,255,255,0.6)" : isDraft ? "2px dashed rgba(255,255,255,0.9)" : "none",
                          transition: activeDrag ? "none" : "left 0.1s ease, width 0.1s ease",
                          userSelect: "none"
                        }}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          if (adjustActive) return;
                          e.preventDefault();
                          dragDidMoveRef.current = false;
                          setActiveDrag({
                            id: task.id,
                            type: "move",
                            startX: e.clientX,
                            startCol: sCol,
                            duration: lCol
                          });
                        }}
                        onClick={() => {
                          if (dragDidMoveRef.current) {
                            dragDidMoveRef.current = false;
                            return;
                          }
                          if (adjustActive) { setAdjustAnchorId(task.id); return; }
                          setSelectedTaskId(task.id);
                          handleOpenEdit(task);
                        }}
                      >
                        {done && <span style={{ marginRight: 3 }} title="Completed">✓</span>}
                        {taskHasWeatherRisk(task) && <span style={{ marginRight: 3 }} title="Task overlaps rain/storm forecast dates!">🌧️</span>}
                        {task.status === "conflict" && <span style={{ marginRight: 3 }}>⚠</span>}
                        <span style={{ fontSize: 9, opacity: 0.8, marginRight: 4 }}>{projShortName}:</span>
                        {taskDisplayName(task)}
                        {task.percent_complete > 0 && ` (${task.percent_complete}%)`}

                        {/* Drag Resize Handle */}
                        <div
                          style={{
                            position: "absolute", right: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize",
                            background: "rgba(255,255,255,0.15)", borderLeft: "0.5px solid rgba(255,255,255,0.25)",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, userSelect: "none"
                          }}
                          onMouseDown={(e) => {
                            if (adjustActive) return;
                            e.stopPropagation();
                            e.preventDefault();
                            dragDidMoveRef.current = false;
                            setActiveDrag({
                              id: task.id,
                              type: "resize",
                              startX: e.clientX,
                              startCol: sCol,
                              duration: lCol
                            });
                          }}
                        >
                          ⋮
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}

            {/* Unassigned / Backlog tasks row grouped at the bottom to allow reassigning */}
            {(() => {
              const unassignedBacklog = filteredTasks.filter(t => t.assigneeId === null || t.assignee === "Unassigned");
              if (unassignedBacklog.length === 0) return null;
              return (
                <div style={{ display:"flex", borderBottom:`0.5px solid ${C.grayLight}`, minWidth: LW + COLS*CW, minHeight:ROW_HEIGHT + 8, alignItems:"center", position:"relative", background: "#F1F5F9" }}>
                  <div style={{ ...stickyLeft("#F1F5F9"), padding:"6px 12px", fontSize:11.5, display:"flex", flexDirection:"column", justifyContent:"center" }}>
                    <strong style={{ color: C.gray, fontSize: 11.5 }}>👤 Unassigned Backlog</strong>
                    <span style={{ fontSize: 9.5, color: C.gray }}>({unassignedBacklog.length} Backlog works)</span>
                  </div>

                  {Array.from({length:COLS}).map((_, i) => (
                    <div key={i} style={{ width:CW, flexShrink:0, height:ROW_HEIGHT + 8, borderLeft:`0.5px solid ${C.grayLight}`, background: weatherRiskCols.includes(i) ? "rgba(184,115,22,0.02)" : "transparent" }} />
                  ))}

                  {unassignedBacklog.map(task => {
                    const sCol = getColFromDate(task.start);
                    const lCol = getColDuration(task.start, task.end);

                    return (
                      <div
                        key={task.id}
                        data-no-pan="1"
                        onClick={() => handleOpenEdit(task)}
                        style={{
                          position:"absolute",
                          left: LW + sCol * CW,
                          width: Math.max(26, lCol * CW),
                          top: (ROW_HEIGHT + 8 - BAR_HEIGHT) / 2, height: BAR_HEIGHT,
                          background: "#94A3B8",
                          border: "1px dashed #64748B",
                          borderRadius:6,
                          display:"flex", alignItems:"center",
                          padding:"0 8px", fontSize:11.5, fontWeight:600, color:C.white,
                          overflow:"hidden", whiteSpace:"nowrap",
                          zIndex: 3,
                          cursor: "pointer",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                        }}
                        title={`Click to assign resource: ${task.name}`}
                      >
                        <span style={{ fontStyle: "italic", marginRight: 4 }}>Unassigned:</span>
                        {task.name}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </div>
          </div>

          {/* Table Footer — stays below the scroll area */}
          <div style={{ background:C.bgSecond, padding:"8px 14px", display:"flex", justifyContent:"space-between", fontSize:12, color: C.textMuted, flexShrink: 0, borderTop:`0.5px solid ${C.grayLight}` }}>
            <span>Manpower view — drag a bar to reschedule · drag empty space to pan · hold-drag + scroll to zoom</span>
            <span
              style={{ background:C.redBg, color:C.red, padding:"2px 8px", borderRadius:4, fontWeight:600 }}
              title="Red line marks today's date on your device calendar."
            >
              ● Today: {todayLabel}
            </span>
          </div>
        </div>
      )}

      {/* VIEW RENDER: KANBAN TASK STATUS BOARD */}
      {scheduleViewMode === "kanban" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:14, marginVertical: 8 }}>
          
          {/* COLUMN 1: WORK BACKLOG / UNASSIGNED */}
          <div style={{ background: "#F1F5F9", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10, alignSelf: "start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #CBD5E1", paddingBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: C.gray, display: "flex", alignItems: "center", gap: 6 }}>
                📁 Backlog & Backlog Tasks
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, background: "#E2E8F0", padding: "1px 6px", borderRadius: 10, color: C.gray }}>
                {filteredTasks.filter(t => t.assigneeId === null || t.assignee === "Unassigned").length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "500px", overflowY: "auto" }}>
              {filteredTasks.filter(t => t.assigneeId === null || t.assignee === "Unassigned").map(task => (
                <div key={task.id} style={{ background: C.white, border: "0.5px solid #CBD5E1", borderRadius: 10, padding: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, color: C.text, minWidth: 0, flex: 1 }}>
                      <TaskNameWithId task={task} onClick={() => handleOpenEdit(task)} nameStyle={{ fontSize: 12.5 }} idStyle={{ fontSize: 11 }} />
                    </span>
                    <span style={{ fontSize:9, background: C.bgSecond, padding: "1px 4.5px", borderRadius: 4, fontWeight: 700, color: C.textMuted, flexShrink: 0 }}>BACKLOG</span>
                  </div>
                  <div style={{ fontSize:10, color: C.gray, marginBottom: 8 }}>
                    📅 {task.start} to {task.end} ({getColDuration(task.start, task.end)}d)
                  </div>
                  
                  {/* Reassign Selector */}
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "0.5px solid #F1F5F9" }}>
                    <label style={{ display: "block", fontSize: 9, color: C.gray, marginBottom: 2 }}>Assign professional Subcontractor:</label>
                    <select 
                      value="" 
                      onChange={(e) => handleReassign(task.id, e.target.value)}
                      style={{ width: "100%", padding: "4px", fontSize: 11, borderRadius: 6, border: `0.5px solid ${C.grayLight}`, background: "#FFF" }}
                    >
                      <option value="">-- Assign Partner --</option>
                      {resources.map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.trade})</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {filteredTasks.filter(t => t.assigneeId === null || t.assignee === "Unassigned").length === 0 && (
                <div style={{ padding: "20px 10px", textAlign: "center", color: C.gray, fontSize: 11.5, fontStyle: "italic" }}>No unassigned backlog items</div>
              )}
            </div>
          </div>

          {/* COLUMN 2: PLANNED / SCHEDULED (0% progression) */}
          <div style={{ background: "#FEF3C72A", border: "1px solid #FEF3C7", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10, alignSelf: "start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2.5px solid ${C.amber}`, paddingBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: C.amber, display: "flex", alignItems: "center", gap: 6 }}>
                ⏳ Planned & Scheduled
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, background: C.amberBg, padding: "1px 6px", borderRadius: 10, color: C.amber }}>
                {filteredTasks.filter(t => t.assigneeId !== null && t.assignee !== "Unassigned" && (t.percent_complete || 0) === 0).length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "500px", overflowY: "auto" }}>
              {filteredTasks.filter(t => t.assigneeId !== null && t.assignee !== "Unassigned" && (t.percent_complete || 0) === 0).map(task => {
                const isConf = task.status === "conflict";
                return (
                  <div key={task.id} style={{ background: C.white, border: `0.5px solid ${isConf ? C.red : C.grayLight}`, borderRadius: 10, padding: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, color: C.navy, minWidth: 0, flex: 1 }}>
                        <TaskNameWithId task={task} onClick={() => handleOpenEdit(task)} nameStyle={{ fontSize: 12.5, color: C.navy }} idStyle={{ fontSize: 11 }} />
                      </span>
                      {isConf ? (
                        <span style={{ fontSize:9, background: C.redBg, padding: "1px 4.5px", borderRadius: 4, fontWeight: 700, color: C.red, flexShrink: 0 }}>CONFLICT</span>
                      ) : (
                        <span style={{ fontSize:9, background: C.amberBg, padding: "1px 4.5px", borderRadius: 4, fontWeight: 700, color: C.amber, flexShrink: 0 }}>PLANNED</span>
                      )}
                    </div>
                    <div style={{ fontSize:10, color: C.gray, marginBottom: 4 }}>
                      🚜 <strong>Sub:</strong> {task.assignee} ({task.trade})
                    </div>
                    <div style={{ fontSize:10, color: C.gray, marginBottom: 8 }}>
                      📅 {task.start} to {task.end} ({getColDuration(task.start, task.end)}d)
                    </div>

                    {/* Progress Slider Selection */}
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: "0.5px solid #F1F5F9" }}>
                      <label style={{ display: "block", fontSize: 9, color: C.gray, marginBottom: 2 }}>Kickoff progression state:</label>
                      <select 
                        value={task.percent_complete || 0} 
                        onChange={(e) => handlePercentChange(task.id, Number(e.target.value))}
                        style={{ width: "100%", padding: "4px", fontSize: 11, borderRadius: 6, border: `0.5px solid ${C.grayLight}`, background: "#FFF" }}
                      >
                        <option value="0">0% Not Started</option>
                        <option value="25">25% Commenced</option>
                        <option value="50">50% Halfway</option>
                        <option value="75">75% Handover Phase</option>
                        <option value="100">100% Complete</option>
                      </select>
                    </div>
                  </div>
                );
              })}
              {filteredTasks.filter(t => t.assigneeId !== null && t.assignee !== "Unassigned" && (t.percent_complete || 0) === 0).length === 0 && (
                <div style={{ padding: "20px 10px", textAlign: "center", color: C.gray, fontSize: 11.5, fontStyle: "italic" }}>No pending scheduled tasks</div>
              )}
            </div>
          </div>

          {/* COLUMN 3: UNDERWAY / ACTIVE PROGRESSION */}
          <div style={{ background: "#E6F0FB22", border: `1px solid ${C.blueMid}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10, alignSelf: "start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2.5px solid ${C.blueMid}`, paddingBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: C.blue, display: "flex", alignItems: "center", gap: 6 }}>
                ⚙️ In Progress / Underway
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, background: C.blueLight, padding: "1px 6px", borderRadius: 10, color: C.blue }}>
                {filteredTasks.filter(t => t.assigneeId !== null && t.assignee !== "Unassigned" && (t.percent_complete || 0) > 0 && (t.percent_complete || 0) < 100).length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "500px", overflowY: "auto" }}>
              {filteredTasks.filter(t => t.assigneeId !== null && t.assignee !== "Unassigned" && (t.percent_complete || 0) > 0 && (t.percent_complete || 0) < 100).map(task => {
                const isWx = task.status === "weather";
                return (
                  <div key={task.id} style={{ background: C.white, border: `0.5px solid ${isWx ? C.amber : C.blueLight}`, borderRadius: 10, padding: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, color: C.navy, minWidth: 0, flex: 1 }}>
                        <TaskNameWithId task={task} onClick={() => handleOpenEdit(task)} nameStyle={{ fontSize: 12.5, color: C.navy }} idStyle={{ fontSize: 11 }} />
                      </span>
                      {isWx ? (
                        <span style={{ fontSize:9, background: C.amberBg, padding: "1px 4.5px", borderRadius: 4, fontWeight: 700, color: C.amber, flexShrink: 0 }}>🌧 WEATHER BLOCK</span>
                      ) : (
                        <span style={{ fontSize:9, background: C.blueLight, padding: "1px 4.5px", borderRadius: 4, fontWeight: 700, color: C.blue, flexShrink: 0 }}>{task.percent_complete}% COMPLETE</span>
                      )}
                    </div>
                    <div style={{ fontSize:10, color: C.gray, marginBottom: 4 }}>
                      🚜 <strong>Sub:</strong> {task.assignee} ({task.trade})
                    </div>
                    <div style={{ fontSize:10, color: C.gray, marginBottom: 8 }}>
                      📅 {task.start} to {task.end} ({getColDuration(task.start, task.end)}d)
                    </div>

                    {/* Progress Slider Selection */}
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: "0.5px solid #F1F5F9" }}>
                      <label style={{ display: "block", fontSize: 9, color: C.gray, marginBottom: 2 }}>Update complete margin:</label>
                      <select 
                        value={task.percent_complete || 50} 
                        onChange={(e) => handlePercentChange(task.id, Number(e.target.value))}
                        style={{ width: "100%", padding: "4px", fontSize: 11, borderRadius: 6, border: `0.5px solid ${C.grayLight}`, background: "#FFF" }}
                      >
                        <option value="25">25% Commenced</option>
                        <option value="50">50% Halfway</option>
                        <option value="75">75% Handover Phase</option>
                        <option value="100">100% Mark Handed Over</option>
                      </select>
                    </div>
                  </div>
                );
              })}
              {filteredTasks.filter(t => t.assigneeId !== null && t.assignee !== "Unassigned" && (t.percent_complete || 0) > 0 && (t.percent_complete || 0) < 100).length === 0 && (
                <div style={{ padding: "20px 10px", textAlign: "center", color: C.gray, fontSize: 11.5, fontStyle: "italic" }}>No tasks in progress currently</div>
              )}
            </div>
          </div>

          {/* COLUMN 4: COMPLETED / SIGNED OFF */}
          <div style={{ background: "#ECFDF52A", border: `1px solid ${C.green}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10, alignSelf: "start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2.5px solid ${C.green}`, paddingBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: C.greenDark, display: "flex", alignItems: "center", gap: 6 }}>
                ✓ Completed / Signed Off
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, background: C.greenBg, padding: "1px 6px", borderRadius: 10, color: C.greenDark }}>
                {filteredTasks.filter(t => t.percent_complete === 100).length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "500px", overflowY: "auto" }}>
              {filteredTasks.filter(t => t.percent_complete === 100).map(task => (
                <div key={task.id} style={{ background: C.white, border: `0.5px solid ${C.green}`, borderRadius: 10, padding: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, color: C.text, minWidth: 0, flex: 1 }}>
                      <TaskNameWithId task={task} onClick={() => handleOpenEdit(task)} nameStyle={{ fontSize: 12.5 }} idStyle={{ fontSize: 11 }} />
                    </span>
                    <span style={{ fontSize:9, background: C.greenBg, padding: "1px 4.5px", borderRadius: 4, fontWeight: 700, color: C.greenDark, flexShrink: 0 }}>HANDED OVER</span>
                  </div>
                  <div style={{ fontSize:10, color: C.gray, marginBottom: 4 }}>
                    👷 <strong>Sub:</strong> {task.assignee} ({task.trade})
                  </div>
                  <div style={{ fontSize:10, color: C.gray, marginBottom: 8 }}>
                    📅 {task.start} to {task.end} (Took {getColDuration(task.start, task.end)} days)
                  </div>

                  {/* Reopen Slider */}
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "0.5px solid #F1F5F9" }}>
                    <label style={{ display: "block", fontSize: 9, color: C.gray, marginBottom: 2 }}>Progression Status Reset:</label>
                    <select 
                      value={100} 
                      onChange={(e) => handlePercentChange(task.id, Number(e.target.value))}
                      style={{ width: "100%", padding: "4px", fontSize: 11, borderRadius: 6, border: `0.5px solid ${C.grayLight}`, background: "#FFF" }}
                    >
                      <option value="100">100% Signed Off</option>
                      <option value="75">Reopen: 75% complete</option>
                      <option value="50">Reopen: 50% complete</option>
                      <option value="0">Reset to 0% Not Started</option>
                    </select>
                  </div>
                </div>
              ))}
              {filteredTasks.filter(t => t.percent_complete === 100).length === 0 && (
                <div style={{ padding: "20px 10px", textAlign: "center", color: C.gray, fontSize: 11.5, fontStyle: "italic" }}>No completed tasks signed off yet</div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* DETAILED TASK DRAWER / DIALOG */}
      {showAddModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(15,23,42,0.4)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:620, maxWidth:"95vw", background:C.white, borderRadius:12, boxShadow:"0 20px 25px -5px rgba(0,0,0,0.15)", overflow:"hidden", display:"flex", flexDirection:"column" }}>
            
            {/* Modal Header */}
            <div style={{ background: C.navy, color:C.white, padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:600, fontSize:13 }}>
                {editingTask ? `✏️ Edit Programmed Task: ${editingTask.id}` : "➕ Register New Programme Task"}
              </span>
              <button 
                onClick={() => setShowAddModal(false)}
                style={{ background:"transparent", border:"none", color:C.white, fontSize:15, cursor:"pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveForm} style={{ padding:18, display:"flex", flexDirection:"column", gap:12, overflowY:"auto", maxHeight:"80vh" }}>
              
              {/* Project select */}
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.gray, marginBottom:4 }}>PROJECT SITE</label>
                <select 
                  value={formProject}
                  onChange={(e) => setFormProject(e.target.value)}
                  style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, fontSize:12 }}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Task name */}
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.gray, marginBottom:4 }}>TASK NAME</label>
                <input 
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Scaffolding erection"
                  style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, fontSize:12 }}
                />
              </div>

              {/* Schedule Dates */}
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.gray, marginBottom:4 }}>START DATE</label>
                  <input 
                    type="date"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, fontSize:12 }}
                  />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.gray, marginBottom:4 }}>END DATE</label>
                  <input 
                    type="date"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, fontSize:12 }}
                  />
                </div>
              </div>

              {/* Resource Assignments */}
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.gray, marginBottom:4 }}>ASSIGNEE PERSONNEL</label>
                  <select 
                    value={formAssigneeId}
                    onChange={(e) => setFormAssigneeId(e.target.value)}
                    style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, fontSize:12 }}
                  >
                    <option value="">-- Unassigned (Backlog) --</option>
                    {resources.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.trade} · {r.state})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex:1 }}>
                  <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.gray, marginBottom:4 }}>
                    <LabelWithInfo
                      label="TRADE DOMAIN"
                      title="Trade domain"
                      body={"Trade or role required for this task (from Master Data).\n\nUsed for conflict detection and rate lookup when no assignee is selected."}
                    />
                  </label>
                  <select
                    value={formTrade}
                    onChange={(e) => setFormTrade(e.target.value)}
                    style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, fontSize:12 }}
                  >
                    {tradeOptions.length === 0 && (
                      <option value={formTrade}>{formTrade || "Labour"}</option>
                    )}
                    {tradeOptions.map((label) => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                    {formTrade && !tradeOptions.includes(formTrade) && (
                      <option value={formTrade}>{formTrade}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Advanced options accordion */}
              <button
                type="button"
                onClick={() => setShowTaskAdvanced(v => !v)}
                style={{
                  width:"100%", background:"#F8FAFC", border:`0.5px solid ${C.grayLight}`,
                  borderRadius:8, padding:"8px 12px", fontSize:11.5, color:C.gray,
                  cursor:"pointer", textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center"
                }}
              >
                <span>Advanced options (dependencies, lag, rate override)</span>
                <span>{showTaskAdvanced ? "▲" : "▼"}</span>
              </button>

              {showTaskAdvanced && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {/* Dependency Connection */}
                  <div style={{ background:C.blueLight, padding:"10px 12px", borderRadius:8, border:`0.5px solid ${C.blueMid}` }}>
                    <div style={{ fontWeight:600, fontSize:11.5, color:C.blue, marginBottom:6, display:"inline-flex", alignItems:"center" }}>
                      <LabelWithInfo
                        label="Dependency Linkage"
                        title="Dependency Linkage (FS / SS)"
                        body={"FS (Finish-to-Start): this task starts after the predecessor finishes (+ lag).\n\nSS (Start-to-Start): this task starts when the predecessor starts (+ lag).\n\nLag = working days to wait after the FS/SS rule before this task may start."}
                      />
                    </div>
                    <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
                      <div style={{ flex:2 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:600, color:C.text, marginBottom:4 }}>Predecessor task</label>
                        <select
                          value={formDependencies.split(",")[0].trim()}
                          onChange={(e) => setFormDependencies(e.target.value)}
                          style={{ width:"100%", padding:"5px 8px", borderRadius:6, border:`0.5px solid ${C.blueMid}`, fontSize:12 }}
                        >
                          <option value="">— None —</option>
                          {predecessorOptions.map((t) => (
                            <option key={t.id} value={t.id}>{t.id} — {t.name}</option>
                          ))}
                          {formDependencies && !predecessorOptions.some((t) => t.id === formDependencies.split(",")[0].trim()) && (
                            <option value={formDependencies.split(",")[0].trim()}>{formDependencies.split(",")[0].trim()} (other project)</option>
                          )}
                        </select>
                      </div>
                      <div style={{ flex:1 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:600, color:C.text, marginBottom:4 }}>Type</label>
                        <select
                          value={formDepType}
                          onChange={(e) => setFormDepType(e.target.value)}
                          style={{ width:"100%", padding:"5px 6px", borderRadius:6, border:`0.5px solid ${C.blueMid}`, fontSize:11.5 }}
                        >
                          <option value="FS">Finish-to-Start</option>
                          <option value="SS">Start-to-Start</option>
                        </select>
                      </div>
                      <div style={{ flex:1 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:600, color:C.text, marginBottom:4 }}>
                          <LabelWithInfo label="Lag (days)" title="Lag (Working Days)" body={"Working days to wait after the FS/SS rule before this task may start."} />
                        </label>
                        <input
                          type="number" min="0" value={formLagDays}
                          onChange={(e) => setFormLagDays(Number(e.target.value) || 0)}
                          placeholder="0"
                          style={{ width:"100%", padding:"5px 8px", borderRadius:6, border:`0.5px solid ${C.blueMid}`, fontSize:12 }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rate override */}
                  <div style={{ border:`0.5px solid ${C.grayLight}`, borderRadius:8, padding:"10px 12px", background:"#FAFAFA" }}>
                    <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.gray, marginBottom:4 }}>DEFAULT ASSIGNMENT RATE</label>
                    <input
                      type="text" readOnly disabled
                      value={formAssigneeId ? defaultRateLabel : "Select assignee to view rate"}
                      style={{ width:"100%", padding:"6px 8px", borderRadius:6, border:`0.5px solid ${C.grayLight}`, fontSize:12, background:"#F1F5F9", color: formAssigneeId ? C.text : C.gray, marginBottom:10 }}
                    />
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                      <input type="checkbox" id="cost-override-toggle" checked={formCostOverrideActive} onChange={(e) => setFormCostOverrideActive(e.target.checked)} disabled={!formAssigneeId} />
                      <label htmlFor="cost-override-toggle" style={{ fontSize:11.5, fontWeight:600, color:C.text, cursor: formAssigneeId ? "pointer" : "not-allowed" }}>Override rate for this task</label>
                    </div>
                    {formCostOverrideActive && (
                      <div style={{ display:"flex", gap:10, marginTop:6 }}>
                        <div style={{ flex:1 }}>
                          <label style={{ display:"block", fontSize:10, color:C.gray, marginBottom:2 }}>Rate type</label>
                          <select value={formCostOverrideType} onChange={(e) => setFormCostOverrideType(e.target.value)} style={{ width:"100%", padding:"4px 6px", borderRadius:4, border:`0.5px solid ${C.grayLight}`, fontSize:11 }}>
                            <option value="hourly">Hourly (A$/hr)</option>
                            <option value="daily">Daily (A$/day)</option>
                            <option value="lump_sum">Lump sum (A$ total)</option>
                          </select>
                        </div>
                        <div style={{ flex:1 }}>
                          <label style={{ display:"block", fontSize:10, color:C.gray, marginBottom:2 }}>Amount (A$)</label>
                          <input type="number" value={formCostOverride} onChange={(e) => setFormCostOverride(e.target.value)} placeholder="e.g. 150" style={{ width:"100%", padding:"4px 6px", borderRadius:4, border:`0.5px solid ${C.grayLight}`, fontSize:11 }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:10, alignItems:"center" }}>
                {editingTask && editingTask.assigneeId && !editingTask.id.startsWith("DRAFT-") && (
                  <button
                    type="button"
                    onClick={() => { const id = editingTask.id; setShowAddModal(false); openAdjust(id); }}
                    style={{ padding: "8px 14px", borderRadius: 8, background:"#F3F2FF", border:`0.5px solid ${C.purple}`, color:C.purple, fontSize:12, cursor:"pointer", fontWeight:600, marginRight:"auto" }}
                    title="Stage a working-day delay with cascade options"
                  >
                    ⏱ Delay / adjust…
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: "8px 16px", borderRadius: 8, background:C.white, border:`0.5px solid ${C.grayLight}`, fontSize:12, cursor:"pointer" }}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  style={{ padding: "8px 16px", borderRadius: 8, background:C.blue, color:C.white, border:"none", fontSize:12, cursor:"pointer", fontWeight:600 }}
                >
                  {editingTask ? "Update draft" : "Add to draft"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
