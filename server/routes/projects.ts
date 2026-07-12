/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { validate } from "../middleware/validate";
import {
  projectCreateSchema, costLineAddSchema, revenueSchema, projectStatusSchema,
  projectRatesSchema, projectImportSchema,
} from "../validation/schemas";

export const projectsRouter = Router();

// GET /api/v1/projects: details of general Tier 1/2 commercial programs
projectsRouter.get("/projects", (_req, res) => {
  res.json(dbInstance.projects);
});

// POST /api/v1/projects: create a new project contract
projectsRouter.post("/projects", validate(projectCreateSchema), (req, res) => {
  const db = dbInstance;
  const { name, type, location, contractor, state, originalContractSum, plannedCost, ldRatePerDay, pcEndDate, retentionPercent, budgetLines, revenueReceived } = req.body;
  if (!name || !contractor) {
    return res.status(400).json({ error: "Missing required fields: name and contractor" });
  }
  const val = parseFloat(originalContractSum) || 5.0;
  const parsedLdRate = ldRatePerDay !== undefined && !isNaN(parseFloat(ldRatePerDay)) ? parseFloat(ldRatePerDay) : val * 1000;
  const parsedRetention = retentionPercent !== undefined && !isNaN(parseFloat(retentionPercent)) ? parseFloat(retentionPercent) : 5.0;

  // Cost line amounts are real dollars (Labour, Materials, Subcontractors, Plant, custom).
  const cleanLines = Array.isArray(budgetLines)
    ? budgetLines
        .map((l: any, i: number) => ({
          id: `bl-${Date.now()}-${i}`,
          label: String(l?.label || "").trim() || "Cost line",
          category: String(l?.category || "Materials"),
          amount: parseFloat(l?.amount) || 0,
        }))
        .filter((l: any) => l.amount > 0)
    : [];
  const linesTotalDollars = cleanLines.reduce((acc: number, l: any) => acc + l.amount, 0);
  // Planned cost ($M, legacy contract-level field) = sum of the dollar budget
  // lines, else whatever the caller specified directly, else the old 85%-of-contract default.
  const parsedPlannedCost = linesTotalDollars > 0
    ? linesTotalDollars / 1_000_000
    : plannedCost !== undefined && !isNaN(parseFloat(plannedCost))
      ? parseFloat(plannedCost)
      : val * 0.85;

  const newProject = {
    id: `p${db.projects.length + 1}`,
    name,
    type: type || "Commercial construction",
    location: location || "Sydney NSW",
    contractor,
    state: state || "NSW",
    originalContractSum: val,
    finalContractSum: val,
    plannedCost: parsedPlannedCost,
    actualCost: 0,
    ldRatePerDay: parsedLdRate,
    pcStartDate: new Date().toISOString().split("T")[0],
    pcEndDate: pcEndDate || new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split("T")[0], // 6 months out
    retentionPercent: parsedRetention,
    status: "ACTIVE" as const,
    progress: 0,
    weatherRisk: false,
    overBudget: false,
    budgetLines: cleanLines,
    actualLines: [] as typeof cleanLines,
    // Real dollars, not millions.
    revenueReceived: revenueReceived !== undefined && !isNaN(parseFloat(revenueReceived)) ? parseFloat(revenueReceived) : 0,
  };
  db.projects.push(newProject);
  db.save();
  res.json(newProject);
});

// POST /api/v1/projects/:id/cost-lines: add an actual (incurred) cost line
// while the project is in progress (material overrun, a swapped person,
// extra plant hire, etc).
projectsRouter.post("/projects/:id/cost-lines", validate(costLineAddSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { label, category, amount } = req.body || {};
  const project = db.projects.find(p => p.id === id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Invalid cost amount" });
  }

  const line = {
    id: `al-${Date.now()}`,
    label: String(label || "").trim() || "Cost line",
    category: String(category || "Materials"),
    amount: parsedAmount,
  };
  project.actualLines = [...(project.actualLines || []), line];
  // actualCost ($M, legacy contract-level field) = sum of all actual dollar lines / 1e6.
  // Labour is one of those lines (seeded, or added here), not schedule-derived.
  const actualLinesTotalDollars = project.actualLines.reduce((acc, l) => acc + l.amount, 0);
  project.actualCost = Math.round((actualLinesTotalDollars / 1_000_000) * 1000) / 1000;
  project.overBudget = project.actualCost > project.plannedCost;
  db.save();
  res.json({ success: true, project });
});

