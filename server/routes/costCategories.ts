import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { validate } from "../middleware/validate";
import { costCategorySchema } from "../validation/schemas";

export const costCategoriesRouter = Router();

costCategoriesRouter.get("/cost_categories", (_req, res) => {
  res.json(dbInstance.costCategories);
});

costCategoriesRouter.post("/cost_categories", validate(costCategorySchema), (req, res) => {
  const db = dbInstance;
  const { id, name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  if (id) {
    // Edit
    const existing = db.costCategories.find(c => c.id === id);
    if (existing) {
      existing.name = name;
    }
  } else {
    // Add
    const newCat = {
      id: "cc-" + Math.random().toString(36).slice(2, 9),
      name,
      is_active: true,
      sort_order: db.costCategories.length + 1,
    };
    db.costCategories.push(newCat);
  }
  db.save();
  res.json(db.costCategories);
});

costCategoriesRouter.post("/cost_categories/:id/toggle", (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const existing = db.costCategories.find(c => c.id === id);
  if (existing) {
    existing.is_active = !existing.is_active;
    db.save();
  }
  res.json(db.costCategories);
});
