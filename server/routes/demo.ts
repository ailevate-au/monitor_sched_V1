/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { runConflictDetection } from "../../src/server/conflictEngine";
import { setStormScenario } from "../../src/server/bomWeather";
import { buildBaselineTasks } from "../../src/server/seedData";
import { buildProblemsResponse } from "../services/problems";

// DEMO CONTROLS — drives the live "no issue → issue → resolved" story.
// Simulate: a fresh batch of work lands and the portfolio sprouts the full set
//   of problems (two double-bookings, a late job, a tight handover, a storm).
// Reset:    put everything back to the clean baseline → "Everything's on track".
export const demoRouter = Router();

const setTask = (id: string, patch: Record<string, any>) => {
  const t = dbInstance.tasks.find(x => x.id === id);
  if (t) Object.assign(t, patch);
};

demoRouter.post("/demo/simulate", (_req, res) => {
  const db = dbInstance;
  // 1) Ben double-booked — basement formwork reassigned onto his Level-4 pour week
  setTask("TSK-P2-03", { assigneeId: "r1", start: "2026-06-03", end: "2026-06-09", durationDays: 5, percent_complete: 0, status: "scheduled" });
  // 2) Tom double-booked — main-core piling pulled back to clash with his north piling
  setTask("TSK-P3-01", { assigneeId: "r4", start: "2026-06-01", end: "2026-06-19", durationDays: 15, percent_complete: 0, status: "scheduled" });
  // 3) A job running late — excavation stalled at 85%, past its end date
  setTask("TSK-P2-01", { percent_complete: 85, status: "overdue" });
  // 4) A tight handover — Chris's fitout pulled up hard against the steel frame finishing
  setTask("TSK-P1-04", { start: "2026-06-29", end: "2026-07-17", durationDays: 14 });
  // 5) A storm hits mid-week (NSW only — Parramatta is exposed, interstate jobs aren't).
  //    Pull a clean NSW job (Sam's cost report) into the storm window so the weather
  //    risk surfaces on a job that isn't already a clash.
  setStormScenario(true);
  setTask("TSK-P1-03", { start: "2026-06-03", end: "2026-06-09", durationDays: 5 });
  // 6) A job with nobody assigned — the new batch left Southbank's services rough-in unstaffed
  setTask("TSK-P3-02", { assigneeId: null });
  runConflictDetection();
  db.save();
  res.json({ success: true, ...buildProblemsResponse() });
});

demoRouter.post("/demo/reset", (_req, res) => {
  const db = dbInstance;
  // FULL restore to the seeded baseline. Rebuilding every task from the seed
  // (rather than nudging a handful) means "Reset to clean" is truly clean — it
  // scrubs ANY manual drags/edits/created tasks, not just the scripted scenario,
  // and always returns to 0 issues.
  db.tasks = buildBaselineTasks();
  setStormScenario(false);
  runConflictDetection();
  db.save();
  res.json({ success: true, ...buildProblemsResponse() });
});
