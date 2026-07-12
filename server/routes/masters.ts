/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { getMastersBundle, getMasterList, isMasterType, upsertMaster, toggleMaster } from "../../src/server/mastersStore";
import { validate } from "../middleware/validate";
import { masterUpsertSchema } from "../validation/schemas";

export const mastersRouter = Router();

mastersRouter.get("/masters", (req, res) => {
  const activeOnly = req.query.activeOnly === "true";
  res.json(getMastersBundle(activeOnly));
});

mastersRouter.get("/masters/:type", (req, res) => {
  const { type } = req.params;
  if (!isMasterType(type)) {
    return res.status(400).json({ error: "Invalid master type" });
  }
  const activeOnly = req.query.activeOnly === "true";
  res.json(getMasterList(type, activeOnly));
});

mastersRouter.post("/masters/:type", validate(masterUpsertSchema), (req, res) => {
  const { type } = req.params;
  if (!isMasterType(type)) {
    return res.status(400).json({ error: "Invalid master type" });
  }
  try {
    const list = upsertMaster(type, req.body);
    res.json(list);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Could not save master item" });
  }
});

mastersRouter.post("/masters/:type/:id/toggle", (req, res) => {
  const { type, id } = req.params;
  if (!isMasterType(type)) {
    return res.status(400).json({ error: "Invalid master type" });
  }
  try {
    const list = toggleMaster(type, id);
    res.json(list);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Could not toggle master item" });
  }
});
