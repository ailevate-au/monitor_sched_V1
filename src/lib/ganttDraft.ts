import { Project, Resource, Task } from "../types";
import { localIsoDate, parseProgrammeDate } from "./programmeDate";
import {
  calculateTaskCost,
  calculateTaskEarnedValue,
  formatAud,
  formatCostDelta,
  sumProjectScheduledCost,
} from "../server/taskCost";

export function datesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && startB <= endA;
}

export interface DraftManpowerConflict {
  resourceId: string;
  resourceName: string;
  taskAId: string;
  taskBId: string;
  taskAName: string;
  taskBName: string;
  datesA: string;
  datesB: string;
}

function isActiveTask(task: Task): boolean {
  if (!task.assigneeId || task.assignee === "Unassigned") return false;
  if (task.status === "completed" || (task.percent_complete ?? 0) >= 100) return false;
  return true;
}

/** Client-side overlap check — mirrors server hard-conflict rule for draft preview. */
export function detectManpowerOverlaps(tasks: Task[]): DraftManpowerConflict[] {
  const conflicts: DraftManpowerConflict[] = [];
  const byResource = new Map<string, Task[]>();

  for (const task of tasks) {
    if (!isActiveTask(task)) continue;
    const list = byResource.get(task.assigneeId!) || [];
    list.push(task);
    byResource.set(task.assigneeId!, list);
  }

  for (const [resourceId, allocations] of byResource) {
    for (let i = 0; i < allocations.length; i++) {
      for (let j = i + 1; j < allocations.length; j++) {
        const a = allocations[i];
        const b = allocations[j];
        if (!datesOverlap(a.start, a.end, b.start, b.end)) continue;

        conflicts.push({
          resourceId,
          resourceName: a.assignee || b.assignee || "Unknown",
          taskAId: a.id,
          taskBId: b.id,
          taskAName: a.name,
          taskBName: b.name,
          datesA: `${a.start} – ${a.end}`,
          datesB: `${b.start} – ${b.end}`,
        });
      }
    }
  }

  return conflicts;
}

export function getConflictedResourceIds(tasks: Task[]): Set<string> {
  return new Set(detectManpowerOverlaps(tasks).map((c) => c.resourceId));
}

export function applyDraftConflictStatus(tasks: Task[], conflicts: DraftManpowerConflict[]): Task[] {
  const conflictIds = new Set<string>();
  for (const c of conflicts) {
    conflictIds.add(c.taskAId);
    conflictIds.add(c.taskBId);
  }

  return tasks.map((task) => {
    if (!conflictIds.has(task.id)) return task;
    if (task.status === "completed") return task;
    return { ...task, status: "conflict" as const };
  });
}

export type PendingDateDraft = {
  kind: "dates";
  start: string;
  end: string;
  cascade: boolean;
  savedStart: string;
  savedEnd: string;
};

export type PendingEditDraft = {
  kind: "edit";
  payload: Record<string, unknown>;
  savedTask: Task;
};

export type PendingCreateDraft = {
  kind: "create";
  payload: Record<string, unknown>;
};

export type PendingDraft = PendingDateDraft | PendingEditDraft | PendingCreateDraft;

export function mergeTasksWithDrafts(
  savedTasks: Task[],
  pendingById: Record<string, PendingDraft>,
  draftNewTasks: Task[]
): Task[] {
  const merged = savedTasks.map((task) => {
    const pending = pendingById[task.id];
    if (!pending) return task;

    if (pending.kind === "dates") {
      return { ...task, start: pending.start, end: pending.end };
    }

    if (pending.kind === "edit") {
      const p = pending.payload;
      const assigneeId = (p.assigneeId as string | null) ?? task.assigneeId;
      const assigneeName =
        p.assignee !== undefined
          ? (p.assignee as string)
          : task.assignee;
      return {
        ...task,
        project: (p.project as string) ?? task.project,
        name: (p.name as string) ?? task.name,
        start: (p.start as string) ?? task.start,
        end: (p.end as string) ?? task.end,
        lag_days: (p.lag_days as number) ?? task.lag_days,
        assigneeId,
        assignee: assigneeName,
        trade: (p.trade as string) ?? task.trade,
        dependencies: (p.dependencies as string) ?? task.dependencies,
        dependency_type: (p.dependency_type as Task["dependency_type"]) ?? task.dependency_type,
        cost_override: (p.cost_override as number | null) ?? task.cost_override,
        cost_override_type: (p.cost_override_type as Task["cost_override_type"]) ?? task.cost_override_type,
      };
    }

    return task;
  });

  return [...merged, ...draftNewTasks];
}

