export interface Project {
  id: string;
  name: string;
  type: string;
  location: string;
  contractor: string;
  state: string;
  originalContractSum: number;
  finalContractSum: number;
  plannedCost: number;
  actualCost: number;
  ldRatePerDay: number;
  pcStartDate: string;
  pcEndDate: string;
  status: "PLANNING" | "ACTIVE" | "PRACTICAL_COMPLETION" | "DLP_ACTIVE" | "COMPLETED";
  progress: number;
  weatherRisk: boolean;
  overBudget: boolean;
  retentionPercent?: number;
  /** Email of the PM who owns this project. PMs only see their own projects. */
  managerEmail?: string;
}

export interface Resource {
  id: string;
  initials: string;
  name: string;
  trade: string;
  state: string;
  rate: string;
  hourlyRateVal: number;
  util: number;
  status: "ok" | "conflict" | "fragile" | "low";
  rate_type?: "hourly" | "daily" | "lump_sum";
  email?: string;
  company?: string;
  overtimeRateVal?: number;
  dailyAllowanceVal?: number;
  projectRateOverrides?: { [projectId: string]: number };
  bio?: string;
  skills?: string[];
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  assigneeId: string | null;
  tradeRequired: string;
  start: string;
  end: string;
  durationDays: number;
  dependencies: string;
  status: "scheduled" | "inprogress" | "weather" | "fragile" | "conflict" | "overdue" | "completed";
  project?: string;
  assignee?: string;
  trade?: string;
  rate?: string;
  lag_days?: number;
  dependency_type?: "FS" | "SS";
  cost_override?: number | null;
  cost_override_type?: "hourly" | "daily" | "lump_sum" | null;
  percent_complete?: number;
  /**
   * PM-controlled lifecycle, separate from the engine-derived `status`
   * (conflict/weather/etc). PMs set this; "delayed" triggers a real cascade.
   */
  pmStatus?: "not_started" | "in_progress" | "complete" | "delayed";
}

export interface ProgressClaim {
  id: string;
  claimNumber: string;
  projectId: string;
  project: string;
  period: string;
  claimedAmount: string;
  certifiedAmount: string;
  claimedVal: number;
  certifiedVal: number;
  retentionVal: number;
  dueDate: string;
  status: "pending" | "certified" | "released";
  costCategoryId?: string;
  costCategoryName?: string;
  taskIds?: string;
  description?: string;
}

export interface ConflictOverlapPair {
  taskA: string;
  taskB: string;
  datesA: string;
  datesB: string;
}

export interface Conflict {
  id: string;
  resourceId: string;
  resource: string;
  trade: string;
  rate: string;
  desc: string;
  utilPercent?: number;
  overlapPairs?: ConflictOverlapPair[];
  reasonSummary?: string;
  candidates: Array<{
    id: string;
    initials: string;
    name: string;
    rate: string;
    util: number;
    recommended: boolean;
    state?: string;
    same_state?: boolean;
  }>;
}

export interface ConflictMetrics {
  hardConflicts: number;
  fragileBufferSlots: number;
  resolvedThisFortnight: number;
}

export interface FragileTaskSummary {
  id: string;
  name: string;
  resource: string;
  trade: string;
  bufferDays: number;
  desc: string;
}

export interface ConflictHubResponse {
  conflicts: Conflict[];
  metrics: ConflictMetrics;
  fragileTasks: FragileTaskSummary[];
}

/** Accept legacy array responses and the enriched hub payload. */
export function parseConflictHubResponse(data: unknown): ConflictHubResponse {
  if (Array.isArray(data)) {
    return {
      conflicts: data,
      metrics: {
        hardConflicts: data.length,
        fragileBufferSlots: 0,
        resolvedThisFortnight: 0,
      },
      fragileTasks: [],
    };
  }
  const payload = data as Partial<ConflictHubResponse>;
  return {
    conflicts: payload.conflicts ?? [],
    metrics: payload.metrics ?? {
      hardConflicts: payload.conflicts?.length ?? 0,
      fragileBufferSlots: 0,
      resolvedThisFortnight: 0,
    },
    fragileTasks: payload.fragileTasks ?? [],
  };
}

export interface CostCategory {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

// ── Problems hub ──────────────────────────────────────────────────────────────
// One unified feed of everything wrong across the portfolio. Each problem is a
// plain-language issue carrying 2–3 suggested fixes; the owner picks one,
// confirms, and the problem resolves.

export type ProblemCategory = "conflict" | "late" | "fragile" | "weather" | "unassigned";
export type ProblemSeverity = "critical" | "high" | "medium";

/** A candidate replacement attached to a "reassign" action. */
export interface ProblemActionResource {
  id: string;
  initials: string;
  name: string;
  trade: string;
  rate: string;
  util: number;
  state?: string;
  same_state?: boolean;
  recommended?: boolean;
  bio?: string;
  skills?: string[];
}

export interface ProblemAction {
  id: string;
  kind: "reassign" | "accept_delay" | "extend_deadline";
  label: string;
  /** Plain-language description of what this action does. */
  detail: string;
  recommended?: boolean;
  /** Present for kind === "reassign". */
  resource?: ProblemActionResource;
  /** Present for delay/extend actions. */
  delayDays?: number;
}

export interface Problem {
  id: string;
  category: ProblemCategory;
  severity: ProblemSeverity;
  /** Timeline task IDs this problem covers — used to focus the Gantt. */
  taskIds?: string[];
  /** Short headline, e.g. "Ben Nguyen is double-booked". */
  title: string;
  projectName: string;
  /** What is wrong, in plain English. */
  what: string;
  /** The downstream impact / cascade. */
  impact: string;
  suggestedActions: ProblemAction[];
}

export interface ProblemsResponse {
  problems: Problem[];
  summary: {
    total: number;
    critical: number;
    projectsAffected: number;
    projectsTotal: number;
  };
}

export function parseProblemsResponse(data: unknown): ProblemsResponse {
  const payload = (data ?? {}) as Partial<ProblemsResponse>;
  const problems = Array.isArray(payload.problems) ? payload.problems : [];
  return {
    problems,
    summary: payload.summary ?? {
      total: problems.length,
      critical: problems.filter((p) => p.severity === "critical").length,
      projectsAffected: new Set(problems.map((p) => p.projectName)).size,
      projectsTotal: 0,
    },
  };
}

