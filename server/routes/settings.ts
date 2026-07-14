import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { runConflictDetection } from "../../src/server/conflictEngine";
import { validate } from "../middleware/validate";
import { settingsSchema } from "../validation/schemas";
import { buildProblemsResponse } from "../services/problems";

// Programme settings (demo scheduling knobs, in-memory): the tight-handover
// control (on/off + working-day buffer) and the opt-in deadline warnings.
// Changing them re-runs detection and returns the refreshed feed so the UI
// updates live.
export const settingsRouter = Router();

settingsRouter.get("/settings", (_req, res) => {
  res.json(dbInstance.settings);
});

settingsRouter.put("/settings", validate(settingsSchema), (req, res) => {
  const db = dbInstance;
  const th = (req.body || {}).tightHandover || {};
  if (typeof th.enabled === "boolean") {
    db.settings.tightHandover.enabled = th.enabled;
  }
  if (th.thresholdDays !== undefined) {
    const n = parseInt(th.thresholdDays, 10);
    if (!Number.isNaN(n)) {
      db.settings.tightHandover.thresholdDays = Math.min(10, Math.max(0, n));
    }
  }
  const dw = (req.body || {}).deadlineWarnings || {};
  if (typeof dw.enabled === "boolean") {
    db.settings.deadlineWarnings.enabled = dw.enabled;
  }
  runConflictDetection();
  db.save();
  res.json({ success: true, settings: db.settings, ...buildProblemsResponse() });
});
