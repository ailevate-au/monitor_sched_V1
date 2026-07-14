import { Router } from "express";
import { dbInstance } from "../../src/server/db";

// Team-member views ("my work") + PM alert feed.
export const myRouter = Router();

myRouter.get("/my/assignments", (req, res) => {
  const db = dbInstance;
  const assigneeId = (req.query.assigneeId as string) || "r1";
  const myTasks = db.tasks.filter(t => t.assigneeId === assigneeId);
  const payload = myTasks.map(t => {
    const p = db.projects.find(proj => proj.id === t.projectId);
    const r = db.resources.find(rs => rs.id === t.assigneeId);
    return {
      ...t,
      project: p ? p.name : "Unknown",
      assignee: r ? r.name : "Unassigned",
      trade: r ? r.trade : t.tradeRequired,
    };
  });
  res.json(payload);
});

myRouter.get("/my/schedule", (req, res) => {
  const db = dbInstance;
  const assigneeId = (req.query.assigneeId as string) || "r1";
  const myTasks = db.tasks.filter(t => t.assigneeId === assigneeId).sort((a, b) => a.start.localeCompare(b.start));
  const payload = myTasks.map(t => {
    const p = db.projects.find(proj => proj.id === t.projectId);
    const r = db.resources.find(rs => rs.id === t.assigneeId);
    return {
      ...t,
      project: p ? p.name : "Unknown",
      assignee: r ? r.name : "Unassigned",
      trade: r ? r.trade : t.tradeRequired,
    };
  });
  res.json(payload);
});

myRouter.get("/my/notifications", (_req, res) => {
  res.json(dbInstance.alerts);
});

// Endpoints to get list of running alerts for PM overview
myRouter.get("/pm/alerts", (_req, res) => {
  res.json(dbInstance.alerts);
});

// Resolve / Dismiss PM Alert
myRouter.post("/pm/alerts/:id/resolve", (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  db.alerts = db.alerts.filter(a => a.id !== id);
  db.save();
  res.json({ success: true, alerts: db.alerts });
});