export interface DraftReplacementCandidate {
  id: string;
  initials: string;
  name: string;
  rate: string;
  util: number;
  state: string;
  same_state: boolean;
  recommended: boolean;
  reasonTags: string[];
  score: number;
}

function buildReasonTags(
  trade: string,
  candidate: { same_state: boolean; util: number; recommended: boolean; noOverlap: boolean }
): string[] {
  const tags = [`Same trade · ${trade}`];
  if (candidate.noOverlap) tags.push("No date overlap");
  if (candidate.same_state) tags.push("Same state");
  if (candidate.util <= 60) tags.push("Low load");
  else if (candidate.util <= 80) tags.push("Available");
  if (candidate.recommended) tags.push("Best fit");
  return tags;
}

/** True if assigning assignToTask to resourceId would overlap another active task. */
export function resourceWouldOverlapTask(
  tasks: Task[],
  resourceId: string,
  assignToTask: Task
): boolean {
  for (const t of tasks) {
    if (t.id === assignToTask.id) continue;
    if (t.assigneeId !== resourceId) continue;
    if (!isActiveTask(t)) continue;
    if (datesOverlap(t.start, t.end, assignToTask.start, assignToTask.end)) {
      return true;
    }
  }
  return false;
}

/** Mock AI ranking for draft conflict resolution — no server call. */
export function rankReplacementCandidates(
  resources: Resource[],
  excludeResourceId: string,
  trade: string,
  originalState: string,
  tasks: Task[],
  assignToTask: Task,
  conflictedResourceIds: Set<string>,
  refreshSeed = 0
): DraftReplacementCandidate[] {
  const qualifying = resources.filter((r) => {
    if (r.id === excludeResourceId) return false;
    if (r.trade !== trade) return false;
    if (r.status === "conflict") return false;
    if (conflictedResourceIds.has(r.id)) return false;
    if (resourceWouldOverlapTask(tasks, r.id, assignToTask)) return false;
    return true;
  });

  return qualifying
    .map((r) => {
      const same_state = r.state === originalState;
      const recommended = r.util <= 80;
      const noOverlap = true;
      const utilScore = Math.max(0, 100 - r.util);
      const jitter = ((refreshSeed * 13 + r.id.charCodeAt(1)) % 5) - 2;
      const score = utilScore + (same_state ? 25 : 0) + (recommended ? 15 : 0) + jitter;
      return {
        id: r.id,
        initials: r.initials,
        name: r.name,
        rate: r.rate,
        util: r.util,
        state: r.state,
        same_state,
        recommended,
        reasonTags: buildReasonTags(trade, { same_state, util: r.util, recommended, noOverlap }),
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Prefer reassigning the task the user just changed in draft. */
export function pickTaskToReassign(
  conflict: DraftManpowerConflict,
  pendingById: Record<string, PendingDraft>
): string {
  if (pendingById[conflict.taskAId]) return conflict.taskAId;
  if (pendingById[conflict.taskBId]) return conflict.taskBId;
  return conflict.taskBId;
}

export interface TaskConstraintProfile {
  taskId: string;
  lockScore: number;
  reasons: string[];
  isLikelyFixed: boolean;
}

export interface ConflictConstraintInsight {
  taskA: TaskConstraintProfile & { name: string };
  taskB: TaskConstraintProfile & { name: string };
  suggestedAnchorTaskId: string;
  suggestedAdjustTaskId: string;
}

function taskShortName(task: Task): string {
  return task.name.split(" — ")[0] || task.name;
}

function countDependents(tasks: Task[], taskId: string): number {
  return tasks.filter((t) => {
    const deps = (t.dependencies || "")
      .split(/[,;\s]+/)
      .map((d) => d.trim())
      .filter((d) => d && d !== "-");
    return deps.includes(taskId);
  }).length;
}

/** Heuristic: which task should stay put vs which can move or swap resource. */
export function assessTaskConstraints(
  task: Task,
  tasks: Task[],
  pendingById: Record<string, PendingDraft>
): TaskConstraintProfile {
  let lockScore = 0;
  const reasons: string[] = [];

  const pct = task.percent_complete ?? 0;
  if (pct > 0) {
    lockScore += 40 + Math.min(pct, 30);
    reasons.push(`${pct}% done — already started on site`);
  }

  const dependents = countDependents(tasks, task.id);
  if (dependents > 0) {
    lockScore += 35 + dependents * 5;
    reasons.push(
      dependents === 1
        ? "1 other task is waiting on this to finish"
        : `${dependents} other tasks are waiting on this to finish`
    );
  }

  if (task.status === "weather") {
    lockScore += 30;
    reasons.push("tied to a weather window — dates matter");
  }
  if (task.status === "fragile") {
    lockScore += 25;
    reasons.push("tight schedule — little room to slip");
  }
  if (task.status === "inprogress") {
    lockScore += 30;
    reasons.push("crew already on site");
  }
  if (task.status === "overdue") {
    lockScore += 20;
    reasons.push("already overdue");
  }

  const predecessors = (task.dependencies || "")
    .split(/[,;\s]+/)
    .map((d) => d.trim())
    .filter((d) => d && d !== "-");
  if (predecessors.length > 0) {
    lockScore += 15;
    reasons.push("waits on another task finishing first");
  }

  if (pendingById[task.id]) {
    lockScore += 50;
    reasons.push("you just edited this — keeping it as-is");
  }

  return {
    taskId: task.id,
    lockScore,
    reasons,
    isLikelyFixed: lockScore >= 35,
  };
}

export function buildConflictConstraintInsight(
  conflict: DraftManpowerConflict,
  tasks: Task[],
  pendingById: Record<string, PendingDraft>
): ConflictConstraintInsight | null {
  const taskA = tasks.find((t) => t.id === conflict.taskAId);
  const taskB = tasks.find((t) => t.id === conflict.taskBId);
  if (!taskA || !taskB) return null;

  const profileA = assessTaskConstraints(taskA, tasks, pendingById);
  const profileB = assessTaskConstraints(taskB, tasks, pendingById);

  const anchorIsA = profileA.lockScore >= profileB.lockScore;
  return {
    taskA: { ...profileA, name: taskShortName(taskA) },
    taskB: { ...profileB, name: taskShortName(taskB) },
    suggestedAnchorTaskId: anchorIsA ? taskA.id : taskB.id,
    suggestedAdjustTaskId: anchorIsA ? taskB.id : taskA.id,
  };
}

export function buildDraftAssigneePatch(
  task: Task,
  resource: Resource
): Record<string, unknown> {
  return {
    project: task.project,
    name: task.name,
    start: task.start,
    end: task.end,
    lag_days: task.lag_days ?? 0,
    assigneeId: resource.id,
    assignee: resource.name,
    trade: resource.trade,
    dependencies: task.dependencies ?? "",
    dependency_type: task.dependency_type ?? "FS",
    cost_override: task.cost_override ?? null,
    cost_override_type: task.cost_override_type ?? null,
  };
}

function taskDurationDays(task: Task): number {
  const start = parseProgrammeDate(task.start);
  const end = parseProgrammeDate(task.end);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function shiftIsoDate(iso: string, dayOffset: number): string {
  const d = parseProgrammeDate(iso);
  d.setDate(d.getDate() + dayOffset);
  return localIsoDate(d);
}

function simulateTaskDates(tasks: Task[], taskId: string, start: string, end: string): Task[] {
  return tasks.map((t) => (t.id === taskId ? { ...t, start, end } : t));
}

function conflictClearedForResource(
  tasks: Task[],
  resourceId: string,
  moveTaskId: string,
  start: string,
  end: string
): boolean {
  const simulated = simulateTaskDates(tasks, moveTaskId, start, end);
  return !detectManpowerOverlaps(simulated).some((c) => c.resourceId === resourceId);
}

export type SmartRecommendation =
  | {
      kind: "reschedule";
      id: string;
      taskId: string;
      taskName: string;
      anchorTaskId: string;
      anchorTaskName: string;
      anchorReasons: string[];
      headline: string;
      detail: string;
      start: string;
      end: string;
      tags: string[];
      score: number;
      costImpact: RecommendationCostImpact;
    }
  | {
      kind: "reassign";
      id: string;
      taskId: string;
      taskName: string;
      anchorTaskId: string;
      anchorTaskName: string;
      anchorReasons: string[];
      headline: string;
      detail: string;
      resourceId: string;
      resourceName: string;
      tags: string[];
      score: number;
      costImpact: RecommendationCostImpact;
    };

export interface RecommendationCostImpact {
  planBefore: number;
  planAfter: number;
  delta: number;
  rateBefore: string;
  rateAfter: string;
  assigneeBefore: string;
  assigneeAfter: string;
  earnedBefore?: number;
  earnedAfter?: number;
  fixedOverride: boolean;
  summary: string;
  project?: RecommendationProjectImpact;
}

export interface RecommendationProjectImpact {
  projectId: string;
  projectName: string;
  scheduledBeforeM: number;
  scheduledAfterM: number;
  deltaM: number;
  budgetTargetM?: number;
}

function simulateTaskAssignee(tasks: Task[], taskId: string, resource: Resource): Task[] {
  return tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          assigneeId: resource.id,
          assignee: resource.name,
          trade: resource.trade,
        }
      : t
  );
}

function attachProjectImpact(
  costImpact: RecommendationCostImpact,
  allTasks: Task[],
  resources: Resource[],
  task: Task,
  projects: Project[],
  afterTasks: Task[]
): RecommendationCostImpact {
  const projectId = task.projectId;
  if (!projectId) return costImpact;

  const project = projects.find((p) => p.id === projectId);
  const projectName = project?.name || task.project || "Project";
  const scheduledBeforeM = sumProjectScheduledCost(allTasks, resources, projectId);
  const scheduledAfterM = sumProjectScheduledCost(afterTasks, resources, projectId);
  const deltaM = Math.round((scheduledAfterM - scheduledBeforeM) * 1000) / 1000;

  return {
    ...costImpact,
    project: {
      projectId,
      projectName,
      scheduledBeforeM,
      scheduledAfterM,
      deltaM,
      budgetTargetM: project?.plannedCost,
    },
  };
}

function buildCostImpactForReschedule(
  task: Task,
  resource: Resource | undefined
): RecommendationCostImpact {
  const plan = calculateTaskCost(task, resource);
  const pct = task.percent_complete ?? 0;
  const earned = pct > 0 ? calculateTaskEarnedValue(task, resource) : undefined;
  const fixedOverride =
    task.cost_override !== null && task.cost_override !== undefined;
  const rateLabel = fixedOverride
    ? `Fixed ${task.cost_override_type || "hourly"} override`
    : resource?.rate || "Unrated";

  return {
    planBefore: plan,
    planAfter: plan,
    delta: 0,
    rateBefore: rateLabel,
    rateAfter: rateLabel,
    assigneeBefore: resource?.name || task.assignee || "Unassigned",
    assigneeAfter: resource?.name || task.assignee || "Unassigned",
    earnedBefore: earned,
    earnedAfter: earned,
    fixedOverride,
    summary: fixedOverride
      ? `Plan labour stays at ${formatAud(plan)} (fixed override on task).`
      : `Plan labour stays at ${formatAud(plan)} — same rate × duration, dates only.`,
  };
}

function buildCostImpactForReassign(
  task: Task,
  fromResource: Resource | undefined,
  toResource: Resource
): RecommendationCostImpact {
  const planBefore = calculateTaskCost(task, fromResource);
  const planAfter = calculateTaskCost(task, toResource);
  const delta = planAfter - planBefore;
  const pct = task.percent_complete ?? 0;
  const fixedOverride =
    task.cost_override !== null && task.cost_override !== undefined;

  let summary: string;
  if (fixedOverride) {
    summary = `Task has a fixed cost override — scheduled plan stays at ${formatAud(planBefore)} regardless of assignee.`;
  } else if (delta === 0) {
    summary = "Same hourly rate — plan cost unchanged.";
  } else if (delta < 0) {
    summary = `Lowers scheduled plan by ${formatAud(Math.abs(delta))} vs current assignee.`;
  } else {
    summary = `Increases scheduled plan by ${formatAud(delta)} — check margin before saving.`;
  }

  return {
    planBefore,
    planAfter,
    delta,
    rateBefore: fromResource?.rate || "Unrated",
    rateAfter: toResource.rate,
    assigneeBefore: fromResource?.name || task.assignee || "Unassigned",
    assigneeAfter: toResource.name,
    earnedBefore: pct > 0 ? calculateTaskEarnedValue(task, fromResource) : undefined,
    earnedAfter: pct > 0 ? calculateTaskEarnedValue(task, toResource) : undefined,
    fixedOverride,
    summary,
  };
}

/**
 * Rule-based recommendations (AI-ready shape).
 * Generates options for both directions: keep task A fixed vs keep task B fixed.
 */
export function buildSmartRecommendations(
  conflict: DraftManpowerConflict,
  tasks: Task[],
  resources: Resource[],
  pendingById: Record<string, PendingDraft>,
  conflictedResourceIds: Set<string>,
  refreshSeed = 0,
  projects: Project[] = []
): SmartRecommendation[] {
  const taskA = tasks.find((t) => t.id === conflict.taskAId);
  const taskB = tasks.find((t) => t.id === conflict.taskBId);
  if (!taskA || !taskB) return [];

  const profileA = assessTaskConstraints(taskA, tasks, pendingById);
  const profileB = assessTaskConstraints(taskB, tasks, pendingById);
  const options: SmartRecommendation[] = [];

  appendOptionsForDirection(
    options,
    conflict,
    tasks,
    resources,
    projects,
    conflictedResourceIds,
    refreshSeed,
    taskB,
    taskA,
    profileA,
    Math.max(8, profileA.lockScore - profileB.lockScore)
  );

  appendOptionsForDirection(
    options,
    conflict,
    tasks,
    resources,
    projects,
    conflictedResourceIds,
    refreshSeed,
    taskA,
    taskB,
    profileB,
    Math.max(8, profileB.lockScore - profileA.lockScore)
  );

  const seen = new Set<string>();
  const deduped = options
    .filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  // Always add a "push 2 weeks" fallback — matches the same option shown in the Problems hub.
  const insight = buildConflictConstraintInsight(conflict, tasks, pendingById);
  const adjustTaskId = insight?.suggestedAdjustTaskId || conflict.taskBId;
  const adjustTask = tasks.find((t) => t.id === adjustTaskId);
  const anchorTaskId = insight?.suggestedAnchorTaskId || conflict.taskAId;
  const anchorTask = tasks.find((t) => t.id === anchorTaskId);
  const pushId = `push14-${adjustTaskId}`;
  if (adjustTask && !deduped.find((o) => o.id === pushId)) {
    const currentResource = resources.find((r) => r.id === conflict.resourceId);
    const push14Start = shiftIsoDate(adjustTask.start, 14);
    const push14End = shiftIsoDate(adjustTask.end, 14);
    const costImpact = attachProjectImpact(
      buildCostImpactForReschedule(adjustTask, currentResource),
      tasks, resources, adjustTask, projects, tasks
    );
    deduped.push({
      kind: "reschedule",
      id: pushId,
      taskId: adjustTaskId,
      taskName: taskShortName(adjustTask),
      anchorTaskId,
      anchorTaskName: anchorTask ? taskShortName(anchorTask) : "",
      anchorReasons: insight?.taskA.reasons || [],
      headline: `Push one job back 2 weeks instead`,
      detail: `Shift "${taskShortName(adjustTask)}" 2 weeks later. Tasks waiting on it move too.`,
      start: push14Start,
      end: push14End,
      tags: ["+14d shift", "Same person"],
      score: 55,
      costImpact,
    });
  }

  return deduped;
}

function appendOptionsForDirection(
  options: SmartRecommendation[],
  conflict: DraftManpowerConflict,
  tasks: Task[],
  resources: Resource[],
  projects: Project[],
  conflictedResourceIds: Set<string>,
  refreshSeed: number,
  moveTask: Task,
  anchorTask: Task,
  anchorProfile: TaskConstraintProfile,
  directionBonus: number
): void {
  const taskToMoveId = moveTask.id;
  const trade =
    resources.find((r) => r.id === conflict.resourceId)?.trade ||
    moveTask.trade ||
    moveTask.tradeRequired ||
    "Labour";
  const originalState =
    resources.find((r) => r.id === conflict.resourceId)?.state || "NSW";
  const duration = taskDurationDays(moveTask);
  const moveName = taskShortName(moveTask);
  const anchorName = taskShortName(anchorTask);
  const anchorReasonText =
    anchorProfile.reasons.slice(0, 2).join(" · ") || "programme constraint";
  const currentResource = resources.find((r) => r.id === conflict.resourceId);

  const afterStart = shiftIsoDate(anchorTask.end, 1);
  const afterEnd = shiftIsoDate(afterStart, duration - 1);
  if (
    conflictClearedForResource(
      tasks,
      conflict.resourceId,
      taskToMoveId,
      afterStart,
      afterEnd
    )
  ) {
    const costImpact = attachProjectImpact(
      buildCostImpactForReschedule(moveTask, currentResource),
      tasks,
      resources,
      moveTask,
      projects,
      tasks
    );
    options.push({
      kind: "reschedule",
      id: `reschedule-after-${taskToMoveId}-anchor-${anchorTask.id}`,
      taskId: taskToMoveId,
      taskName: moveName,
      anchorTaskId: anchorTask.id,
      anchorTaskName: anchorName,
      anchorReasons: anchorProfile.reasons,
      headline: `Move "${moveName}" to ${afterStart} – ${afterEnd}`,
      detail: `"${anchorName}" keeps its dates (${anchorReasonText}). "${moveName}" starts after it finishes — same person, no overlap.`,
      start: afterStart,
      end: afterEnd,
      tags: ["Same person", "No overlap", "Clears conflict"],
      score: 90 + directionBonus + (refreshSeed % 3),
      costImpact,
    });
  }

  const beforeEnd = shiftIsoDate(anchorTask.start, -1);
  const beforeStart = shiftIsoDate(beforeEnd, -(duration - 1));
  if (
    beforeStart >= "2020-01-01" &&
    conflictClearedForResource(
      tasks,
      conflict.resourceId,
      taskToMoveId,
      beforeStart,
      beforeEnd
    )
  ) {
    const costImpact = attachProjectImpact(
      buildCostImpactForReschedule(moveTask, currentResource),
      tasks,
      resources,
      moveTask,
      projects,
      tasks
    );
    options.push({
      kind: "reschedule",
      id: `reschedule-before-${taskToMoveId}-anchor-${anchorTask.id}`,
      taskId: taskToMoveId,
      taskName: moveName,
      anchorTaskId: anchorTask.id,
      anchorTaskName: anchorName,
      anchorReasons: anchorProfile.reasons,
      headline: `Start "${moveName}" earlier — ${beforeStart} to ${beforeEnd}`,
      detail: `"${anchorName}" keeps its dates (${anchorReasonText}). "${moveName}" finishes before "${anchorName}" starts — no overlap.`,
      start: beforeStart,
      end: beforeEnd,
      tags: ["Same person", "Move earlier", "Clears conflict"],
      score: 75 + directionBonus + (refreshSeed % 3),
      costImpact,
    });
  }

  const candidates = rankReplacementCandidates(
    resources,
    conflict.resourceId,
    trade,
    originalState,
    tasks,
    moveTask,
    conflictedResourceIds,
    refreshSeed
  );

  for (const [idx, candidate] of candidates.slice(0, 2).entries()) {
    const replacement = resources.find((r) => r.id === candidate.id);
    if (!replacement) continue;

    const costImpact = attachProjectImpact(
      buildCostImpactForReassign(moveTask, currentResource, replacement),
      tasks,
      resources,
      moveTask,
      projects,
      simulateTaskAssignee(tasks, taskToMoveId, replacement)
    );
    const costTag = costImpact.fixedOverride
      ? "Fixed override"
      : costImpact.delta < 0
        ? `Saves ${formatAud(Math.abs(costImpact.delta))}`
        : costImpact.delta > 0
          ? `+${formatAud(costImpact.delta)} plan`
          : "Same plan cost";

    options.push({
      kind: "reassign",
      id: `reassign-${taskToMoveId}-${candidate.id}-anchor-${anchorTask.id}`,
      taskId: taskToMoveId,
      taskName: moveName,
      anchorTaskId: anchorTask.id,
      anchorTaskName: anchorName,
      anchorReasons: anchorProfile.reasons,
      headline: `Give "${moveName}" to ${candidate.name}`,
      detail: `${conflict.resourceName} stays on "${anchorName}" (${anchorReasonText}). ${candidate.name} takes over "${moveName}" — ${candidate.util}% booked right now.`,
      resourceId: candidate.id,
      resourceName: candidate.name,
      tags: ["Different person", ...candidate.reasonTags, costTag],
      score: candidate.score + directionBonus - idx * 5,
      costImpact,
    });
  }
}
