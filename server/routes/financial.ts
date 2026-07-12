import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { sumProjectScheduledCost } from "../../src/server/taskCost";
import { validate } from "../middleware/validate";
import { varianceSchema } from "../validation/schemas";

// FINANCIAL APIs (AS 4000-1997 audit specifications)
export const financialRouter = Router();

financialRouter.get("/financial/projects/:id", (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const project = db.projects.find(p => p.id === id);

  if (!project) return res.status(404).json({ error: "Project not found" });

  // Financial calculations per guidelines
  const profit = project.finalContractSum - project.actualCost;
  const rawMargin = (project.finalContractSum - project.actualCost) / project.finalContractSum;
  const margin = Math.round(rawMargin * 1000) / 10; // decimal rounded margin

  const costOverrun = project.actualCost - project.plannedCost;
  const revenueVariance = project.finalContractSum - project.originalContractSum;

  // Sum matching progress claims retention
  const pClaims = db.claims.filter(cl => cl.projectId === id);
  const totalRetention = pClaims.reduce((acc, curr) => acc + curr.retentionVal, 0);

  const scheduledCostVal = sumProjectScheduledCost(db.tasks, db.resources, id);

  // Projected vs actual: the project's own budget/actual cost lines
  // (Labour, Materials, Subcontractors, Plant, custom), in real dollars.
  const budgetLines = project.budgetLines || [];
  const actualLines = project.actualLines || [];
  const budgetLinesTotalDollars = budgetLines.reduce((acc, l) => acc + l.amount, 0);
  const actualLinesTotalDollars = actualLines.reduce((acc, l) => acc + l.amount, 0);
  const revenueDollars = project.revenueReceived ?? 0;
  const contractSumDollars = project.finalContractSum * 1_000_000;
  const projectedProfitDollars = Math.round(contractSumDollars - budgetLinesTotalDollars);
  const actualProfitDollars = Math.round(revenueDollars - actualLinesTotalDollars);

  // Per-category Expected vs Actual vs Variance — the clean breakdown the
  // Finance project drawer renders (union of every category that appears in
  // either the budget or actual lines, so a one-off actual-only line shows too).
  const categoryOrder = ["Labour", "Materials", "Subcontractors", "Plant & Equipment", "Machinery"];
  const categories = new Set<string>([
    ...categoryOrder.filter((c) => budgetLines.some((l) => l.category === c) || actualLines.some((l) => l.category === c)),
    ...budgetLines.map((l) => l.category),
    ...actualLines.map((l) => l.category),
  ]);
  const categoryBreakdown = Array.from(categories).map((category) => {
    const expected = budgetLines.filter((l) => l.category === category).reduce((acc, l) => acc + l.amount, 0);
    const actual = actualLines.filter((l) => l.category === category).reduce((acc, l) => acc + l.amount, 0);
    return { category, expected, actual, variance: actual - expected };
  });

  res.json({
    name: project.name,
    contractSumVal: project.finalContractSum,
    plannedCostVal: project.plannedCost,
    actualCostVal: project.actualCost,
    scheduledCostVal,
    profitVal: Math.round(profit * 100) / 100,
    marginVal: margin,
    costOverrunVal: Math.round(costOverrun * 100) / 100,
    revenueVarianceVal: Math.round(revenueVariance * 100) / 100,
    retentionBalanceVal: totalRetention,
    // Derived from the project's own ldRatePerDay; assumes a 10 working-day
    // overrun once a project is flagged over budget.
    ldExposure: project.overBudget ? project.ldRatePerDay * 10 : 0,
    budgetLines,
    actualLines,
    // Dollar-native fields — use fmtMoney (src/lib/money.ts) on the client.
    categoryBreakdown,
    budgetLinesTotalDollars,
    actualLinesTotalDollars,
    revenueDollars,
    contractSumDollars,
    projectedProfitDollars,
    actualProfitDollars,
    // Kept in A$M for the legacy Projected-vs-Actual tab / KPI cards.
    budgetLinesTotalVal: Math.round((budgetLinesTotalDollars / 1_000_000) * 1000) / 1000,
    actualLinesTotalVal: Math.round((actualLinesTotalDollars / 1_000_000) * 1000) / 1000,
    projectedFinalCostVal: Math.round((budgetLinesTotalDollars / 1_000_000) * 1000) / 1000,
    revenueReceivedVal: Math.round((revenueDollars / 1_000_000) * 1000) / 1000,
    projectedProfitVal: Math.round((projectedProfitDollars / 1_000_000) * 1000) / 1000,
    actualProfitVal: Math.round((actualProfitDollars / 1_000_000) * 1000) / 1000,
    status: project.status,
  });
});

// POST /api/v1/financial/variance: log custom building variations or costs
financialRouter.post("/financial/variance", validate(varianceSchema), (req, res) => {
  const db = dbInstance;
  const { projectId, description, amountVal, type } = req.body;
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: "Project contract not found" });

  const val = parseFloat(amountVal) || 0;
  if (type === "contract_sum_addition") {
    project.finalContractSum = Math.round((project.finalContractSum + val) * 10) / 10;
  } else {
    // Same actual-cost-line model as certify / POST /projects/:id/cost-lines —
    // keeps actualCost always derived from actualLines, never incremented directly.
    project.actualLines = [
      ...(project.actualLines || []),
      { id: `al-var-${Date.now()}`, label: description || "Variation", category: "Materials", amount: val * 1_000_000 },
    ];
    const actualLinesTotalDollars = project.actualLines.reduce((acc, l) => acc + l.amount, 0);
    project.actualCost = Math.round((actualLinesTotalDollars / 1_000_000) * 1000) / 1000;
    project.overBudget = project.actualCost > project.plannedCost;
  }
  db.save();
  res.json({ success: true, project });
});
