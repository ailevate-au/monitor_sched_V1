/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { runConflictDetection, computeCascade } from "../../src/server/conflictEngine";
import { validate } from "../middleware/validate";
import {
  taskCreateSchema, taskUpdateSchema, taskStatusSchema, taskRestoreSchema, taskProgressSchema,
} from "../validation/schemas";
import { applyShift, buildProblemsResponse } from "../services/problems";

export const tasksRouter = Router();

// GET /api/v1/tasks: full project timelines for Gantt grid
tasksRouter.get("/tasks", (_req, res) => {
  res.json(dbInstance.tasks);
});

// POST /api/v1/tasks/create: Add a brand new task
tasksRouter.post("/tasks/create", validate(taskCreateSchema), (req, res) => {
  const db = dbInstance;
  const {
    project,
    name,
    start,
    end,
    deadline,
    dependencies,
    lag_days,
    dependency_type,
    assigneeId,
    trade,
    cost_override,
    cost_override_type,
  } = req.body;

  if (!name || !project || !start || !end) {
    return res.status(400).json({ error: "Missing required fields: project, name, start, and end" });
  }

  const proj = db.projects.find(p => p.name === project || p.id === project);
  if (!proj) {
    return res.status(400).json({ error: "Project not found" });
  }

  const newIdNum = db.tasks.length + 1;
  const id = `TSK-${String(newIdNum).padStart(3, "0")}`;

  let assigneeName = "Unassigned";
  if (assigneeId) {
    const resObj = db.resources.find(r => r.id === assigneeId);
    assigneeName = resObj ? resObj.name : "Unassigned";
  }

  const d1 = new Date(start);
  const d2 = new Date(end);
  const diffTime = d2.getTime() - d1.getTime();
  const durationDays = Math.max(1, Math.round(diffTime / (1000 * 3600 * 24)) + 1);

  const newTask: any = {
    id,
    projectId: proj.id,
    name,
    start,
    end,
    deadline: deadline || end,
    durationDays,
    assigneeId: assigneeId || null,
    assignee: assigneeName,
    trade: trade || "Labour",
    dependencies: dependencies || "",
    status: "scheduled",
    lag_days: parseInt(lag_days) || 0,
    dependency_type: dependency_type === "SS" ? "SS" : "FS",
    cost_override: cost_override !== undefined && cost_override !== null ? parseFloat(cost_override) : null,
    cost_override_type: cost_override_type || null,
    percent_complete: 0,
  };

  db.tasks.push(newTask);
  runConflictDetection();
  db.save();
  res.json({ success: true, task: newTask, tasks: db.tasks });
});

// POST /api/v1/tasks/:id/update: reschedule a task, option to cascade dependencies
tasksRouter.post("/tasks/:id/update", validate(taskUpdateSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const {
    start,
    end,
    deadline,
    cascade,
    name,
    dependencies,
    lag_days,
    dependency_type,
    cost_override,
    cost_override_type,
    assigneeId,
    trade,
    percent_complete,
  } = req.body;

  const task = db.tasks.find(t => t.id === id) as any;
  if (!task) return res.status(404).json({ error: "Task not found" });

  if (name !== undefined) task.name = name;
  if (deadline !== undefined) task.deadline = deadline || null;
  if (dependencies !== undefined) task.dependencies = dependencies;
  if (lag_days !== undefined) task.lag_days = parseInt(lag_days) || 0;
  if (dependency_type !== undefined) task.dependency_type = dependency_type === "SS" ? "SS" : "FS";
  if (cost_override !== undefined) task.cost_override = cost_override !== null ? parseFloat(cost_override) : null;
  if (cost_override_type !== undefined) task.cost_override_type = cost_override_type;

  if (assigneeId !== undefined) {
    task.assigneeId = assigneeId;
    if (assigneeId === null) {
      task.assignee = "Unassigned";
    } else {
      const resObj = db.resources.find(r => r.id === assigneeId);
      task.assignee = resObj ? resObj.name : "Unassigned";
    }
  }
  if (trade !== undefined) task.trade = trade;
  if (percent_complete !== undefined) task.percent_complete = parseInt(percent_complete) || 0;

  const hasStartChange = start !== undefined && start !== task.start;
  const hasEndChange = end !== undefined && end !== task.end;

  if (start !== undefined) task.start = start;
  if (end !== undefined) task.end = end;

  if (start !== undefined || end !== undefined) {
    const d1 = new Date(task.start);
    const d2 = new Date(task.end);
    const diffTime = d2.getTime() - d1.getTime();
    task.durationDays = Math.max(1, Math.round(diffTime / (1000 * 3600 * 24)) + 1);
  }

  if (cascade && (hasStartChange || hasEndChange)) {
    // Task already set to explicit user-picked dates above.
    // Cascade only downstream dependents from this new anchor.
    db.tasks = computeCascade(db.tasks, id, 0, "NSW");
  }

  runConflictDetection();
  db.save();
  res.json({ success: true, tasks: db.tasks });
});

