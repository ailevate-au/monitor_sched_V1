import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { runConflictDetection, getConflictHubPayload } from "../../src/server/conflictEngine";
import { validate } from "../middleware/validate";
import { conflictResolveSchema } from "../validation/schemas";

export const conflictsRouter = Router();

// GET /api/v1/conflicts: double-booking analysis + hub metrics
conflictsRouter.get("/conflicts", (_req, res) => {
  res.json(getConflictHubPayload());
});

// POST /api/v1/conflicts/:id/resolve: reassign candidate
conflictsRouter.post("/conflicts/:id/resolve", validate(conflictResolveSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params; // Conflict ID (format c-resourceId-timestamp)
  const { targetResourceId } = req.body;

  const resourceId = id.split("-")[1]; // extract resource ID

  // Find tasks assigned to this conflicted resource that are double booked
  const conflictedTasks = db.tasks.filter(t => t.assigneeId === resourceId && t.status === "conflict");

  if (conflictedTasks.length > 0) {
    // Reassign first conflicting task to the selected replacement candidate
    const targetTask = conflictedTasks[0];
    const prevAssigneeId = targetTask.assigneeId;

    targetTask.assigneeId = targetResourceId;

    // Save to undo log
    db.undoStack.push({
      targetId: targetTask.id,
      prevAssigneeId,
    });

    db.conflictResolutionLog.push({
      resourceId,
      resolvedAt: new Date().toISOString(),
      undone: false,
    });

    // Recalculately analyze allocations
    runConflictDetection();
    db.save();

    return res.json({
      success: true,
      message: "Resource reallocated, schedule conflict resolved",
      hub: getConflictHubPayload(),
    });
  }

  res.status(404).json({ error: "No active conflict found for resource" });
});

// POST /api/v1/conflicts/:id/undo: rollback last re-assignment
conflictsRouter.post("/conflicts/:id/undo", (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const resourceId = id.startsWith("c-") ? id.split("-")[1] : id;
  const lastAction = db.undoStack.pop();

  if (lastAction) {
    const task = db.tasks.find(t => t.id === lastAction.targetId);
    if (task) {
      task.assigneeId = lastAction.prevAssigneeId;

      const resolutionEntry = [...db.conflictResolutionLog]
        .reverse()
        .find(entry => entry.resourceId === resourceId && !entry.undone);
      if (resolutionEntry) {
        resolutionEntry.undone = true;
      }

      runConflictDetection();
      db.save();
      return res.json({
        success: true,
        message: "Rollback successful",
        hub: getConflictHubPayload(),
      });
    }
  }

  res.status(400).json({ error: "Nothing to undo" });
});

// GET /api/v1/conflicts/:id/candidates
conflictsRouter.get("/conflicts/:id/candidates", (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  let resourceId = id;
  if (id.startsWith("c-")) {
    resourceId = id.split("-")[1];
  }
  const resource = db.resources.find(r => r.id === resourceId);
  if (!resource) return res.status(404).json({ error: "Resource not found" });

  const candidates = db.resources.filter(r => r.id !== resourceId && r.trade === resource.trade);
  res.json(candidates);
});
