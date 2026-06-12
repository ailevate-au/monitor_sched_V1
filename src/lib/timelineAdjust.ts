import { Task } from "../types";
import { addWorkingDays, getWorkingDaysBetween } from "../server/holidays";
import { parseProgrammeDate, localIsoDate, PROGRAMME_TODAY } from "./programmeDate";
import { detectManpowerOverlaps, applyDraftConflictStatus } from "./ganttDraft";

/**
 * Pure, React-free engine for the staged timeline-adjustment feature.
 *
 * It computes how a working-day delay on one anchor task ripples through the
 * programme under three cascade modes, recomputes the resulting task statuses,
 * and surfaces conflict warnings — all client-side so the Gantt can preview the
 * change before anything is committed. Working-day math is shared with the
 * server cascade (../server/holidays) so a simulated position equals what the
 * server stores on confirm.
 */

export type CascadeMode = "full" | "partial" | "none";

export interface TaskMove {
  taskId: string;
  name: string;
  fromStart: string;
  fromEnd: string;
  toStart: string;
  toEnd: string;
}

export interface AdjustmentWarning {
  kind: "dependency" | "resource";
  severity: "warn" | "danger";
  message: string;
  taskIds: string[];
}

export interface AdjustmentSummary {
  shifted: number;
  newlyConflict: number;
  newlyFragile: number;
  newlyOverdue: number;
  maxPushDays: number;
}

/** Resolves the holiday calendar (state) that applies to a task. */
export type StateResolver = (task: Task) => string;