// POST /api/v1/tasks/:id/status — PM-driven lifecycle change.
// "delayed" does a REAL cascade (shifts the task + dependents), which can create
// cross-project clashes the PM can't see but the Owner will. Returns the refreshed
// problem summary so the UI can say "this created N new issue(s)".
tasksRouter.post("/tasks/:id/status", validate(taskStatusSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { pmStatus, delayDays } = req.body || {};
  const task = db.tasks.find(t => t.id === id) as any;
  if (!task) return res.status(404).json({ success: false, error: "Task not found" });

  const before = buildProblemsResponse().summary.total;

  if (pmStatus === "complete") {
    task.percent_complete = 100;
    task.status = "completed";
    task.pmStatus = "complete";
  } else if (pmStatus === "in_progress") {
    // "In progress" = work is underway (no percentage tracking). Force the
    // completion value below 100 so a job that was marked Complete flips back
    // off "complete" — the engine then re-derives the live status from dates.
    task.percent_complete = 50;
    task.status = "inprogress";
    task.pmStatus = "in_progress";
  } else if (pmStatus === "not_started") {
    task.percent_complete = 0;
    task.status = "scheduled";
    task.pmStatus = "not_started";
  } else if (pmStatus === "delayed") {
    const days = parseInt(delayDays, 10) || 0;
    if (days !== 0) applyShift(id, days);
    task.pmStatus = "delayed";
  } else {
    return res.status(400).json({ success: false, error: `Unknown status: ${pmStatus}` });
  }

  runConflictDetection();
  db.save();
  const refreshed = buildProblemsResponse();
  res.json({
    success: true,
    newIssues: Math.max(0, refreshed.summary.total - before),
    ...refreshed,
    tasks: db.tasks,
  });
});

// POST /api/v1/tasks/restore — revert tasks to a client-supplied snapshot.
// Powers the Timeline "Undo last change": if a save created clashes, restore the
// previous dates/assignees in one shot and re-run detection.
tasksRouter.post("/tasks/restore", validate(taskRestoreSchema), (req, res) => {
  const db = dbInstance;
  const { tasks } = req.body || {};
  if (!Array.isArray(tasks)) return res.status(400).json({ success: false, error: "Missing tasks snapshot" });
  for (const s of tasks) {
    const t = db.tasks.find(x => x.id === s.id) as any;
    if (!t) continue;
    if (s.start !== undefined) t.start = s.start;
    if (s.end !== undefined) t.end = s.end;
    if (s.durationDays !== undefined) t.durationDays = s.durationDays;
    if (Object.prototype.hasOwnProperty.call(s, "assigneeId")) t.assigneeId = s.assigneeId;
    if (s.percent_complete !== undefined) t.percent_complete = s.percent_complete;
  }
  runConflictDetection();
  db.save();
  res.json({ success: true, tasks: db.tasks });
});

// PATCH /api/v1/tasks/:id/progress — team-member progress/status report.
tasksRouter.patch("/tasks/:id/progress", validate(taskProgressSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { status, percent_complete, reportBehind } = req.body;

  const task = db.tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const reporterName = "Ben Nguyen"; // Simulated logged-in team member

  if (reportBehind) {
    // Team member reports behind schedule: does NOT auto-cascade, instead
    // triggers a PM Alert listing the downstream tasks affected.
    const affected: string[] = [];
    const queue = [task.id];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);

      const deps = db.tasks.filter(t => (t.dependencies || "").split(",").map(d => d.trim()).includes(curr));
      for (const dep of deps) {
        if (!affected.includes(`${dep.id} ${dep.name}`)) {
          affected.push(`${dep.id} ${dep.name}`);
          queue.push(dep.id);
        }
      }
    }

    const delayDays = 3; // Simulated projected delay days
    const currentEnd = new Date(task.end);
    const projEnd = new Date(currentEnd.getTime() + delayDays * 24 * 3600 * 1000);
    const projEndDateStr = projEnd.toISOString().slice(0, 10);

    const alertMsg = `${task.id} ${task.name} is running behind. Projected completion: ${projEndDateStr}. Potential delay: ${delayDays} days. Downstream tasks affected: ${affected.length > 0 ? affected.join(", ") : "None"}.`;

    const newAlert = {
      id: "alert-" + Date.now(),
      taskId: task.id,
      taskName: task.name,
      reporterName,
      message: alertMsg,
      type: "delay",
      timestamp: new Date().toISOString(),
      projectedCompletion: projEndDateStr,
      delayDays,
      downstreamAffected: affected,
    };

    db.alerts.unshift(newAlert);
    task.status = "overdue";
    task.percent_complete = percent_complete !== undefined ? percent_complete : 15;
  } else {
    // Normal progress updates
    if (percent_complete !== undefined) {
      task.percent_complete = percent_complete;
    }
    if (status) {
      if (status === "completed") {
        task.status = "completed";
        task.percent_complete = 100;
      } else if (status === "inprogress") {
        task.status = "inprogress";
        task.percent_complete = Math.max(10, task.percent_complete || 40);
      } else {
        task.status = status;
      }
    }

    const normalMsg = `${task.id} reported as ${status || "active"} by ${reporterName} (Complete: ${task.percent_complete || 0}%) at ${new Date().toLocaleTimeString()}`;
    const progressAlert = {
      id: "alert-" + Date.now(),
      taskId: task.id,
      taskName: task.name,
      reporterName,
      message: normalMsg,
      type: "progress",
      timestamp: new Date().toISOString(),
    };
    db.alerts.unshift(progressAlert);
  }

  db.save();
  res.json({ success: true, task, alerts: db.alerts });
});
