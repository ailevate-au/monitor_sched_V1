import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { getBOMForecast } from "../../src/server/bomWeather";
import { calculateTaskCost } from "../../src/server/taskCost";
import { buildProblemsResponse } from "../services/problems";

export const dashboardRouter = Router();

// GET /api/v1/dashboard: portfolio statistics and top-level summaries.
// Total Issues is the SAME number the Problems hub and sidebar show, so every
// screen agrees on one count.
dashboardRouter.get("/dashboard", (_req, res) => {
  const db = dbInstance;
  const weather = getBOMForecast();

  const { summary } = buildProblemsResponse();
  const activeProjects = db.projects.filter(p => p.status === "ACTIVE").length;
  const activeProjectIds = new Set(db.projects.filter(p => p.status === "ACTIVE").map(p => p.id));
  const unassignedCount = db.tasks.filter(
    t => !t.assigneeId && t.status !== "completed" && activeProjectIds.has(t.projectId)
  ).length;

  // On-track % = share of live (not-completed) tasks with no problem flag.
  const live = db.tasks.filter(t => t.status !== "completed" && (t.percent_complete ?? 0) < 100);
  const okTasks = live.filter(t => !["conflict", "overdue", "weather", "fragile"].includes(t.status)).length;
  const onTrackPct = live.length === 0 ? 100 : Math.round((okTasks / live.length) * 100);

  const stormDays = weather.filter(d => d.risk !== "ok").length;

  res.json({
    activeProjectsCount: activeProjects,
    onProgrammePct: onTrackPct,
    // unified issue counts (same as Problems hub + sidebar)
    totalIssues: summary.total,
    criticalIssues: summary.critical,
    projectsAffected: summary.projectsAffected,
    // kept for backward-compat with older callers
    resourceConflictsCount: summary.total,
    // jobs on active projects with nobody assigned (an issue the owner can act on)
    unassignedCount,
    weatherAlert: {
      severity: stormDays > 0 ? "warning" : "ok",
      title: "Weather",
      text: stormDays > 0
        ? "Rain or storms forecast this week. Some outdoor work may be affected."
        : "Clear week ahead. No weather risk to site work.",
      forecast: weather,
    },
  });
});

// GET /api/v1/dashboard/tasks: filtered list of all scheduled tasks
dashboardRouter.get("/dashboard/tasks", (req, res) => {
  const db = dbInstance;
  const { status, project } = req.query;

  let filtered = db.tasks;
  if (status && status !== "all") {
    filtered = filtered.filter(t => t.status === status);
  }
  if (project && project !== "all") {
    filtered = filtered.filter(t => {
      const pObj = db.projects.find(p => p.id === t.projectId);
      return pObj && pObj.name === project;
    });
  }

  // Join Project Name and Assignee Name
  const payload = filtered.map(t => {
    const p = db.projects.find(proj => proj.id === t.projectId);
    const r = db.resources.find(rs => rs.id === t.assigneeId);
    const calculatedCost = calculateTaskCost(t, r);

    let rateDisplay = r ? r.rate : "A$0/hr";
    if (t.cost_override !== null && t.cost_override !== undefined) {
      const type = t.cost_override_type || "hourly";
      if (type === "hourly") rateDisplay = `A$${t.cost_override}/hr (Override)`;
      else if (type === "daily") rateDisplay = `A$${t.cost_override}/day (Override)`;
      else if (type === "lump_sum") rateDisplay = `A$${t.cost_override} Flat (Override)`;
    } else if (r) {
      let baseRate = r.hourlyRateVal || 75;
      let suffix = "";
      if (r.projectRateOverrides && r.projectRateOverrides[t.projectId] !== undefined) {
        baseRate = r.projectRateOverrides[t.projectId];
        suffix = " (Proj Override)";
      }
      rateDisplay = `A$${baseRate}/hr${suffix}`;
    }

    return {
      ...t,
      project: p ? p.name : "Unknown",
      assignee: r ? r.name : "Unassigned",
      trade: r ? r.trade : t.tradeRequired,
      rate: rateDisplay,
      calculatedCostVal: calculatedCost,
    };
  });

  res.json(payload);
});
