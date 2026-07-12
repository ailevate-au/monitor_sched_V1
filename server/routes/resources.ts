/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { RESOURCE_PROFILES } from "../../src/server/seedData";
import { validate } from "../middleware/validate";
import { resourceCreateSchema, resourceBulkSchema, resourceUpdateSchema } from "../validation/schemas";
import { profileFor } from "../services/problems";

export const resourcesRouter = Router();

// GET /api/v1/resources: lists resource personnel and utilization values
resourcesRouter.get("/resources", (_req, res) => {
  const db = dbInstance;
  // Merge in static bio/skills profiles (reference data, not persisted).
  res.json(db.resources.map(r => ({ ...r, ...(RESOURCE_PROFILES[r.id] || {}) })));
});

// POST /api/v1/resources: register new resources
resourcesRouter.post("/resources", validate(resourceCreateSchema), (req, res) => {
  const db = dbInstance;
  const { name, trade, state, rate, email, company, overtimeRateVal, dailyAllowanceVal, projectRateOverrides, bio, skills } = req.body;
  if (!name || !trade) {
    return res.status(400).json({ error: "Missing required fields: name and trade" });
  }
  const initials = name.split(" ").map((n: string) => n.charAt(0)).join("").toUpperCase().slice(0, 3);
  const rateVal = parseInt(rate) || 55;
  const newId = `r${db.resources.length + 1}`;
  const newResource = {
    id: newId,
    initials: initials || "SR",
    name,
    trade,
    state: state || "NSW",
    rate: `A$${rateVal}/hr`,
    hourlyRateVal: rateVal,
    util: 0,
    status: "ok" as const,
    email: email || `${name.toLowerCase().replace(/\s+/g, ".")}@builderportal.com.au`,
    company: company || "Direct Hire",
    overtimeRateVal: parseInt(overtimeRateVal) || Math.round(rateVal * 1.5),
    dailyAllowanceVal: parseInt(dailyAllowanceVal) || 0,
    projectRateOverrides: projectRateOverrides || {},
  };
  if (bio || skills) {
    const parsedSkills = Array.isArray(skills)
      ? skills
      : typeof skills === "string" && skills.trim()
        ? skills.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
    RESOURCE_PROFILES[newId] = { bio: bio || "", skills: parsedSkills };
  }
  db.resources.push(newResource);
  db.save();
  res.json({ ...newResource, ...profileFor(newId) });
});

// POST /api/v1/resources/bulk: Import multiple professionals at once
resourcesRouter.post("/resources/bulk", validate(resourceBulkSchema), (req, res) => {
  const db = dbInstance;
  const { list } = req.body;
  if (!Array.isArray(list)) {
    return res.status(400).json({ error: "Invalid or empty roster list" });
  }

  const imported: any[] = [];
  list.forEach(item => {
    const { name, trade, rate, company, email, state, overtimeRateVal, dailyAllowanceVal } = item;
    if (!name || !trade) return;

    const rateVal = parseInt(rate) || 65;
    const initials = name.split(" ").map((n: string) => n.charAt(0)).join("").toUpperCase().slice(0, 3) || "SR";
    const newResource = {
      id: `r${db.resources.length + 1}`,
      name,
      initials,
      trade,
      state: state || "NSW",
      rate: `A$${rateVal}/hr`,
      hourlyRateVal: rateVal,
      util: 0,
      status: "ok" as const,
      email: email || `${name.toLowerCase().replace(/\s+/g, ".")}@builderportal.com.au`,
      company: company || "Direct Hire",
      overtimeRateVal: parseInt(overtimeRateVal) || Math.round(rateVal * 1.5),
      dailyAllowanceVal: parseInt(dailyAllowanceVal) || 0,
      projectRateOverrides: {},
    };
    db.resources.push(newResource);
    imported.push(newResource);
  });

  db.save();
  res.json({ success: true, count: imported.length, resources: db.resources });
});

// POST /api/v1/resources/:id/update: update rich resource information
resourcesRouter.post("/resources/:id/update", validate(resourceUpdateSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const { name, trade, state, rate, email, company, overtimeRateVal, dailyAllowanceVal, projectRateOverrides } = req.body;

  const resource = db.resources.find(r => r.id === id);
  if (!resource) {
    return res.status(404).json({ error: "Resource not found" });
  }

  if (name !== undefined) {
    resource.name = name;
    resource.initials = name.split(" ").map((n: string) => n.charAt(0)).join("").toUpperCase().slice(0, 3) || "SR";
  }
  if (trade !== undefined) resource.trade = trade;
  if (state !== undefined) resource.state = state;
  if (rate !== undefined) {
    const rateVal = parseInt(rate) || 55;
    resource.hourlyRateVal = rateVal;
    resource.rate = `A$${rateVal}/hr`;
  }
  if (email !== undefined) resource.email = email;
  if (company !== undefined) resource.company = company;
  if (overtimeRateVal !== undefined) resource.overtimeRateVal = parseInt(overtimeRateVal) || 0;
  if (dailyAllowanceVal !== undefined) resource.dailyAllowanceVal = parseInt(dailyAllowanceVal) || 0;
  if (projectRateOverrides !== undefined) resource.projectRateOverrides = projectRateOverrides;

  db.save();
  res.json({ success: true, resource });
});
