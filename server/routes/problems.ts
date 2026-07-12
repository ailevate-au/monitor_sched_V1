/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { runConflictDetection } from "../../src/server/conflictEngine";
import { validate } from "../middleware/validate";
import { problemResolveSchema } from "../validation/schemas";
import { applyShift, buildProblemsResponse } from "../services/problems";

export const problemsRouter = Router();

problemsRouter.get("/problems", (_req, res) => {
  res.json(buildProblemsResponse());
});

problemsRouter.post("/problems/:id/resolve", validate(problemResolveSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { actionId } = req.body || {};
  if (!actionId) return res.status(400).json({ success: false, error: "Missing actionId" });

  const parts = String(actionId).split(":");
  const kind = parts[0];

  try {
    if (kind === "reassign") {
      const targetResourceId = parts[1];
      // Resolve the task tied to this problem (conflict or late).
      let task: any;
      if (id.startsWith("prob-conflict-")) {
        const rid = id.replace("prob-conflict-", "");
        task = db.tasks.find(t => t.assigneeId === rid && t.status === "conflict");
      } else if (id.startsWith("prob-late-")) {
        task = db.tasks.find(t => t.id === id.replace("prob-late-", ""));
      }
      if (!task) return res.status(404).json({ success: false, error: "No task found for this problem" });
      db.undoStack.push({ targetId: task.id, prevAssigneeId: task.assigneeId });
      db.conflictResolutionLog.push({ resourceId: task.assigneeId || "", resolvedAt: new Date().toISOString(), undone: false });
      task.assigneeId = targetResourceId;
    } else if (kind === "assign") {
      // assign:<taskId>:<resourceId> — put someone on an unassigned job.
      const targetTask = db.tasks.find(t => t.id === parts[1]);
      if (!targetTask) return res.status(404).json({ success: false, error: "No task found for this problem" });
      db.undoStack.push({ targetId: targetTask.id, prevAssigneeId: targetTask.assigneeId });
      targetTask.assigneeId = parts[2];
    } else if (kind === "shift") {
      applyShift(parts[1], parseInt(parts[2], 10) || 0);
    } else if (kind === "shiftmany") {
      const ids = parts[1].split(",");
      const delay = parseInt(parts[2], 10) || 0;
      ids.forEach(tid => applyShift(tid, delay));
    } else {
      return res.status(400).json({ success: false, error: `Unknown action: ${actionId}` });
    }

    runConflictDetection();
    db.save();
    return res.json({ success: true, message: "Problem resolved.", ...buildProblemsResponse() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to resolve problem" });
  }
});