// POST /api/v1/projects/:id/revenue: set the revenue received so far
projectsRouter.post("/projects/:id/revenue", validate(revenueSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { revenueReceived } = req.body || {};
  const project = db.projects.find(p => p.id === id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const parsed = parseFloat(revenueReceived);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return res.status(400).json({ error: "Invalid revenue amount" });
  }
  project.revenueReceived = parsed;
  db.save();
  res.json({ success: true, project });
});

// POST /api/v1/projects/:id/status: finish (mark COMPLETED) or reopen (back to ACTIVE)
projectsRouter.post("/projects/:id/status", validate(projectStatusSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { status } = req.body || {};
  const project = db.projects.find(p => p.id === id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (status !== "COMPLETED" && status !== "ACTIVE") {
    return res.status(400).json({ error: "status must be COMPLETED or ACTIVE" });
  }
  project.status = status;
  if (status === "COMPLETED") project.progress = 100;
  db.save();
  res.json({ success: true, project });
});

// POST /api/v1/projects/:id/rates: set project rate overrides for resources
projectsRouter.post("/projects/:id/rates", validate(projectRatesSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { resourceRates } = req.body;

  if (!resourceRates) {
    return res.status(400).json({ error: "Missing resource rates" });
  }

  db.resources.forEach(r => {
    if (!r.projectRateOverrides) {
      r.projectRateOverrides = {};
    }
    if (resourceRates[r.id] !== undefined) {
      const rateVal = parseInt(resourceRates[r.id]);
      if (isNaN(rateVal) || rateVal <= 0) {
        delete r.projectRateOverrides[id];
      } else {
        r.projectRateOverrides[id] = rateVal;
      }
    }
  });

  db.save();
  res.json({ success: true, resources: db.resources });
});

// POST /api/v1/projects/import — bulk import projects (CSV rows or a sample set)
projectsRouter.post("/projects/import", validate(projectImportSchema), (req, res) => {
  const db = dbInstance;
  const { rows, sample } = req.body || {};

  const SAMPLE_ROWS = [
    { name: "Wollongong Marina Precinct", type: "Mixed-use development", location: "Wollongong NSW", contractor: "Richard Crookes", state: "NSW", contractValue: 44, ldRatePerDay: 44000, pcEndDate: "2027-04-30" },
    { name: "Ballarat Civic Plaza", type: "Commercial office", location: "Ballarat VIC", contractor: "Kane Constructions", state: "VIC", contractValue: 28, ldRatePerDay: 28000, pcEndDate: "2027-03-15" },
  ];
  const source: any[] = sample ? SAMPLE_ROWS : (Array.isArray(rows) ? rows : []);
  if (!source.length) {
    return res.status(400).json({ success: false, error: "No rows to import. Provide rows[] or sample:true." });
  }

  let nextNum = db.projects.length + 1;
  const created = source.map((row) => {
    const val = parseFloat(row.contractValue ?? row.originalContractSum) || 10;
    const ld = parseFloat(row.ldRatePerDay) || val * 1000;
    const proj = {
      id: `p${nextNum++}`,
      name: row.name || `Imported Project ${nextNum}`,
      type: row.type || "Commercial construction",
      location: row.location || "Sydney NSW",
      contractor: row.contractor || "TBC",
      state: row.state || "NSW",
      originalContractSum: val,
      finalContractSum: val,
      plannedCost: val * 0.85,
      actualCost: 0,
      ldRatePerDay: ld,
      pcStartDate: new Date().toISOString().split("T")[0],
      pcEndDate: row.pcEndDate || new Date(Date.now() + 240 * 24 * 3600 * 1000).toISOString().split("T")[0],
      retentionPercent: 5.0,
      status: "ACTIVE" as const,
      progress: 0,
      weatherRisk: false,
      overBudget: false,
    };
    db.projects.push(proj);
    return proj;
  });

  db.save();
  res.json({ success: true, imported: created.length, projects: created });
});
