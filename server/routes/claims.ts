import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { validate } from "../middleware/validate";
import { claimCreateSchema, claimCertifySchema, claimUpdateSchema } from "../validation/schemas";

export const claimsRouter = Router();

// GET /api/v1/claims: progress claim lists
claimsRouter.get("/claims", (_req, res) => {
  res.json(dbInstance.claims);
});

// POST /api/v1/claims: claim submission
claimsRouter.post("/claims", validate(claimCreateSchema), (req, res) => {
  const db = dbInstance;
  const { projectId, claimedAmountVal, dueDate, costCategoryId, taskIds, description } = req.body;

  const proj = db.projects.find(p => p.id === projectId);
  if (!proj) return res.status(404).json({ error: "Project not found" });

  const category = costCategoryId
    ? db.costCategories.find(c => c.id === costCategoryId && c.is_active !== false)
    : db.costCategories.find(c => c.is_active !== false);
  if (costCategoryId && !category) {
    return res.status(400).json({ error: "Invalid or inactive cost category" });
  }

  const count = db.claims.filter(c => c.projectId === projectId).length + 3;
  const claimNo = `PC-0${count}`;

  const descText = typeof description === "string" ? description.trim().slice(0, 200) : "";

  const newClaim = {
    id: `cl-${Date.now()}`,
    claimNumber: claimNo,
    projectId,
    project: proj.name,
    period: "Current Period",
    claimedAmount: `A$${claimedAmountVal}M`,
    certifiedAmount: "A$0.0M",
    claimedVal: claimedAmountVal * 1000000,
    certifiedVal: 0,
    retentionVal: 0,
    dueDate: dueDate || "2026-06-30",
    status: "pending" as const,
    costCategoryId: category?.id || "cc1",
    costCategoryName: category?.name || "Labour",
    taskIds: typeof taskIds === "string" ? taskIds : "",
    description: descText,
  };

  db.claims.unshift(newClaim);
  db.save();
  res.json(newClaim);
});

// POST /api/v1/claims/:id/certify: certify progress claim, holding retention
claimsRouter.post("/claims/:id/certify", validate(claimCertifySchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { certifiedAmountVal } = req.body; // e.g., 3.1 for A$3.1M

  const claim = db.claims.find(c => c.id === id);
  if (!claim) return res.status(404).json({ error: "Progress claim not found" });

  const numericCertified = parseFloat(certifiedAmountVal) * 1000000;
  const project = db.projects.find(p => p.id === claim.projectId);
  const retentionPct = project?.retentionPercent ?? 5.0;
  const retention = Math.round(numericCertified * (retentionPct / 100));

  claim.status = "certified";
  claim.certifiedAmount = `A$${certifiedAmountVal}M`;
  claim.certifiedVal = numericCertified;
  claim.retentionVal = retention;

  // Certifying a claim is real incurred cost, so it becomes an actual cost
  // line (like a manual "Add cost" from the Projects tab) instead of
  // incrementing actualCost directly — keeps actualCost derived from
  // actualLines and the Finance category breakdown consistent.
  if (project) {
    project.actualLines = [
      ...(project.actualLines || []),
      {
        id: `al-claim-${claim.id}`,
        label: `Certified claim ${claim.claimNumber}`,
        category: claim.costCategoryName || "Materials",
        amount: numericCertified,
      },
    ];
    const actualLinesTotalDollars = project.actualLines.reduce((acc, l) => acc + l.amount, 0);
    project.actualCost = Math.round((actualLinesTotalDollars / 1_000_000) * 1000) / 1000;
    project.overBudget = project.actualCost > project.plannedCost;
  }

  db.save();
  res.json(claim);
});

// PUT /api/v1/claims/:id: update expense entry fields
claimsRouter.put("/claims/:id", validate(claimUpdateSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { claimedAmountVal, costCategoryId, description } = req.body;

  const claim = db.claims.find(c => c.id === id);
  if (!claim) return res.status(404).json({ error: "Expense not found" });

  const parsedAmount = Number(claimedAmountVal);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Invalid expense amount" });
  }

  const category = db.costCategories.find(c => c.id === costCategoryId && c.is_active !== false);
  if (!category) {
    return res.status(400).json({ error: "Invalid or inactive cost category" });
  }

  claim.claimedVal = parsedAmount * 1000000;
  claim.claimedAmount = `A$${parsedAmount}M`;
  claim.costCategoryId = category.id;
  claim.costCategoryName = category.name;
  claim.description = typeof description === "string" ? description.trim().slice(0, 200) : "";

  db.save();
  res.json(claim);
});

// DELETE /api/v1/claims/:id: remove/reject a claim still pending certification
claimsRouter.delete("/claims/:id", (req, res) => {
  const db = dbInstance;
  const { id } = req.params;

  const claim = db.claims.find(c => c.id === id);
  if (!claim) return res.status(404).json({ error: "Expense not found" });
  if (claim.status !== "pending") {
    return res.status(400).json({ error: "Only pending claims can be removed — this one is already certified/released" });
  }

  db.claims = db.claims.filter(c => c.id !== id);
  db.save();
  res.json({ ok: true });
});
