/**
 * Conflict and Cascade Engine mimicking background workers.
 * Rules:
 * - Hard conflict: Same manpower assigned to tasks with overlapping dates.
 * - Fragile spot: working-day buffer between a task end and its next dependent is
 *   under the configurable tight-handover threshold (db.settings.tightHandover).
 * - Cascade logic: Shifts all downstream dependent tasks recursively using working days.
 */

import { dbInstance, Task, Conflict } from "./db";
import { getWorkingDaysBetween, addWorkingDays, isWorkingDay, formatDateKey } from "./holidays";
import { evaluateWeatherRisk } from "./bomWeather";
import type { ConflictMetrics, FragileTaskSummary } from "../types";
import { resourceWouldOverlapTask, getConflictedResourceIds } from "../lib/ganttDraft";

const UTIL_WINDOW_WORKING_DAYS = 20;

// The demo is pinned to a fixed "now" so the scenario is stable no matter what
// the real calendar date is. Everything (weather, dashboard, late detection)
// aligns to 2 Jun 2026.
const SCENARIO_TODAY = "2026-06-02";
function scenarioNow(): Date {
  const d = new Date(SCENARIO_TODAY);
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveStateForTask(task: Task): string {
  const db = dbInstance;
  const project = db.projects.find(p => p.id === task.projectId);
  if (project?.state) return project.state;
  if (task.assigneeId) {
    const resource = db.resources.find(r => r.id === task.assigneeId);
    if (resource?.state) return resource.state;
  }
  return "NSW";
}

function countAssignedWorkingDaysInWindow(
  allocations: Array<{ start: Date; end: Date }>,
  windowStart: Date,
  windowEnd: Date,
  stateStr: string
): number {
  let assignedDays = 0;
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    if (isWorkingDay(cursor, stateStr)) {
      const dayKey = formatDateKey(cursor);
      const tasksOnDay = allocations.filter(a => {
        const startKey = formatDateKey(a.start);
        const endKey = formatDateKey(a.end);
        return dayKey >= startKey && dayKey <= endKey;
      });
      assignedDays += tasksOnDay.length;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return assignedDays;
}

function calculateResourceUtil(
  allocations: Array<{ task: Task; start: Date; end: Date }>,
  stateStr: string
): number {
  if (allocations.length === 0) return 0;

  const today = scenarioNow();
  const windowEnd = addWorkingDays(today, UTIL_WINDOW_WORKING_DAYS - 1, stateStr);
  const assignedDays = countAssignedWorkingDaysInWindow(allocations, today, windowEnd, stateStr);
  const util = Math.round((assignedDays / UTIL_WINDOW_WORKING_DAYS) * 100);
  return Math.max(0, util);
}

function deriveExecutionStatus(task: Task, today: Date): Task["status"] {
  if ((task.percent_complete ?? 0) >= 100) return "completed";

  const start = new Date(task.start);
  const end = new Date(task.end);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end < today && (task.percent_complete ?? 0) < 100) return "overdue";
  if (start <= today && end >= today) return "inprogress";
  if (end < today) return "completed";
  return "scheduled";
}

export function countResolvedThisFortnight(): number {
  const db = dbInstance;
  const fortnightAgo = new Date();
  fortnightAgo.setDate(fortnightAgo.getDate() - 14);
  return db.conflictResolutionLog.filter(
    entry => !entry.undone && new Date(entry.resolvedAt) >= fortnightAgo
  ).length;
}

export function buildConflictMetrics(
  conflicts: Conflict[],
  fragileTasks: FragileTaskSummary[]
): ConflictMetrics {
  return {
    hardConflicts: conflicts.length,
    fragileBufferSlots: fragileTasks.length,
    resolvedThisFortnight: countResolvedThisFortnight(),
  };
}

export function getConflictHubPayload() {
  const db = dbInstance;
  return {
    conflicts: db.conflicts,
    metrics: db.conflictMetrics,
    fragileTasks: db.fragileTasks,
  };
}

/**
 * Perform background conflict detection across all active tasks.
 * Auto-runs on every update.
 */
export function runConflictDetection(): void {
  const db = dbInstance;
  const activeTasks = db.tasks;
  const conflictsList: Conflict[] = [];
  const fragileTasks: FragileTaskSummary[] = [];
  const today = scenarioNow();

  for (const t of activeTasks) {
    if (t.status !== "completed" && (t.percent_complete ?? 0) < 100) {
      t.status = "scheduled";
    }
  }

  const resourceAllocMap: { [resId: string]: Array<{ task: Task; start: Date; end: Date }> } = {};

  for (const t of activeTasks) {
    if (!t.assigneeId || t.status === "completed") continue;
    if (!resourceAllocMap[t.assigneeId]) {
      resourceAllocMap[t.assigneeId] = [];
    }
    resourceAllocMap[t.assigneeId].push({
      task: t,
      start: new Date(t.start),
      end: new Date(t.end),
    });
  }

  for (const r of db.resources) {
    const allocations = resourceAllocMap[r.id] || [];
    r.util = calculateResourceUtil(allocations, r.state || "NSW");

    if (allocations.length === 0) {
      r.status = "low";
      continue;
    }

    let hasOverlaps = false;
    let taskToReassign: Task | undefined;
    const overlapDescs: string[] = [];
    const overlapPairs: Array<{
      taskA: string;
      taskB: string;
      datesA: string;
      datesB: string;
    }> = [];

    for (let i = 0; i < allocations.length; i++) {
      const a = allocations[i];
      for (let j = i + 1; j < allocations.length; j++) {
        const b = allocations[j];
        const maxStart = a.start > b.start ? a.start : b.start;
        const minEnd = a.end < b.end ? a.end : b.end;

        if (maxStart <= minEnd) {
          hasOverlaps = true;
          const datesA = `${a.task.start} – ${a.task.end}`;
          const datesB = `${b.task.start} – ${b.task.end}`;
          overlapDescs.push(
            `"${a.task.name}" (${datesA}) overlaps "${b.task.name}" (${datesB})`
          );
          overlapPairs.push({
            taskA: a.task.name,
            taskB: b.task.name,
            datesA,
            datesB,
          });
          a.task.status = "conflict";
          b.task.status = "conflict";
          taskToReassign = b.task;
        }
      }
    }

    if (hasOverlaps) {
      r.status = "conflict";
      const overlapSummary = overlapDescs.join("; ");
      conflictsList.push({
        id: `c-${r.id}`,
        resourceId: r.id,
        resource: r.name,
        trade: r.trade,
        rate: r.rate,
        desc: `${r.name} is already on overlapping jobs: ${overlapSummary}. Current load: ${r.util}%.`,
        utilPercent: r.util,
        overlapPairs,
        reasonSummary: `${r.name} is double-booked on ${overlapPairs.length} overlapping task pair(s).`,
        candidates: getReplacementCandidates(r.id, r.trade, taskToReassign),
      });
    } else if (r.util > 100) {
      r.status = "conflict";
    } else if (r.util < 20) {
      r.status = "low";
    } else {
      r.status = "ok";
    }
  }

  // Tight-handover detection is a configurable demo knob: skip it entirely when
  // disabled, and treat a handover as "tight" when its working-day buffer is
  // strictly under the configured threshold (default 3).
  const { enabled: tightHandoverEnabled, thresholdDays: tightHandoverThreshold } =
    db.settings.tightHandover;

  for (const t of activeTasks) {
    if (!tightHandoverEnabled) break;
    if (t.status === "completed" || (t.percent_complete ?? 0) >= 100) continue;

    const children = activeTasks.filter(
      c =>
        (c.dependencies || "").split(",").map(d => d.trim()).includes(t.id) &&
        c.assigneeId &&
        c.status !== "completed"
    );

    let fragileBufferDays: number | null = null;
    let fragileDesc = "";
    let fragileChildId: string | null = null;
    if (t.assigneeId) {
      for (const child of children) {
        const childState = resolveStateForTask(child);
        const tEnd = new Date(t.end);
        const childStart = new Date(child.start);
        const lag = child.lag_days || 0;
        const buffer = getWorkingDaysBetween(tEnd, childStart, childState) - 1 - lag;
        if (buffer < tightHandoverThreshold && (fragileBufferDays === null || buffer < fragileBufferDays)) {
          fragileBufferDays = buffer;
          fragileDesc = `Only ${Math.max(buffer, 0)} working day buffer before "${child.name}" starts.`;
          fragileChildId = child.id; // the exact tight child a fix should shift
        }
      }
    }

    if (fragileBufferDays !== null && fragileBufferDays < tightHandoverThreshold) {
      const assignee = db.resources.find(r => r.id === t.assigneeId);
      fragileTasks.push({
        id: t.id,
        name: t.name,
        resource: assignee?.name || "Unassigned",
        trade: assignee?.trade || t.tradeRequired,
        bufferDays: fragileBufferDays,
        desc: fragileDesc,
        childId: fragileChildId ?? undefined,
      });
    }
  }

  for (const t of activeTasks) {
    if (t.status === "conflict") continue;

    const isFragile = fragileTasks.some(f => f.id === t.id);

    if (evaluateWeatherRisk(t.start, t.end, resolveStateForTask(t))) {
      t.status = "weather";
    } else if (isFragile) {
      t.status = "fragile";
    } else {
      t.status = deriveExecutionStatus(t, today);
    }
  }

  db.conflicts = conflictsList;
  db.fragileTasks = fragileTasks;
  db.conflictMetrics = buildConflictMetrics(conflictsList, fragileTasks);
  db.save();
}

/**
 * Candidate resolution: same trade, not conflicted, no overlap if assigned to reassignTask.
 */
export function getReplacementCandidates(
  excludeResourceId: string,
  trade: string,
  reassignTask?: Task
) {
  const db = dbInstance;
  const originalResource = db.resources.find(r => r.id === excludeResourceId);
  const originalState = originalResource?.state || "NSW";
  const conflictedResourceIds = getConflictedResourceIds(db.tasks);

  const qualifying = db.resources.filter(r => {
    if (r.trade !== trade || r.id === excludeResourceId) return false;
    if (conflictedResourceIds.has(r.id)) return false;
    if (reassignTask && resourceWouldOverlapTask(db.tasks, r.id, reassignTask)) return false;
    return true;
  });

  return qualifying
    .map(q => ({
      id: q.id,
      initials: q.initials,
      name: q.name,
      rate: q.rate,
      util: q.util,
      state: q.state,
      same_state: q.state === originalState,
      rate_type: q.rate_type || "hourly",
      recommended: q.util <= 80,
    }))
    .sort((a, b) => {
      if (a.same_state && !b.same_state) return -1;
      if (!a.same_state && b.same_state) return 1;

      const valA = parseInt(a.rate.replace(/\D/g, "")) || 100;
      const valB = parseInt(b.rate.replace(/\D/g, "")) || 100;
      return valA - valB;
    });
}

/**
 * Recursive Cascade Scheduling Engine taking lag days into account.
 * Shifts all downstream dependents when task schedule changes.
 */
export function computeCascade(
  activeTasks: Task[],
  changedTaskId: string,
  delayDays: number,
  stateStr: string = "NSW"
): Task[] {
  const cloned: Task[] = JSON.parse(JSON.stringify(activeTasks));
  const taskMap = new Map<string, Task>();
  for (const t of cloned) {
    taskMap.set(t.id, t);
  }

  const changedTask = taskMap.get(changedTaskId);
  if (changedTask && delayDays !== 0) {
    const currentStart = new Date(changedTask.start);
    const newStart = addWorkingDays(currentStart, delayDays, stateStr);
    changedTask.start = newStart.toISOString().slice(0, 10);

    const currentEnd = new Date(changedTask.end);
    const newEnd = addWorkingDays(currentEnd, delayDays, stateStr);
    changedTask.end = newEnd.toISOString().slice(0, 10);
  }

  const cascadeQueue = [changedTaskId];
  const visited = new Set<string>();

  while (cascadeQueue.length > 0) {
    const parentId = cascadeQueue.shift()!;
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    const parent = taskMap.get(parentId);
    if (!parent) continue;

    const dependents = cloned.filter(c =>
      (c.dependencies || "").split(",").map(d => d.trim()).includes(parentId)
    );

    for (const child of dependents) {
      const lag = child.lag_days || 0;
      const step = lag > 0 ? lag : 0;
      const depType = child.dependency_type || "FS";

      let anchorDate: Date;
      if (depType === "SS") {
        anchorDate = new Date(parent.start);
      } else {
        anchorDate = new Date(parent.end);
      }

      const requiredStart = step > 0 ? addWorkingDays(anchorDate, step, stateStr) : anchorDate;
      const currentStart = new Date(child.start);

      // Only ever push a dependent LATER — never pull it earlier. This preserves
      // each job's planned slack: a delay (or a "push back"/"extend" fix) shifts a
      // successor only when the parent's new end would actually overrun it. Stops
      // the old behaviour where every dependent was snapped back-to-back with its
      // parent (which manufactured spurious clashes and 0-buffer tight handovers).
      if (requiredStart > currentStart) {
        child.start = requiredStart.toISOString().slice(0, 10);
        const childDuration = child.durationDays || 1;
        const newEnd = addWorkingDays(requiredStart, childDuration - 1, stateStr);
        child.end = newEnd.toISOString().slice(0, 10);
        cascadeQueue.push(child.id);
      }
    }
  }

  return cloned;
}