/** Split a `dependencies` string into predecessor task ids (matches server cascade). */
function parseDeps(task: Task): string[] {
  return (task.dependencies || "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d && d !== "-");
}

function shiftIso(iso: string, workingDays: number, state: string): string {
  if (workingDays === 0) return iso;
  return localIsoDate(addWorkingDays(parseProgrammeDate(iso), workingDays, state));
}

/** Direct dependents of `parentId` that live in the same project (cascade scope). */
function sameProjectDependents(tasks: Task[], parent: Task): Task[] {
  return tasks.filter(
    (c) => c.projectId === parent.projectId && parseDeps(c).includes(parent.id)
  );
}

/**
 * Free float (working days) the dependent can absorb before a shift of its
 * predecessor forces it to move. Mirrors the fragile-buffer formula in
 * conflictEngine.ts: gwd(anchor, childStart) - 1 - lag.
 */
function edgeSlack(parent: Task, child: Task, state: string): number {
  const depType = child.dependency_type || "FS";
  const anchorIso = depType === "SS" ? parent.start : parent.end;
  const lag = child.lag_days || 0;
  const buffer =
    getWorkingDaysBetween(parseProgrammeDate(anchorIso), parseProgrammeDate(child.start), state) -
    1 -
    lag;
  return Math.max(0, buffer);
}

/**
 * Build the per-task working-day push map for the chosen cascade mode.
 * - none:    only the anchor moves (push = D).
 * - full:    every downstream same-project dependent moves by the same D.
 * - partial: each dependent absorbs D into its free float first; it moves by
 *            max(0, parentPush - slack) and propagates the reduced push.
 */
function buildPushMap(
  tasks: Task[],
  anchor: Task,
  delayDays: number,
  mode: CascadeMode,
  stateFor: StateResolver
): Map<string, number> {
  const pushById = new Map<string, number>();
  pushById.set(anchor.id, delayDays);
  if (mode === "none" || delayDays === 0) return pushById;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Relaxation loop — pushes only increase, so this converges in <= |tasks| passes.
  let changed = true;
  let guard = tasks.length + 1;
  while (changed && guard-- > 0) {
    changed = false;
    for (const [parentId, parentPush] of Array.from(pushById.entries())) {
      if (parentPush <= 0) continue;
      const parent = byId.get(parentId);
      if (!parent) continue;
      for (const child of sameProjectDependents(tasks, parent)) {
        const state = stateFor(child);
        const childPush =
          mode === "full" ? parentPush : Math.max(0, parentPush - edgeSlack(parent, child, state));
        if (childPush > (pushById.get(child.id) ?? 0)) {
          pushById.set(child.id, childPush);
          changed = true;
        }
      }
    }
  }
  return pushById;
}

/** Compute the set of task moves produced by delaying `anchorId` by `delayDays` working days. */
export function computeAdjustment(
  tasks: Task[],
  anchorId: string,
  delayDays: number,
  mode: CascadeMode,
  stateFor: StateResolver
): TaskMove[] {
  const anchor = tasks.find((t) => t.id === anchorId);
  if (!anchor || delayDays <= 0) return [];

  const pushById = buildPushMap(tasks, anchor, delayDays, mode, stateFor);
  const moves: TaskMove[] = [];

  for (const task of tasks) {
    const push = pushById.get(task.id) ?? 0;
    if (push <= 0) continue;
    const state = stateFor(task);
    moves.push({
      taskId: task.id,
      name: task.name,
      fromStart: task.start,
      fromEnd: task.end,
      toStart: shiftIso(task.start, push, state),
      toEnd: shiftIso(task.end, push, state),
    });
  }

  // Anchor first, then by new start date for a stable, readable order.
  return moves.sort((a, b) =>
    a.taskId === anchorId ? -1 : b.taskId === anchorId ? 1 : a.toStart.localeCompare(b.toStart)
  );
}

/** Apply moves onto a task list, returning a new array with shifted dates. */
export function applyMoves(tasks: Task[], moves: TaskMove[]): Task[] {
  if (moves.length === 0) return tasks;
  const moveById = new Map(moves.map((m) => [m.taskId, m]));
  return tasks.map((t) => {
    const m = moveById.get(t.id);
    return m ? { ...t, start: m.toStart, end: m.toEnd } : t;
  });
}

function deriveExecutionStatus(task: Task, todayIso: string): Task["status"] {
  if ((task.percent_complete ?? 0) >= 100) return "completed";
  if (task.end < todayIso) return "overdue";
  if (task.start <= todayIso && task.end >= todayIso) return "inprogress";
  return "scheduled";
}

/** True if any same-project dependent leaves this task with a <= 1 working-day buffer. */
function isFragile(task: Task, tasks: Task[], stateFor: StateResolver): boolean {
  if (!task.assigneeId || task.status === "completed" || (task.percent_complete ?? 0) >= 100) {
    return false;
  }
  for (const child of tasks) {
    if (!parseDeps(child).includes(task.id)) continue;
    if (!child.assigneeId || child.status === "completed") continue;
    const lag = child.lag_days || 0;
    const buffer =
      getWorkingDaysBetween(parseProgrammeDate(task.end), parseProgrammeDate(child.start), stateFor(child)) -
      1 -
      lag;
    if (buffer <= 1) return true;
  }
  return false;
}

/**
 * Recompute statuses on a simulated task set: conflict (resource overlap),
 * fragile (tight buffer), overdue/in-progress/completed. Mirrors the order the
 * server uses (conflict wins, then weather kept, then fragile, then execution).
 */
export function computeSimulatedStatuses(
  simTasks: Task[],
  stateFor: StateResolver,
  todayIso: string = PROGRAMME_TODAY
): Task[] {
  const conflicts = detectManpowerOverlaps(simTasks);
  const withConflicts = applyDraftConflictStatus(simTasks, conflicts);

  return withConflicts.map((task) => {
    if (task.status === "conflict" || task.status === "completed") return task;
    if (task.status === "weather") return task; // weather window unchanged by a shift preview
    if (isFragile(task, withConflicts, stateFor)) return { ...task, status: "fragile" as const };
    return { ...task, status: deriveExecutionStatus(task, todayIso) };
  });
}

/** Detect dependency overruns and resource clashes created by the staged moves. */
export function detectAdjustmentWarnings(
  simTasks: Task[],
  moves: TaskMove[]
): AdjustmentWarning[] {
  const warnings: AdjustmentWarning[] = [];
  const movedIds = new Set(moves.map((m) => m.taskId));
  const byId = new Map(simTasks.map((t) => [t.id, t]));

  // 1) Dependency violations — a successor now starts before its predecessor's anchor date.
  for (const child of simTasks) {
    for (const predId of parseDeps(child)) {
      const pred = byId.get(predId);
      if (!pred) continue;
      if (!movedIds.has(child.id) && !movedIds.has(predId)) continue;
      const depType = child.dependency_type || "FS";
      const anchorIso = depType === "SS" ? pred.start : pred.end;
      if (child.start < anchorIso) {
        warnings.push({
          kind: "dependency",
          severity: "danger",
          message:
            depType === "SS"
              ? `"${shortName(child)}" now starts before "${shortName(pred)}" starts`
              : `"${shortName(child)}" now starts before "${shortName(pred)}" finishes`,
          taskIds: [child.id, predId],
        });
      }
    }
  }

  // 2) Resource overlaps touching a moved task (within or across projects).
  for (const c of detectManpowerOverlaps(simTasks)) {
    if (!movedIds.has(c.taskAId) && !movedIds.has(c.taskBId)) continue;
    const a = byId.get(c.taskAId);
    const b = byId.get(c.taskBId);
    const crossProject = a && b && a.projectId !== b.projectId;
    warnings.push({
      kind: "resource",
      severity: "warn",
      message: `${c.resourceName} double-booked: "${shortName(a)}" overlaps "${shortName(b)}"${
        crossProject ? " (across projects)" : ""
      }`,
      taskIds: [c.taskAId, c.taskBId],
    });
  }

  return dedupeWarnings(warnings);
}

/** Headline counts for the staging panel. */
export function summarizeAdjustment(
  moves: TaskMove[],
  simTasks: Task[],
  baselineTasks: Task[]
): AdjustmentSummary {
  const baseStatus = new Map(baselineTasks.map((t) => [t.id, t.status]));
  let newlyConflict = 0;
  let newlyFragile = 0;
  let newlyOverdue = 0;

  for (const t of simTasks) {
    const before = baseStatus.get(t.id);
    if (t.status === "conflict" && before !== "conflict") newlyConflict++;
    if (t.status === "fragile" && before !== "fragile") newlyFragile++;
    if (t.status === "overdue" && before !== "overdue") newlyOverdue++;
  }

  let maxPushDays = 0;
  for (const m of moves) {
    const days = Math.round(
      (parseProgrammeDate(m.toStart).getTime() - parseProgrammeDate(m.fromStart).getTime()) / 86400000
    );
    if (days > maxPushDays) maxPushDays = days;
  }

  return { shifted: moves.length, newlyConflict, newlyFragile, newlyOverdue, maxPushDays };
}

function shortName(task?: Task): string {
  if (!task) return "Unknown task";
  return task.name.split(" — ")[0] || task.name;
}

function dedupeWarnings(warnings: AdjustmentWarning[]): AdjustmentWarning[] {
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.kind}:${[...w.taskIds].sort().join("-")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
