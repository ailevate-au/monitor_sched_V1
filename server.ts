import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { dbInstance } from "./src/server/db";
import { runConflictDetection, computeCascade, getConflictHubPayload, getReplacementCandidates } from "./src/server/conflictEngine";
import { RESOURCE_PROFILES, DEFAULT_TASKS } from "./src/server/seedData";
import { getBOMForecast, getForecast, getWeatherSummary, setStormScenario } from "./src/server/bomWeather";
import {
  getMastersBundle,
  getMasterList,
  isMasterType,
  upsertMaster,
  toggleMaster,
} from "./src/server/mastersStore";
import { calculateTaskCost, sumProjectScheduledCost } from "./src/server/taskCost";

function toSafeExportName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "report";
}

function buildPdfBuffer(params: {
  reportType: string;
  reportFormat: "PDF" | "Excel";
  projectName: string;
  projectId: string;
  generatedAt: string;
  totalTasks: number;
  completedTasks: number;
  totalClaims: number;
  pendingClaims: number;
}): Promise<Buffer> {
  const {
    reportType,
    reportFormat,
    projectName,
    projectId,
    generatedAt,
    totalTasks,
    completedTasks,
    totalClaims,
    pendingClaims,
  } = params;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("SITEWISE REPORT EXPORT", { align: "left" });
    doc.moveDown(0.6);
    doc.fontSize(11).text("Generated from live application context");
    doc.moveDown(1.2);

    doc.fontSize(13).text("Report Overview", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Report Type: ${reportType}`);
    doc.text(`Requested Format: ${reportFormat}`);
    doc.text(`Generated At: ${generatedAt}`);
    doc.moveDown(1.0);

    doc.fontSize(13).text("Project Context", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Project: ${projectName}`);
    doc.text(`Project ID: ${projectId || "-"}`);
    doc.moveDown(1.0);

    doc.fontSize(13).text("Summary Metrics", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Total tasks: ${totalTasks}`);
    doc.text(`Completed tasks: ${completedTasks}`);
    doc.text(`Total progress claims: ${totalClaims}`);
    doc.text(`Pending claims: ${pendingClaims}`);
    doc.moveDown(1.0);
    doc.fontSize(10).fillColor("#666666");
    doc.text("Note: This export reflects data available at generation time.");

    doc.end();
  });
}

async function startServer() {
  await dbInstance.init();
  runConflictDetection();
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3001;

  app.use(express.json());

  // ─── API ENDPOINTS (v1) ──────────────────────────────────────────

  // AUTH API — Owner / Admin / PM / Worker role-based controls (mock JWT)
  // Role is inferred from the email prefix so role-gated screens can be tested
  // (owner@… → Owner, admin@… → Admin, worker@… → Worker, otherwise PM).
  function roleFromEmail(email: string): "Owner" | "Admin" | "PM" | "Worker" {
    const e = (email || "").toLowerCase();
    if (e.startsWith("owner")) return "Owner";
    if (e.startsWith("admin")) return "Admin";
    if (e.startsWith("worker")) return "Worker";
    return "PM";
  }

  app.post("/api/v1/auth/login", (req, res) => {
    const { email } = req.body;
    const name = email ? email.split("@")[0] : "Director";
    res.json({
      token: "mock-jwt-token-xyz123",
      user: {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        email: email || "director@interscale.com.au",
        role: roleFromEmail(email),
        state: "NSW"
      }
    });
  });

  // ── PERMISSION MATRIX (Access) — mock, in-memory ───────────────────────────
  // Owner is implicitly full-access and never stored. Only Admin / PM / Worker
  // are configurable. always_on rows are locked ON; owner_only rows locked OFF.
  type PermRole = "Admin" | "PM" | "Worker";
  type PermType = "always_on" | "owner_only" | "configurable";
  const PERM_ROLES: PermRole[] = ["Admin", "PM", "Worker"];
  const PERM_FEATURES: { key: string; label: string; group: string; type: PermType }[] = [
    { key: "dashboard",   label: "Dashboard / Overview",     group: "Overview",       type: "always_on" },
    { key: "projects",    label: "Projects",                 group: "Overview",       type: "configurable" },
    { key: "conflicts",   label: "Conflicts",                group: "Overview",       type: "configurable" },
    { key: "weather",     label: "Weather",                  group: "Overview",       type: "configurable" },
    { key: "gantt",       label: "Timeline (Gantt)",         group: "Scheduling",     type: "configurable" },
    { key: "resources",   label: "Resources",                group: "Scheduling",     type: "configurable" },
    { key: "financial",   label: "Financial Dashboard",      group: "Finance",        type: "owner_only" },
    { key: "pricing",     label: "Pricing & Rates",          group: "Finance",        type: "owner_only" },
    { key: "claims",      label: "Project Expenses",         group: "Finance",        type: "configurable" },
    { key: "reports",     label: "Reports",                  group: "Finance",        type: "configurable" },
    { key: "masterdata",  label: "Settings / Master Data",   group: "Administration", type: "configurable" },
    { key: "users",       label: "User Management",          group: "Administration", type: "owner_only" },
    { key: "permissions", label: "Access (Permissions)",     group: "Administration", type: "owner_only" },
  ];
  const PERM_DEFAULTS: Record<string, Record<PermRole, boolean>> = {
    projects:   { Admin: true,  PM: true,  Worker: false },
    conflicts:  { Admin: true,  PM: true,  Worker: false },
    weather:    { Admin: true,  PM: true,  Worker: true  },
    gantt:      { Admin: true,  PM: true,  Worker: true  },
    resources:  { Admin: true,  PM: true,  Worker: false },
    claims:     { Admin: true,  PM: true,  Worker: false },
    reports:    { Admin: true,  PM: true,  Worker: false },
    masterdata: { Admin: true,  PM: false, Worker: false },
  };
  function buildDefaultMatrix(): Record<PermRole, Record<string, boolean>> {
    const matrix = {} as Record<PermRole, Record<string, boolean>>;
    for (const role of PERM_ROLES) {
      matrix[role] = {};
      for (const f of PERM_FEATURES) {
        if (f.type === "always_on") matrix[role][f.key] = true;
        else if (f.type === "owner_only") matrix[role][f.key] = false;
        else matrix[role][f.key] = PERM_DEFAULTS[f.key]?.[role] ?? false;
      }
    }
    return matrix;
  }
  let permissionMatrix = buildDefaultMatrix();

  app.get("/api/v1/permissions", (_req, res) => {
    res.json({ features: PERM_FEATURES, roles: PERM_ROLES, matrix: permissionMatrix });
  });

  app.put("/api/v1/permissions/:role", (req, res) => {
    const role = req.params.role as PermRole;
    if (!PERM_ROLES.includes(role)) {
      return res.status(404).json({ success: false, error: `Unknown role: ${req.params.role}` });
    }
    const incoming = (req.body && req.body.permissions) || {};
    for (const f of PERM_FEATURES) {
      if (f.type !== "configurable") continue; // locked rows can't be toggled
      if (Object.prototype.hasOwnProperty.call(incoming, f.key)) {
        permissionMatrix[role][f.key] = !!incoming[f.key];
      }
    }
    res.json({ success: true, role, permissions: permissionMatrix[role], matrix: permissionMatrix });
  });

  app.post("/api/v1/permissions/reset", (_req, res) => {
    permissionMatrix = buildDefaultMatrix();
    res.json({ success: true, features: PERM_FEATURES, roles: PERM_ROLES, matrix: permissionMatrix });
  });

  // GET /api/v1/dashboard: portfolio statistics and top-level summaries.
  // Total Issues is the SAME number the Problems hub and sidebar show, so every
  // screen agrees on one count.
  app.get("/api/v1/dashboard", (req, res) => {
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
        forecast: weather
      }
    });
  });

  // GET /api/v1/dashboard/tasks: filtered list of all scheduled tasks
  app.get("/api/v1/dashboard/tasks", (req, res) => {
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
      const r = db.resources.find(res => res.id === t.assigneeId);
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
        calculatedCostVal: calculatedCost
      };
    });

    res.json(payload);
  });

  // GET /api/v1/projects: details of general Tier 1/2 commercial programs
  app.get("/api/v1/projects", (req, res) => {
    const db = dbInstance;
    res.json(db.projects);
  });

  // POST /api/v1/projects: create a new project contract
  app.post("/api/v1/projects", (req, res) => {
    const db = dbInstance;
    const { name, type, location, contractor, state, originalContractSum, plannedCost, ldRatePerDay, pcEndDate, retentionPercent } = req.body;
    if (!name || !contractor) {
      return res.status(400).json({ error: "Missing required fields: name and contractor" });
    }
    const val = parseFloat(originalContractSum) || 5.0;
    const parsedPlannedCost = plannedCost !== undefined && !isNaN(parseFloat(plannedCost)) ? parseFloat(plannedCost) : val * 0.85;
    const parsedLdRate = ldRatePerDay !== undefined && !isNaN(parseFloat(ldRatePerDay)) ? parseFloat(ldRatePerDay) : val * 1000;
    const parsedRetention = retentionPercent !== undefined && !isNaN(parseFloat(retentionPercent)) ? parseFloat(retentionPercent) : 5.0;

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
      overBudget: false
    };
    db.projects.push(newProject);
    db.save();
    res.json(newProject);
  });

  // POST /api/v1/projects/:id/rates: set project rate overrides for resources
  app.post("/api/v1/projects/:id/rates", (req, res) => {
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

  // GET /api/v1/tasks: full project timelines for Gantt grid
  app.get("/api/v1/tasks", (req, res) => {
    const db = dbInstance;
    res.json(db.tasks);
  });

  // POST /api/v1/tasks/create: Add a brand new task
  app.post("/api/v1/tasks/create", (req, res) => {
    const db = dbInstance;
    const {
      project,
      name,
      start,
      end,
      dependencies,
      lag_days,
      dependency_type,
      assigneeId,
      trade,
      cost_override,
      cost_override_type
    } = req.body;

    if (!name || !project || !start || !end) {
      return res.status(400).json({ error: "Missing required fields: project, name, start, and end" });
    }

    const proj = db.projects.find(p => p.name === project || p.id === project);
    if (!proj) {
      return res.status(400).json({ error: "Project not found" });
    }

    const newIdNum = db.tasks.length + 1;
    const id = `TSK-${String(newIdNum).padStart(3, "0")}`;

    let assigneeName = "Unassigned";
    if (assigneeId) {
      const resObj = db.resources.find(r => r.id === assigneeId);
      assigneeName = resObj ? resObj.name : "Unassigned";
    }

    const d1 = new Date(start);
    const d2 = new Date(end);
    const diffTime = d2.getTime() - d1.getTime();
    const durationDays = Math.max(1, Math.round(diffTime / (1000 * 3600 * 24)) + 1);

    const newTask: any = {
      id,
      projectId: proj.id,
      name,
      start,
      end,
      durationDays,
      assigneeId: assigneeId || null,
      assignee: assigneeName,
      trade: trade || "Labour",
      dependencies: dependencies || "",
      status: "scheduled",
      lag_days: parseInt(lag_days) || 0,
      dependency_type: dependency_type === "SS" ? "SS" : "FS",
      cost_override: cost_override !== undefined && cost_override !== null ? parseFloat(cost_override) : null,
      cost_override_type: cost_override_type || null,
      percent_complete: 0
    };

    db.tasks.push(newTask);
    runConflictDetection();
    db.save();
    res.json({ success: true, task: newTask, tasks: db.tasks });
  });

  // POST /api/v1/tasks/:id/update: reschedule a task, option to cascade dependencies
  app.post("/api/v1/tasks/:id/update", (req, res) => {
    const db = dbInstance;
    const { id } = req.params;
    const {
      start,
      end,
      cascade,
      name,
      dependencies,
      lag_days,
      dependency_type,
      cost_override,
      cost_override_type,
      assigneeId,
      trade,
      percent_complete
    } = req.body;

    const task = db.tasks.find(t => t.id === id) as any;
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (name !== undefined) task.name = name;
    if (dependencies !== undefined) task.dependencies = dependencies;
    if (lag_days !== undefined) task.lag_days = parseInt(lag_days) || 0;
    if (dependency_type !== undefined) task.dependency_type = dependency_type === "SS" ? "SS" : "FS";
    if (cost_override !== undefined) task.cost_override = cost_override !== null ? parseFloat(cost_override) : null;
    if (cost_override_type !== undefined) task.cost_override_type = cost_override_type;
    
    if (assigneeId !== undefined) {
      task.assigneeId = assigneeId;
      if (assigneeId === null) {
        task.assignee = "Unassigned";
      } else {
        const resObj = db.resources.find(r => r.id === assigneeId);
        task.assignee = resObj ? resObj.name : "Unassigned";
      }
    }
    if (trade !== undefined) task.trade = trade;
    if (percent_complete !== undefined) task.percent_complete = parseInt(percent_complete) || 0;

    const hasStartChange = start !== undefined && start !== task.start;
    const hasEndChange = end !== undefined && end !== task.end;

    if (start !== undefined) task.start = start;
    if (end !== undefined) task.end = end;

    if (start !== undefined || end !== undefined) {
      const d1 = new Date(task.start);
      const d2 = new Date(task.end);
      const diffTime = d2.getTime() - d1.getTime();
      task.durationDays = Math.max(1, Math.round(diffTime / (1000 * 3600 * 24)) + 1);
    }

    if (cascade && (hasStartChange || hasEndChange)) {
      // Task already set to explicit user-picked dates above.
      // Cascade only downstream dependents from this new anchor.
      db.tasks = computeCascade(db.tasks, id, 0, "NSW");
    }

    runConflictDetection();
    db.save();
    res.json({ success: true, tasks: db.tasks });
  });

  // POST /api/v1/tasks/:id/status — PM-driven lifecycle change.
  // "delayed" does a REAL cascade (shifts the task + dependents), which can create
  // cross-project clashes the PM can't see but the Owner will. Returns the refreshed
  // problem summary so the UI can say "this created N new issue(s)".
  app.post("/api/v1/tasks/:id/status", (req, res) => {
    const db = dbInstance;
    const { id } = req.params;
    const { pmStatus, delayDays } = req.body || {};
    const task = db.tasks.find(t => t.id === id) as any;
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });

    const before = buildProblemsResponse().summary.total;

    if (pmStatus === "complete") {
      task.percent_complete = 100;
      task.status = "completed";
      task.pmStatus = "complete";
    } else if (pmStatus === "in_progress") {
      if ((task.percent_complete ?? 0) <= 0) task.percent_complete = 40;
      task.pmStatus = "in_progress";
    } else if (pmStatus === "not_started") {
      task.percent_complete = 0;
      task.pmStatus = "not_started";
    } else if (pmStatus === "delayed") {
      const days = parseInt(delayDays, 10) || 0;
      if (days !== 0) applyShift(id, days);
      task.pmStatus = "delayed";
    } else {
      return res.status(400).json({ success: false, error: `Unknown status: ${pmStatus}` });
    }

    runConflictDetection();
    db.save();
    const refreshed = buildProblemsResponse();
    res.json({
      success: true,
      newIssues: Math.max(0, refreshed.summary.total - before),
      ...refreshed,
      tasks: db.tasks,
    });
  });

  // POST /api/v1/tasks/restore — revert tasks to a client-supplied snapshot.
  // Powers the Timeline "Undo last change": if a save created clashes, restore the
  // previous dates/assignees in one shot and re-run detection.
  app.post("/api/v1/tasks/restore", (req, res) => {
    const db = dbInstance;
    const { tasks } = req.body || {};
    if (!Array.isArray(tasks)) return res.status(400).json({ success: false, error: "Missing tasks snapshot" });
    for (const s of tasks) {
      const t = db.tasks.find(x => x.id === s.id) as any;
      if (!t) continue;
      if (s.start !== undefined) t.start = s.start;
      if (s.end !== undefined) t.end = s.end;
      if (s.durationDays !== undefined) t.durationDays = s.durationDays;
      if (Object.prototype.hasOwnProperty.call(s, "assigneeId")) t.assigneeId = s.assigneeId;
      if (s.percent_complete !== undefined) t.percent_complete = s.percent_complete;
    }
    runConflictDetection();
    db.save();
    res.json({ success: true, tasks: db.tasks });
  });

  // GET /api/v1/resources: lists resource personnel and utilization values
  app.get("/api/v1/resources", (req, res) => {
    const db = dbInstance;
    // Merge in static bio/skills profiles (reference data, not persisted).
    res.json(db.resources.map(r => ({ ...r, ...(RESOURCE_PROFILES[r.id] || {}) })));
  });

  // POST /api/v1/resources: register new resources
  app.post("/api/v1/resources", (req, res) => {
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
      projectRateOverrides: projectRateOverrides || {}
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
  app.post("/api/v1/resources/bulk", (req, res) => {
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
        projectRateOverrides: {}
      };
      db.resources.push(newResource);
      imported.push(newResource);
    });

    db.save();
    res.json({ success: true, count: imported.length, resources: db.resources });
  });

  // POST /api/v1/resources/:id/update: update rich resource information
  app.post("/api/v1/resources/:id/update", (req, res) => {
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

  // GET /api/v1/conflicts: double-booking analysis + hub metrics
  app.get("/api/v1/conflicts", (req, res) => {
    res.json(getConflictHubPayload());
  });

  // POST /api/v1/conflicts/:id/resolve: reassign candidate
  app.post("/api/v1/conflicts/:id/resolve", (req, res) => {
    const db = dbInstance;
    const { id } = req.params; // Conflict ID (format c-resourceId-timestamp)
    const { targetResourceId } = req.body;

    const resourceId = id.split("-")[1]; // extract resource ID
    
    // Find tasks assigned to this conflicted resource that are double booked
    const conflictedTasks = db.tasks.filter(t => t.assigneeId === resourceId && t.status === "conflict");

    if (conflictedTasks.length > 0) {
      // Reassign first conflicting task to the selected replacement candidate
      const targetTask = conflictedTasks[0];
      const prevAssigneeId = targetTask.assigneeId;

      targetTask.assigneeId = targetResourceId;
      
      // Save to undo log
      db.undoStack.push({
        targetId: targetTask.id,
        prevAssigneeId
      });

      db.conflictResolutionLog.push({
        resourceId,
        resolvedAt: new Date().toISOString(),
        undone: false,
      });

      // Recalculately analyze allocations
      runConflictDetection();
      db.save();

      return res.json({
        success: true,
        message: "Resource reallocated, schedule conflict resolved",
        hub: getConflictHubPayload(),
      });
    }

    res.status(404).json({ error: "No active conflict found for resource" });
  });

  // POST /api/v1/conflicts/:id/undo: rollback last re-assignment
  app.post("/api/v1/conflicts/:id/undo", (req, res) => {
    const db = dbInstance;
    const { id } = req.params;
    const resourceId = id.startsWith("c-") ? id.split("-")[1] : id;
    const lastAction = db.undoStack.pop();

    if (lastAction) {
      const task = db.tasks.find(t => t.id === lastAction.targetId);
      if (task) {
        task.assigneeId = lastAction.prevAssigneeId;

        const resolutionEntry = [...db.conflictResolutionLog]
          .reverse()
          .find(entry => entry.resourceId === resourceId && !entry.undone);
        if (resolutionEntry) {
          resolutionEntry.undone = true;
        }

        runConflictDetection();
        db.save();
        return res.json({
          success: true,
          message: "Rollback successful",
          hub: getConflictHubPayload(),
        });
      }
    }

    res.status(400).json({ error: "Nothing to undo" });
  });

  // ─── PROBLEMS HUB ─────────────────────────────────────────────────────────
  // Owner-centric unified feed: conflicts + late projects + fragile buffers +
  // weather, each carrying 2–3 plain-language suggested fixes. Derived on every
  // request (not persisted); resolving an action mutates the underlying tasks so
  // the problem disappears on the next recompute.
  const SCENARIO_TODAY = new Date("2026-06-02"); // demo "now" — aligns with weather + dashboard

  const profileFor = (id: string): { bio?: string; skills?: string[] } => RESOURCE_PROFILES[id] || {};
  const stateForTask = (t: any) =>
    dbInstance.projects.find(p => p.id === t?.projectId)?.state || "NSW";
  const projectNameFor = (pid: string) =>
    dbInstance.projects.find(p => p.id === pid)?.name || "Unknown project";
  // Clear, unambiguous job label: project + full task name, so two jobs with the
  // same name (e.g. "… — Level 4/5") are told apart. e.g. "Parramatta Square · Structural Steel Frame — Level 4".
  const jobLabelFor = (t: any) => {
    const proj = (projectNameFor(t?.projectId) || "").split(" — ")[0];
    return proj ? `${proj} · ${t?.name}` : (t?.name || "this job");
  };

  function applyShift(taskId: string, delayDays: number) {
    const db = dbInstance;
    const t = db.tasks.find(x => x.id === taskId);
    if (!t) return;
    const updated = computeCascade(db.tasks, taskId, delayDays, stateForTask(t));
    db.tasks = db.tasks.map(tk => {
      const u = updated.find(x => x.id === tk.id);
      return u ? { ...tk, start: u.start, end: u.end } : tk;
    });
  }

  function buildProblemsResponse() {
    const db = dbInstance;
    const problems: any[] = [];
    const conflictedIds = new Set(db.conflicts.map(c => c.resourceId));

    // 1) CONFLICTS — double-booked resources
    for (const c of db.conflicts) {
      const conflictTasks = db.tasks.filter(t => t.assigneeId === c.resourceId && t.status === "conflict");
      const reassignTask = conflictTasks[0];
      const projNames = Array.from(new Set(conflictTasks.map(t => projectNameFor(t.projectId))));
      const candidates = (c.candidates || [])
        .filter((cd: any) => !conflictedIds.has(cd.id))
        .slice(0, 2);

      const actions: any[] = candidates.map((cd: any, i: number) => {
        const prof = profileFor(cd.id);
        const interstate = cd.same_state === false ? ` Lives in ${cd.state} (would travel).` : "";
        return {
          id: `reassign:${cd.id}`,
          kind: "reassign",
          label: reassignTask ? `Give "${jobLabelFor(reassignTask)}" to ${cd.name}` : `Give the job to ${cd.name}`,
          detail: `${cd.name} is free for these dates. Costs ${cd.rate}, ${cd.util}% booked right now.${interstate} ${prof.bio || ""}`.trim(),
          recommended: i === 0,
          resource: { ...cd, bio: prof.bio, skills: prof.skills, recommended: i === 0 },
        };
      });
      if (reassignTask) {
        actions.push({
          id: `shift:${reassignTask.id}:14`,
          kind: "accept_delay",
          label: `Push "${jobLabelFor(reassignTask)}" back 2 weeks instead`,
          detail: `Keep ${c.resource} on both jobs and move "${reassignTask.name}" 2 weeks later. Jobs that wait on it move too.`,
          delayDays: 14,
        });
      }

      const crossProject = projNames.length > 1;
      problems.push({
        id: `prob-conflict-${c.resourceId}`,
        category: "conflict",
        severity: "critical",
        taskIds: conflictTasks.map(t => t.id),
        title: `${c.resource} is booked on two jobs at the same time`,
        projectName: projNames.join(" + ") || (reassignTask ? projectNameFor(reassignTask.projectId) : ""),
        // Name both jobs with their project + dates so a cross-project clash is obvious.
        what: conflictTasks.length >= 2
          ? `${c.resource} is needed on ${conflictTasks.length} jobs at once${crossProject ? " (on different projects)" : ""}: ${conflictTasks.map(t => `"${jobLabelFor(t)}" (${t.start} to ${t.end})`).join(" and ")}.`
          : c.desc,
        impact: "The same person can't be on two jobs at once. One of them will slip unless you fix it.",
        suggestedActions: actions,
      });
    }

    // 1b) UNASSIGNED — active-project jobs with nobody assigned. A real problem:
    // the work has no one to do it. Suggest the best same-trade person who's free.
    const activeIds = new Set(db.projects.filter(p => p.status === "ACTIVE").map(p => p.id));
    const unassignedTasks = db.tasks.filter(
      t => !t.assigneeId && t.status !== "completed" && activeIds.has(t.projectId)
    );
    for (const t of unassignedTasks) {
      const cands = getReplacementCandidates("", t.tradeRequired, t)
        .filter((cd: any) => !conflictedIds.has(cd.id))
        .slice(0, 2);
      const actions: any[] = cands.map((cd: any, i: number) => {
        const prof = profileFor(cd.id);
        const interstate = cd.same_state === false ? ` Lives in ${cd.state} (would travel).` : "";
        return {
          id: `assign:${t.id}:${cd.id}`,
          kind: "reassign",
          label: `Put ${cd.name} on "${jobLabelFor(t)}"`,
          detail: `${cd.name} is free for these dates. Costs ${cd.rate}, ${cd.util}% booked right now.${interstate} ${prof.bio || ""}`.trim(),
          recommended: i === 0,
          resource: { ...cd, bio: prof.bio, skills: prof.skills, recommended: i === 0 },
        };
      });
      problems.push({
        id: `prob-unassigned-${t.id}`,
        category: "unassigned",
        severity: "medium",
        taskIds: [t.id],
        title: `No one is assigned to "${jobLabelFor(t)}"`,
        projectName: projectNameFor(t.projectId),
        what: `"${t.name}" (${t.start} to ${t.end}) needs a ${t.tradeRequired}, but nobody is on it yet.`,
        impact: "Nobody is doing this job yet, so it can't start.",
        suggestedActions: actions,
      });
    }

    // 2) LATE — tasks already past their end date (relative to the scenario date)
    const lateByProject = new Map<string, any[]>();
    for (const t of db.tasks) {
      if (t.status === "completed" || (t.percent_complete ?? 0) >= 100) continue;
      if (new Date(t.end) >= SCENARIO_TODAY) continue;
      if (!lateByProject.has(t.projectId)) lateByProject.set(t.projectId, []);
      lateByProject.get(t.projectId)!.push(t);
    }
    for (const [pid, tasks] of lateByProject) {
      const worst = tasks.slice().sort((a, b) => +new Date(a.end) - +new Date(b.end))[0];
      const daysLate = Math.round((SCENARIO_TODAY.getTime() - new Date(worst.end).getTime()) / 86400000);
      const project = db.projects.find(p => p.id === pid);
      const actions: any[] = [{
        id: `shift:${worst.id}:10`,
        kind: "extend_deadline",
        label: "Give it 2 more weeks",
        detail: `Move the late job 2 weeks later and clear the red flag. Jobs that wait on it move too.`,
        delayDays: 10,
        recommended: true,
      }];
      const assignee = db.resources.find(r => r.id === worst.assigneeId);
      if (assignee) {
        const cands = getReplacementCandidates(assignee.id, assignee.trade, worst).filter(cd => !conflictedIds.has(cd.id));
        if (cands[0]) {
          const prof = profileFor(cands[0].id);
          actions.push({
            id: `reassign:${cands[0].id}`,
            kind: "reassign",
            label: `Bring in ${cands[0].name} to catch up`,
            detail: `Costs ${cands[0].rate}, ${cands[0].util}% booked. ${prof.bio || ""}`.trim(),
            resource: { ...cands[0], bio: prof.bio, skills: prof.skills },
          });
        }
      }
      problems.push({
        id: `prob-late-${worst.id}`,
        category: "late",
        severity: "high",
        taskIds: [worst.id],
        title: `${projectNameFor(pid)} is behind schedule`,
        projectName: projectNameFor(pid),
        what: `"${jobLabelFor(worst)}" was due ${worst.end}, now ${daysLate} day${daysLate !== 1 ? "s" : ""} late${assignee ? ` (${assignee.name}'s job)` : ""}.`,
        impact: "This job is already late, so the jobs after it are waiting too.",
        suggestedActions: actions,
      });
    }

    // 3) FRAGILE — surface only the single most at-risk handover (keeps the
    // owner's feed focused rather than listing every ≤1-day gap).
    const worstFragile = db.fragileTasks.slice().sort((a, b) => a.bufferDays - b.bufferDays)[0];
    for (const f of (worstFragile ? [worstFragile] : [])) {
      const parent = db.tasks.find(t => t.id === f.id);
      if (!parent) continue;
      // Use the exact tight successor detection flagged (falls back to the first
      // assigned dependent) so the "breathing room" fix shifts the job the
      // problem actually names.
      const child =
        (f.childId ? db.tasks.find(t => t.id === f.childId) : undefined) ||
        db.tasks.find(t => (t.dependencies || "").split(",").map(d => d.trim()).includes(f.id) && t.assigneeId);
      const actions: any[] = [];
      if (child) {
        actions.push({
          id: `shift:${child.id}:3`,
          kind: "extend_deadline",
          label: "Add 3 days of breathing room",
          detail: `Start the next job 3 days later so there's a gap. Removes the risk of a pile-up.`,
          delayDays: 3,
          recommended: true,
        });
      }
      actions.push({
        id: `shift:${f.id}:-2`,
        kind: "extend_deadline",
        label: "Start the first job 2 days earlier",
        detail: `Bring the earlier job forward 2 days to open up a safety gap.`,
        delayDays: -2,
      });
      problems.push({
        id: `prob-fragile-${f.id}`,
        category: "fragile",
        severity: "medium",
        taskIds: [f.id],
        title: `No gap between two jobs on ${f.name}`,
        projectName: projectNameFor(parent.projectId),
        what: f.desc,
        impact: "If the first job runs even 1 day over, the next one can't start. Easy to miss.",
        suggestedActions: actions,
      });
    }

    // 4) WEATHER — group all storm-exposed tasks into one problem
    const weatherTasks = db.tasks.filter(t => t.status === "weather");
    if (weatherTasks.length) {
      const ids = weatherTasks.map(t => t.id).join(",");
      problems.push({
        id: `prob-weather`,
        category: "weather",
        severity: "high",
        taskIds: weatherTasks.map(t => t.id),
        title: `Bad weather could stop ${weatherTasks.length} job(s) this week`,
        projectName: Array.from(new Set(weatherTasks.map(t => projectNameFor(t.projectId)))).join(" + "),
        what: `Rain and storms forecast this week. Outdoor jobs at risk: ${weatherTasks.map(t => jobLabelFor(t)).join("; ")}.`,
        impact: "Storms could stop this outdoor work, so the jobs may not get done this week.",
        suggestedActions: [
          {
            id: `shiftmany:${ids}:5`,
            kind: "extend_deadline",
            label: "Move these jobs past the storm",
            detail: "Push the outdoor jobs 5 days later so they land in clear weather.",
            delayDays: 5,
            recommended: true,
          },
          {
            id: `shiftmany:${ids}:7`,
            kind: "extend_deadline",
            label: "Claim the lost time and extend",
            detail: "Log the storm as an official delay and move the jobs 7 days later.",
            delayDays: 7,
          },
        ],
      });
    }

    const order: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    problems.sort((a, b) => order[a.severity] - order[b.severity]);

    return {
      problems,
      summary: {
        total: problems.length,
        critical: problems.filter(p => p.severity === "critical").length,
        projectsAffected: new Set(problems.flatMap(p => p.projectName.split(" + "))).size,
        projectsTotal: db.projects.filter(p => p.status === "ACTIVE").length,
      },
    };
  }

  app.get("/api/v1/problems", (_req, res) => {
    res.json(buildProblemsResponse());
  });

  app.post("/api/v1/problems/:id/resolve", (req, res) => {
    const db = dbInstance;
    const { id } = req.params;
    const { actionId } = req.body || {};
    if (!actionId) return res.status(400).json({ success: false, error: "Missing actionId" });

    const parts = String(actionId).split(":");
    const kind = parts[0];

    try {
      if (kind === "reassign") {
        const targetResourceId = parts[1];
        // Resolve the task tied to this problem (conflict or late).
        let task: any;
        if (id.startsWith("prob-conflict-")) {
          const rid = id.replace("prob-conflict-", "");
          task = db.tasks.find(t => t.assigneeId === rid && t.status === "conflict");
        } else if (id.startsWith("prob-late-")) {
          task = db.tasks.find(t => t.id === id.replace("prob-late-", ""));
        }
        if (!task) return res.status(404).json({ success: false, error: "No task found for this problem" });
        db.undoStack.push({ targetId: task.id, prevAssigneeId: task.assigneeId });
        db.conflictResolutionLog.push({ resourceId: task.assigneeId || "", resolvedAt: new Date().toISOString(), undone: false });
        task.assigneeId = targetResourceId;
      } else if (kind === "assign") {
        // assign:<taskId>:<resourceId> — put someone on an unassigned job.
        const targetTask = db.tasks.find(t => t.id === parts[1]);
        if (!targetTask) return res.status(404).json({ success: false, error: "No task found for this problem" });
        db.undoStack.push({ targetId: targetTask.id, prevAssigneeId: targetTask.assigneeId });
        targetTask.assigneeId = parts[2];
      } else if (kind === "shift") {
        applyShift(parts[1], parseInt(parts[2], 10) || 0);
      } else if (kind === "shiftmany") {
        const ids = parts[1].split(",");
        const delay = parseInt(parts[2], 10) || 0;
        ids.forEach(tid => applyShift(tid, delay));
      } else {
        return res.status(400).json({ success: false, error: `Unknown action: ${actionId}` });
      }

      runConflictDetection();
      db.save();
      return res.json({ success: true, message: "Problem resolved.", ...buildProblemsResponse() });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Failed to resolve problem" });
    }
  });

  // ── DEMO CONTROLS ───────────────────────────────────────────────────────
  // Drives the live "no issue → issue → resolved" story for the walkthrough.
  // Simulate: a fresh batch of work lands and the portfolio sprouts the full set
  //   of problems (two double-bookings, a late job, a tight handover, a storm).
  // Reset:    put everything back to the clean baseline → "Everything's on track".
  const setTask = (id: string, patch: Record<string, any>) => {
    const t = dbInstance.tasks.find(x => x.id === id);
    if (t) Object.assign(t, patch);
  };

  app.post("/api/v1/demo/simulate", (_req, res) => {
    const db = dbInstance;
    // 1) Ben double-booked — new basement formwork clashes with his Level-4 pour
    setTask("TSK-P2-03", { assigneeId: "r1", start: "2026-06-03", end: "2026-06-09", durationDays: 5, percent_complete: 0, status: "scheduled" });
    // 2) Tom double-booked — main-core piling pulled back to clash with his north piling
    setTask("TSK-P3-01", { assigneeId: "r4", start: "2026-06-01", end: "2026-06-19", durationDays: 15, percent_complete: 0, status: "scheduled" });
    // 3) A job running late — excavation stalled at 85%, past its end date
    setTask("TSK-P2-01", { percent_complete: 85, status: "overdue" });
    // 4) A tight handover — Level-5 steel pulled up against Level-4 finishing
    setTask("TSK-P1-04", { start: "2026-06-26", end: "2026-07-08", durationDays: 9 });
    // 5) A storm hits mid-week (NSW only — Parramatta is exposed, interstate jobs aren't).
    //    Pull a clean NSW job into the storm window so the weather risk surfaces
    //    on a job that isn't already a clash.
    setStormScenario(true);
    setTask("TSK-P1-06", { start: "2026-06-03", end: "2026-06-09", durationDays: 5 });
    // 6) A job with nobody assigned — the new batch left the HSE audit unstaffed
    setTask("TSK-P1-08", { assigneeId: null });
    runConflictDetection();
    db.save();
    res.json({ success: true, ...buildProblemsResponse() });
  });

  app.post("/api/v1/demo/reset", (_req, res) => {
    const db = dbInstance;
    // FULL restore to the seeded baseline. Rebuilding every task from DEFAULT_TASKS
    // (rather than nudging a handful) means "Reset to clean" is truly clean — it
    // scrubs ANY manual drags/edits/created tasks, not just the scripted scenario,
    // and always returns to 0 issues.
    db.tasks = DEFAULT_TASKS.map((s: any) => ({
      id: s.id,
      projectId: s.projectId,
      name: s.name,
      assigneeId: s.assigneeId,
      tradeRequired: s.tradeRequired,
      start: s.start,
      end: s.end,
      durationDays: s.durationDays,
      dependencies: s.dependencies,
      status: s.status,
      lag_days: 0,
      dependency_type: "FS",
      cost_override: null,
      cost_override_type: null,
      percent_complete: s.percent_complete ?? (s.status === "completed" ? 100 : 0),
    }));
    setStormScenario(false);
    runConflictDetection();
    db.save();
    res.json({ success: true, ...buildProblemsResponse() });
  });

  // POST /api/v1/projects/import — bulk import projects (CSV rows or a sample set)
  app.post("/api/v1/projects/import", (req, res) => {
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

  // FINANCIAL APIs (AS 4000-1997 audit specifications)
  app.get("/api/v1/financial/projects/:id", (req, res) => {
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
      ldExposure: 68000 // A$68k standard penalty past schedule
    });
  });

  // POST /api/v1/financial/variance: log custom building variations or costs
  app.post("/api/v1/financial/variance", (req, res) => {
    const db = dbInstance;
    const { projectId, description, amountVal, type } = req.body;
    const project = db.projects.find(p => p.id === projectId);
    if (!project) return res.status(404).json({ error: "Project contract not found" });

    const val = parseFloat(amountVal) || 0;
    if (type === "contract_sum_addition") {
      project.finalContractSum = Math.round((project.finalContractSum + val) * 10) / 10;
    } else {
      project.actualCost = Math.round((project.actualCost + val) * 10) / 10;
      project.overBudget = project.actualCost > project.plannedCost;
    }
    db.save();
    res.json({ success: true, project });
  });

  // GET /api/v1/claims: progress claim lists
  app.get("/api/v1/claims", (req, res) => {
    const db = dbInstance;
    res.json(db.claims);
  });

  // POST /api/v1/claims: claim submission
  app.post("/api/v1/claims", (req, res) => {
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

  // POST /api/v1/claims/:id/certify: certify progress claim, holding 5% security values
  app.post("/api/v1/claims/:id/certify", (req, res) => {
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

    // Increment Project Actual Cost accordingly
    if (project) {
      project.actualCost = Math.round((project.actualCost + parseFloat(certifiedAmountVal)) * 10) / 10;
    }

    db.save();
    res.json(claim);
  });

  // PUT /api/v1/claims/:id: update expense entry fields
  app.put("/api/v1/claims/:id", (req, res) => {
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

  // GET /api/v1/conflicts/:id/candidates
  app.get("/api/v1/conflicts/:id/candidates", (req, res) => {
    const db = dbInstance;
    let { id } = req.params;
    let resourceId = id;
    if (id.startsWith("c-")) {
      resourceId = id.split("-")[1];
    }
    const resource = db.resources.find(r => r.id === resourceId);
    if (!resource) return res.status(404).json({ error: "Resource not found" });

    const candidates = db.resources.filter(r => r.id !== resourceId && r.trade === resource.trade);
    res.json(candidates);
  });

  // ─── MASTER DATA API ─────────────────────────────────────────────

  app.get("/api/v1/masters", (req, res) => {
    const activeOnly = req.query.activeOnly === "true";
    res.json(getMastersBundle(activeOnly));
  });

  app.get("/api/v1/masters/:type", (req, res) => {
    const { type } = req.params;
    if (!isMasterType(type)) {
      return res.status(400).json({ error: "Invalid master type" });
    }
    const activeOnly = req.query.activeOnly === "true";
    res.json(getMasterList(type, activeOnly));
  });

  app.post("/api/v1/masters/:type", (req, res) => {
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

  app.post("/api/v1/masters/:type/:id/toggle", (req, res) => {
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

  // --- IMPROVEMENTS API ---

  // Cost Categories (Improvement 7)
  app.get("/api/v1/cost_categories", (req, res) => {
    const db = dbInstance;
    res.json(db.costCategories);
  });

  app.post("/api/v1/cost_categories", (req, res) => {
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
        sort_order: db.costCategories.length + 1
      };
      db.costCategories.push(newCat);
    }
    db.save();
    res.json(db.costCategories);
  });

  app.post("/api/v1/cost_categories/:id/toggle", (req, res) => {
    const db = dbInstance;
    const { id } = req.params;
    const existing = db.costCategories.find(c => c.id === id);
    if (existing) {
      existing.is_active = !existing.is_active;
      db.save();
    }
    res.json(db.costCategories);
  });

  // Team Member Work (Improvement 5 & 6)
  app.get("/api/v1/my/assignments", (req, res) => {
    const db = dbInstance;
    const assigneeId = (req.query.assigneeId as string) || "r1";
    const myTasks = db.tasks.filter(t => t.assigneeId === assigneeId);
    const payload = myTasks.map(t => {
      const p = db.projects.find(proj => proj.id === t.projectId);
      const r = db.resources.find(res => res.id === t.assigneeId);
      return {
        ...t,
        project: p ? p.name : "Unknown",
        assignee: r ? r.name : "Unassigned",
        trade: r ? r.trade : t.tradeRequired,
      };
    });
    res.json(payload);
  });

  app.get("/api/v1/my/schedule", (req, res) => {
    const db = dbInstance;
    const assigneeId = (req.query.assigneeId as string) || "r1";
    const myTasks = db.tasks.filter(t => t.assigneeId === assigneeId).sort((a, b) => a.start.localeCompare(b.start));
    const payload = myTasks.map(t => {
      const p = db.projects.find(proj => proj.id === t.projectId);
      const r = db.resources.find(res => res.id === t.assigneeId);
      return {
        ...t,
        project: p ? p.name : "Unknown",
        assignee: r ? r.name : "Unassigned",
        trade: r ? r.trade : t.tradeRequired,
      };
    });
    res.json(payload);
  });

  app.get("/api/v1/my/notifications", (req, res) => {
    const db = dbInstance;
    res.json(db.alerts);
  });

  // Endpoints to get list of running alerts for PM overview
  app.get("/api/v1/pm/alerts", (req, res) => {
    const db = dbInstance;
    res.json(db.alerts);
  });

  // Resolve / Dismiss PM Alert
  app.post("/api/v1/pm/alerts/:id/resolve", (req, res) => {
    const db = dbInstance;
    const { id } = req.params;
    db.alerts = db.alerts.filter(a => a.id !== id);
    db.save();
    res.json({ success: true, alerts: db.alerts });
  });

  // Report task progress/status
  app.patch("/api/v1/tasks/:id/progress", (req, res) => {
    const db = dbInstance;
    const { id } = req.params;
    const { status, percent_complete, reportBehind } = req.body;

    const task = db.tasks.find(t => t.id === id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const reporterName = "Ben Nguyen"; // Simulated logged-in team member

    if (reportBehind) {
      // Rule 2 — Team member reports behind schedule:
      // Does NOT auto-cascade, instead triggers a PM Alert.
      const affected: string[] = [];
      const queue = [task.id];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (visited.has(curr)) continue;
        visited.add(curr);

        const deps = db.tasks.filter(t => (t.dependencies || "").split(",").map(d => d.trim()).includes(curr));
        for (const dep of deps) {
          if (!affected.includes(`${dep.id} ${dep.name}`)) {
            affected.push(`${dep.id} ${dep.name}`);
            queue.push(dep.id);
          }
        }
      }

      const delayDays = 3; // Simulated projected delay days
      const currentEnd = new Date(task.end);
      const projEnd = new Date(currentEnd.getTime() + delayDays * 24 * 3600 * 1000);
      const projEndDateStr = projEnd.toISOString().slice(0, 10);

      const alertMsg = `${task.id} ${task.name} is running behind. Projected completion: ${projEndDateStr}. Potential delay: ${delayDays} days. Downstream tasks affected: ${affected.length > 0 ? affected.join(", ") : "None"}.`;

      const newAlert = {
        id: "alert-" + Date.now(),
        taskId: task.id,
        taskName: task.name,
        reporterName,
        message: alertMsg,
        type: "delay",
        timestamp: new Date().toISOString(),
        projectedCompletion: projEndDateStr,
        delayDays,
        downstreamAffected: affected
      };

      db.alerts.unshift(newAlert);
      task.status = "overdue";
      task.percent_complete = percent_complete !== undefined ? percent_complete : 15;
    } else {
      // Normal progress updates
      if (percent_complete !== undefined) {
        task.percent_complete = percent_complete;
      }
      if (status) {
        if (status === "completed") {
          task.status = "completed";
          task.percent_complete = 100;
        } else if (status === "inprogress") {
          task.status = "inprogress";
          task.percent_complete = Math.max(10, task.percent_complete || 40);
        } else {
          task.status = status;
        }
      }

      const normalMsg = `${task.id} reported as ${status || "active"} by ${reporterName} (Complete: ${task.percent_complete || 0}%) at ${new Date().toLocaleTimeString()}`;
      const progressAlert = {
        id: "alert-" + Date.now(),
        taskId: task.id,
        taskName: task.name,
        reporterName,
        message: normalMsg,
        type: "progress",
        timestamp: new Date().toISOString()
      };
      db.alerts.unshift(progressAlert);
    }

    db.save();
    res.json({ success: true, task, alerts: db.alerts });
  });

  // Weather and forecast — per-state so a WA job isn't judged by Sydney's sky.
  app.get("/api/v1/weather/forecast", (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    res.json(getForecast(state));
  });

  // GET /api/v1/weather/summary — compact "current conditions" chip per state,
  // used to paint a small weather indicator on each Timeline row.
  app.get("/api/v1/weather/summary", (_req, res) => {
    res.json(getWeatherSummary());
  });

  // GET /api/v1/reports/export: PDF & spreadsheet generation
  app.get("/api/v1/reports/export", async (req, res) => {
    const db = dbInstance;
    const { type, format, projectId } = req.query;
    const selectedProjectId = typeof projectId === "string" ? projectId : "";
    const reportType = typeof type === "string" ? decodeURIComponent(type) : "Report";
    const reportFormat: "PDF" | "Excel" = format === "Excel" ? "Excel" : "PDF";
    const project = selectedProjectId ? db.projects.find(p => p.id === selectedProjectId) : null;
    const projectTasks = selectedProjectId ? db.tasks.filter(t => t.projectId === selectedProjectId) : db.tasks;
    const projectClaims = selectedProjectId ? db.claims.filter(c => c.projectId === selectedProjectId) : db.claims;
    const completedTasks = projectTasks.filter(t => t.status === "completed").length;
    const pendingClaims = projectClaims.filter(c => c.status === "pending").length;
    const projectName = project ? project.name : "All projects";
    const generatedAt = new Date().toISOString();
    const safeName = toSafeExportName(reportType);

    try {
      if (reportFormat === "Excel") {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "SiteWise";
        workbook.created = new Date();

        const summarySheet = workbook.addWorksheet("Summary");
        summarySheet.columns = [
          { header: "Field", key: "field", width: 28 },
          { header: "Value", key: "value", width: 50 },
        ];
        summarySheet.addRows([
          { field: "Report Type", value: reportType },
          { field: "Requested Format", value: reportFormat },
          { field: "Generated At", value: generatedAt },
          { field: "Project", value: projectName },
          { field: "Project ID", value: project ? project.id : "-" },
          { field: "Total tasks", value: projectTasks.length },
          { field: "Completed tasks", value: completedTasks },
          { field: "Total progress claims", value: projectClaims.length },
          { field: "Pending claims", value: pendingClaims },
        ]);
        summarySheet.getRow(1).font = { bold: true };

        const tasksSheet = workbook.addWorksheet("Tasks");
        tasksSheet.columns = [
          { header: "Task ID", key: "id", width: 14 },
          { header: "Task Name", key: "name", width: 38 },
          { header: "Status", key: "status", width: 16 },
          { header: "Project ID", key: "projectId", width: 16 },
        ];
        for (const task of projectTasks) {
          tasksSheet.addRow({
            id: task.id,
            name: task.name,
            status: task.status,
            projectId: task.projectId,
          });
        }
        tasksSheet.getRow(1).font = { bold: true };

        const claimsSheet = workbook.addWorksheet("Claims");
        claimsSheet.columns = [
          { header: "Claim ID", key: "id", width: 14 },
          { header: "Project ID", key: "projectId", width: 16 },
          { header: "Status", key: "status", width: 16 },
          { header: "Certified Amount", key: "certifiedVal", width: 20 },
          { header: "Retention", key: "retentionVal", width: 16 },
        ];
        for (const claim of projectClaims) {
          claimsSheet.addRow({
            id: claim.id,
            projectId: claim.projectId,
            status: claim.status,
            certifiedVal: claim.certifiedVal ?? 0,
            retentionVal: claim.retentionVal ?? 0,
          });
        }
        claimsSheet.getRow(1).font = { bold: true };

        const xlsx = await workbook.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}-export.xlsx"`);
        res.send(Buffer.from(xlsx));
        return;
      }

      const pdf = await buildPdfBuffer({
        reportType,
        reportFormat,
        projectName,
        projectId: project ? project.id : "",
        generatedAt,
        totalTasks: projectTasks.length,
        completedTasks,
        totalClaims: projectClaims.length,
        pendingClaims,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}-export.pdf"`);
      res.send(pdf);
    } catch (error) {
      console.error("Report export failed", error);
      res.status(500).json({ error: "Failed to generate report export" });
    }
  });

  // ─── VITE DEV SERVER / PRODUCTION CONFIG ─────────────────────────────

  if (process.env.DISABLE_HMR === "true" || process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen({ port: PORT, host: "::", ipv6Only: false }, () => {
    console.log(`FlowIQ server ready:`);
    console.log(`  → http://127.0.0.1:${PORT}`);
    console.log(`  → http://localhost:${PORT}`);
  });
}

startServer();
