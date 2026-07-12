/**
 * Prisma-backed datastore. In-memory cache for sync route handlers;
 * persists to SQLite via Prisma on save().
 */

import { MastersBundle } from "../types/masters";
import { mergeMasters } from "./mastersDefaults";
import { prisma } from "./prisma";
import {
  DEFAULT_ALERTS,
  DEFAULT_CLAIMS,
  DEFAULT_COST_CATEGORIES,
  DEFAULT_PROJECTS,
  DEFAULT_RESOURCES,
  DEFAULT_TASKS,
  DEFAULT_USERS,
  PROJECT_MANAGERS,
  getDefaultMasters,
} from "./seedData";

export type {
  Project,
  Resource,
  Task,
  ProgressClaim,
  Conflict,
  CostCategory,
  CostLine,
  AppUserAccount,
} from "../types";

import type {
  Project,
  Resource,
  Task,
  ProgressClaim,
  Conflict,
  CostCategory,
  CostLine,
  AppUserAccount,
} from "../types";

function safeParseCostLines(json: string | null | undefined): CostLine[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as CostLine[]) : [];
  } catch {
    return [];
  }
}

function mastersFromRows(rows: Awaited<ReturnType<typeof prisma.masterItem.findMany>>): MastersBundle {
  const bundle: MastersBundle = { states: [], sectors: [], trades: [], companies: [] };
  for (const row of rows) {
    const item = {
      id: row.id,
      label: row.label,
      is_active: row.isActive,
      is_system: row.isSystem,
      sort_order: row.sortOrder,
      ...(row.code ? { code: row.code } : {}),
      ...(row.value ? { value: row.value } : {}),
    };
    if (row.type === "states") bundle.states.push(item as any);
    else if (row.type === "sectors") bundle.sectors.push(item as any);
    else if (row.type === "trades") bundle.trades.push(item as any);
    else if (row.type === "companies") bundle.companies.push(item as any);
  }
  return mergeMasters(bundle);
}

export class Datastore {
  projects: Project[] = [];
  resources: Resource[] = [];
  tasks: Task[] = [];
  claims: ProgressClaim[] = [];
  conflicts: Conflict[] = [];
  costCategories: CostCategory[] = [];
  users: AppUserAccount[] = [];
  masters: MastersBundle = getDefaultMasters();
  alerts: any[] = [];
  // Demo scheduling knobs (in-memory; default on boot). `tightHandover.enabled`
  // turns the fragile/tight-handover problem type on/off; `thresholdDays` is the
  // minimum acceptable working-day buffer — a handover is flagged when the gap is
  // strictly LESS than this (default 3 → flags gaps of 0/1/2 working days).
  // `deadlineWarnings.enabled` is the opt-in "behind schedule" check: when on, a
  // job whose live `end` runs past its `deadline` (must-finish-by date) is flagged
  // overdue on the Timeline and surfaces as a "Running late" problem. Default OFF so
  // the tuned demo scenario is untouched until the owner turns it on.
  settings = {
    tightHandover: { enabled: true, thresholdDays: 3 },
    deadlineWarnings: { enabled: false },
  };
  undoStack: Array<{ targetId: string; prevAssigneeId: string | null }> = [];
  conflictResolutionLog: Array<{ resourceId: string; resolvedAt: string; undone: boolean }> = [];
  conflictMetrics = {
    hardConflicts: 0,
    fragileBufferSlots: 0,
    resolvedThisFortnight: 0,
  };
  fragileTasks: Array<{
    id: string;
    name: string;
    resource: string;
    trade: string;
    bufferDays: number;
    desc: string;
    childId?: string;
  }> = [];
  private ready = false;

  async init() {
    if (this.ready) return;
    const count = await prisma.project.count();
    if (count === 0) {
      await this.seedDefaults();
    }
    await this.loadFromPrisma();
    this.modernizeInMemory();
    this.ready = true;
  }

  private async seedDefaults() {
    for (const c of DEFAULT_COST_CATEGORIES) {
      await prisma.costCategory.create({
        data: { id: c.id, name: c.name, isActive: c.is_active, sortOrder: c.sort_order },
      });
    }
    for (const p of DEFAULT_PROJECTS) {
      await prisma.project.create({
        data: {
          id: p.id, name: p.name, type: p.type, location: p.location, contractor: p.contractor,
          state: p.state, originalContractSum: p.originalContractSum, finalContractSum: p.finalContractSum,
          plannedCost: p.plannedCost, actualCost: p.actualCost, ldRatePerDay: p.ldRatePerDay,
          pcStartDate: p.pcStartDate, pcEndDate: p.pcEndDate, retentionPercent: p.retentionPercent,
          status: p.status, progress: p.progress, weatherRisk: p.weatherRisk, overBudget: p.overBudget,
          budgetLinesJson: JSON.stringify((p as any).budgetLines ?? []),
          actualLinesJson: JSON.stringify((p as any).actualLines ?? []),
          revenueReceived: (p as any).revenueReceived ?? null,
        },
      });
    }
    for (const r of DEFAULT_RESOURCES) {
      await prisma.resource.create({
        data: {
          id: r.id, initials: r.initials, name: r.name, trade: r.trade, state: r.state,
          rate: r.rate, hourlyRateVal: r.hourlyRateVal, util: r.util, status: r.status, rateType: "hourly",
        },
      });
    }
    for (const t of DEFAULT_TASKS) {
      await prisma.task.create({
        data: {
          id: t.id, projectId: t.projectId, name: t.name, assigneeId: t.assigneeId,
          tradeRequired: t.tradeRequired, start: t.start, end: t.end,
          deadline: (t as any).deadline ?? t.end, durationDays: t.durationDays,
          dependencies: t.dependencies, status: t.status, dependencyType: "FS", lagDays: 0,
          percentComplete:
            (t as any).percent_complete ??
            (t.status === "completed" ? 100 : t.status === "inprogress" ? 40 : 0),
        },
      });
    }
    for (const c of DEFAULT_CLAIMS) {
      await prisma.progressClaim.create({
        data: {
          id: c.id, claimNumber: c.claimNumber, projectId: c.projectId, projectName: c.project,
          period: c.period, claimedAmount: c.claimedAmount, certifiedAmount: c.certifiedAmount,
          claimedVal: c.claimedVal, certifiedVal: c.certifiedVal, retentionVal: c.retentionVal,
          dueDate: c.dueDate, status: c.status, costCategoryId: c.costCategoryId, costCategoryName: c.costCategoryName,
          taskIds: "",
          description: "",
        },
      });
    }
    const masters = getDefaultMasters();
    for (const type of ["states", "sectors", "trades", "companies"] as const) {
      for (const item of masters[type]) {
        await prisma.masterItem.create({
          data: {
            id: item.id, type, label: item.label, code: item.code ?? null, value: item.value ?? null,
            isActive: item.is_active, isSystem: item.is_system ?? false, sortOrder: item.sort_order,
          },
        });
      }
    }
    for (const a of DEFAULT_ALERTS) {
      await prisma.alert.create({
        data: {
          id: a.id, taskId: a.taskId, taskName: a.taskName, reporterName: a.reporterName,
          message: a.message, type: a.type, timestamp: a.timestamp,
        },
      });
    }
    for (const u of DEFAULT_USERS) {
      await prisma.appUser.create({
        data: {
          id: u.id, name: u.name, email: u.email, role: u.role, state: u.state,
          managedProjectIds: (u.managedProjectIds || []).join(","),
          linkedResourceId: u.linkedResourceId,
        },
      });
    }
  }

  private async loadFromPrisma() {
    const [projects, resources, overrides, tasks, claims, categories, conflicts, masters, alerts, undo, users] =
      await Promise.all([
        prisma.project.findMany(),
        prisma.resource.findMany(),
        prisma.projectRateOverride.findMany(),
        prisma.task.findMany(),
        prisma.progressClaim.findMany(),
        prisma.costCategory.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.conflictRecord.findMany(),
        prisma.masterItem.findMany(),
        prisma.alert.findMany(),
        prisma.undoEntry.findMany(),
        prisma.appUser.findMany(),
      ]);

    const overrideMap: Record<string, Record<string, number>> = {};
    for (const o of overrides) {
      if (!overrideMap[o.resourceId]) overrideMap[o.resourceId] = {};
      overrideMap[o.resourceId][o.projectId] = o.hourlyRate;
    }

    this.projects = projects.map(p => ({
      id: p.id, name: p.name, type: p.type, location: p.location, contractor: p.contractor,
      state: p.state, originalContractSum: p.originalContractSum, finalContractSum: p.finalContractSum,
      plannedCost: p.plannedCost, actualCost: p.actualCost, ldRatePerDay: p.ldRatePerDay,
      pcStartDate: p.pcStartDate, pcEndDate: p.pcEndDate, retentionPercent: p.retentionPercent,
      status: p.status as Project["status"], progress: p.progress, weatherRisk: p.weatherRisk, overBudget: p.overBudget,
      budgetLines: safeParseCostLines((p as any).budgetLinesJson),
      actualLines: safeParseCostLines((p as any).actualLinesJson),
      revenueReceived: (p as any).revenueReceived ?? undefined,
    }));

    this.resources = resources.map(r => ({
      id: r.id, initials: r.initials, name: r.name, trade: r.trade, state: r.state,
      rate: r.rate, hourlyRateVal: r.hourlyRateVal, util: r.util,
      status: r.status as Resource["status"], rate_type: r.rateType as Resource["rate_type"],
      email: r.email ?? undefined, company: r.company ?? undefined,
      overtimeRateVal: r.overtimeRateVal ?? undefined, dailyAllowanceVal: r.dailyAllowanceVal ?? undefined,
      projectRateOverrides: overrideMap[r.id] ?? {},
    }));

    this.tasks = tasks.map(t => ({
      id: t.id, projectId: t.projectId, name: t.name, assigneeId: t.assigneeId,
      tradeRequired: t.tradeRequired, start: t.start, end: t.end,
      deadline: (t as any).deadline ?? t.end, durationDays: t.durationDays,
      dependencies: t.dependencies, status: t.status as Task["status"],
      lag_days: t.lagDays,
      dependency_type: (t.dependencyType === "SS" ? "SS" : "FS") as "FS" | "SS",
      cost_override: t.costOverride, cost_override_type: t.costOverrideType as Task["cost_override_type"],
      percent_complete: t.percentComplete,
    }));

    this.claims = claims.map(c => ({
      id: c.id, claimNumber: c.claimNumber, projectId: c.projectId, project: c.projectName,
      period: c.period, claimedAmount: c.claimedAmount, certifiedAmount: c.certifiedAmount,
      claimedVal: c.claimedVal, certifiedVal: c.certifiedVal, retentionVal: c.retentionVal,
      dueDate: c.dueDate, status: c.status as ProgressClaim["status"],
      costCategoryId: c.costCategoryId ?? undefined, costCategoryName: c.costCategoryName ?? undefined,
      taskIds: c.taskIds || "",
      description: c.description || "",
    }));

    this.costCategories = categories.map(c => ({
      id: c.id, name: c.name, is_active: c.isActive, sort_order: c.sortOrder,
    }));

    this.conflicts = conflicts.map(c => ({
      id: c.id, resourceId: c.resourceId, resource: c.resource, trade: c.trade,
      rate: c.rate, desc: c.desc, candidates: JSON.parse(c.candidates || "[]"),
    }));

    this.masters = mastersFromRows(masters);
    this.alerts = alerts.map(a => ({
      id: a.id, taskId: a.taskId, taskName: a.taskName, reporterName: a.reporterName,
      message: a.message, type: a.type, timestamp: a.timestamp,
      ...(a.payload ? JSON.parse(a.payload) : {}),
    }));
    this.undoStack = undo.map(u => ({ targetId: u.targetId, prevAssigneeId: u.prevAssigneeId }));
    this.users = users.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role as AppUserAccount["role"],
      state: u.state ?? undefined,
      managedProjectIds: u.managedProjectIds ? u.managedProjectIds.split(",").filter(Boolean) : [],
      linkedResourceId: u.linkedResourceId ?? undefined,
    }));
  }

  private modernizeInMemory() {
    // PM ownership: prefer the users store (managedProjectIds), fall back to the
    // static seed map for projects nobody has explicitly been assigned to yet.
    const pmByProject: Record<string, string> = { ...PROJECT_MANAGERS };
    for (const u of this.users) {
      if (u.role !== "PM") continue;
      for (const pid of u.managedProjectIds || []) {
        pmByProject[pid] = u.email;
      }
    }
    this.projects = this.projects.map(p => ({
      ...p,
      managerEmail: pmByProject[p.id],
    }));

    const seenCategoryNames = new Set(this.costCategories.map((c) => c.name.trim().toLowerCase()));
    const maxSortOrder = this.costCategories.reduce((max, cat) => Math.max(max, cat.sort_order || 0), 0);
    let nextSortOrder = maxSortOrder + 1;
    DEFAULT_COST_CATEGORIES.forEach((cat) => {
      const key = cat.name.trim().toLowerCase();
      if (seenCategoryNames.has(key)) return;
      this.costCategories.push({
        id: cat.id,
        name: cat.name,
        is_active: true,
        sort_order: nextSortOrder++,
      });
      seenCategoryNames.add(key);
    });
    this.resources = this.resources.map(r => ({ ...r, rate_type: r.rate_type || "hourly" }));
    this.tasks = this.tasks.map(t => {
      let defaultPct = 0;
      if (t.status === "completed") defaultPct = 100;
      else if (t.status === "inprogress") defaultPct = 40;
      else if (t.id === "TSK-001" || t.id === "TSK-006") defaultPct = 15;
      return {
        ...t,
        deadline: t.deadline ?? t.end,
        lag_days: t.lag_days ?? 0,
        dependency_type: t.dependency_type ?? "FS",
        cost_override: t.cost_override ?? null,
        cost_override_type: t.cost_override_type ?? null,
        percent_complete: t.percent_complete ?? defaultPct,
      };
    });
    this.claims = this.claims.map(c => ({
      ...c,
      costCategoryId: c.costCategoryId ?? "cc1",
      costCategoryName: c.costCategoryName ?? "Labour",
      taskIds: c.taskIds ?? "",
      description: c.description ?? "",
    }));
  }

  // Persists are serialized on a promise chain: routes still call save() fire-
  // and-forget (no latency change), but two saves can no longer interleave
  // their deleteMany/upsert transactions, and failures are logged, not lost.
  private persistChain: Promise<void> = Promise.resolve();

  save() {
    this.persistChain = this.persistChain
      .then(() => this.persistToPrisma())
      .catch(err => console.error("Prisma persist error:", err));
  }

  /** Wait until every queued persist has finished (tests, graceful shutdown). */
  async flush() {
    await this.persistChain;
  }

  private async persistToPrisma() {
    await prisma.$transaction([
      ...this.projects.map(p => prisma.project.upsert({
        where: { id: p.id },
        create: {
          id: p.id, name: p.name, type: p.type, location: p.location, contractor: p.contractor,
          state: p.state, originalContractSum: p.originalContractSum, finalContractSum: p.finalContractSum,
          plannedCost: p.plannedCost, actualCost: p.actualCost, ldRatePerDay: p.ldRatePerDay,
          pcStartDate: p.pcStartDate, pcEndDate: p.pcEndDate, retentionPercent: p.retentionPercent ?? 5,
          status: p.status, progress: p.progress, weatherRisk: p.weatherRisk, overBudget: p.overBudget,
          budgetLinesJson: JSON.stringify(p.budgetLines ?? []),
          actualLinesJson: JSON.stringify(p.actualLines ?? []),
          revenueReceived: p.revenueReceived ?? null,
        },
        update: {
          name: p.name, type: p.type, location: p.location, contractor: p.contractor, state: p.state,
          originalContractSum: p.originalContractSum, finalContractSum: p.finalContractSum,
          plannedCost: p.plannedCost, actualCost: p.actualCost, ldRatePerDay: p.ldRatePerDay,
          pcStartDate: p.pcStartDate, pcEndDate: p.pcEndDate, retentionPercent: p.retentionPercent ?? 5,
          status: p.status, progress: p.progress, weatherRisk: p.weatherRisk, overBudget: p.overBudget,
          budgetLinesJson: JSON.stringify(p.budgetLines ?? []),
          actualLinesJson: JSON.stringify(p.actualLines ?? []),
          revenueReceived: p.revenueReceived ?? null,
        },
      })),
    ]);

    for (const r of this.resources) {
      await prisma.resource.upsert({
        where: { id: r.id },
        create: {
          id: r.id, initials: r.initials, name: r.name, trade: r.trade, state: r.state,
          rate: r.rate, hourlyRateVal: r.hourlyRateVal, util: r.util, status: r.status,
          rateType: r.rate_type || "hourly", email: r.email, company: r.company,
          overtimeRateVal: r.overtimeRateVal, dailyAllowanceVal: r.dailyAllowanceVal,
        },
        update: {
          initials: r.initials, name: r.name, trade: r.trade, state: r.state, rate: r.rate,
          hourlyRateVal: r.hourlyRateVal, util: r.util, status: r.status,
          rateType: r.rate_type || "hourly", email: r.email, company: r.company,
          overtimeRateVal: r.overtimeRateVal, dailyAllowanceVal: r.dailyAllowanceVal,
        },
      });
      await prisma.projectRateOverride.deleteMany({ where: { resourceId: r.id } });
      for (const [projectId, hourlyRate] of Object.entries(r.projectRateOverrides || {})) {
        await prisma.projectRateOverride.create({
          data: { projectId, resourceId: r.id, hourlyRate },
        });
      }
    }

    const taskIds = this.tasks.map(t => t.id);
    if (taskIds.length > 0) {
      await prisma.task.deleteMany({ where: { id: { notIn: taskIds } } });
    }
    for (const t of this.tasks) {
      await prisma.task.upsert({
        where: { id: t.id },
        create: {
          id: t.id, projectId: t.projectId, name: t.name, assigneeId: t.assigneeId,
          tradeRequired: t.tradeRequired, start: t.start, end: t.end,
          deadline: t.deadline ?? t.end, durationDays: t.durationDays,
          dependencies: t.dependencies, status: t.status,
          lagDays: t.lag_days ?? 0, dependencyType: t.dependency_type ?? "FS",
          costOverride: t.cost_override, costOverrideType: t.cost_override_type,
          percentComplete: t.percent_complete ?? 0,
        },
        update: {
          projectId: t.projectId, name: t.name, assigneeId: t.assigneeId,
          tradeRequired: t.tradeRequired, start: t.start, end: t.end,
          deadline: t.deadline ?? t.end, durationDays: t.durationDays,
          dependencies: t.dependencies, status: t.status,
          lagDays: t.lag_days ?? 0, dependencyType: t.dependency_type ?? "FS",
          costOverride: t.cost_override, costOverrideType: t.cost_override_type,
          percentComplete: t.percent_complete ?? 0,
        },
      });
    }

    for (const c of this.claims) {
      await prisma.progressClaim.upsert({
        where: { id: c.id },
        create: {
          id: c.id, claimNumber: c.claimNumber, projectId: c.projectId, projectName: c.project,
          period: c.period, claimedAmount: c.claimedAmount, certifiedAmount: c.certifiedAmount,
          claimedVal: c.claimedVal, certifiedVal: c.certifiedVal, retentionVal: c.retentionVal,
          dueDate: c.dueDate, status: c.status, costCategoryId: c.costCategoryId, costCategoryName: c.costCategoryName,
          taskIds: c.taskIds ?? "",
          description: c.description ?? "",
        },
        update: {
          claimNumber: c.claimNumber, projectId: c.projectId, projectName: c.project,
          period: c.period, claimedAmount: c.claimedAmount, certifiedAmount: c.certifiedAmount,
          claimedVal: c.claimedVal, certifiedVal: c.certifiedVal, retentionVal: c.retentionVal,
          dueDate: c.dueDate, status: c.status, costCategoryId: c.costCategoryId, costCategoryName: c.costCategoryName,
          taskIds: c.taskIds ?? "",
          description: c.description ?? "",
        },
      });
    }

    for (const cat of this.costCategories) {
      await prisma.costCategory.upsert({
        where: { id: cat.id },
        create: { id: cat.id, name: cat.name, isActive: cat.is_active, sortOrder: cat.sort_order },
        update: { name: cat.name, isActive: cat.is_active, sortOrder: cat.sort_order },
      });
    }

    await prisma.conflictRecord.deleteMany();
    for (const c of this.conflicts) {
      await prisma.conflictRecord.create({
        data: {
          id: c.id, resourceId: c.resourceId, resource: c.resource, trade: c.trade,
          rate: c.rate, desc: c.desc, candidates: JSON.stringify(c.candidates),
        },
      });
    }

    for (const type of ["states", "sectors", "trades", "companies"] as const) {
      for (const item of this.masters[type]) {
        await prisma.masterItem.upsert({
          where: { id: item.id },
          create: {
            id: item.id, type, label: item.label, code: item.code ?? null, value: item.value ?? null,
            isActive: item.is_active, isSystem: item.is_system ?? false, sortOrder: item.sort_order,
          },
          update: {
            label: item.label, code: item.code ?? null, value: item.value ?? null,
            isActive: item.is_active, isSystem: item.is_system ?? false, sortOrder: item.sort_order,
          },
        });
      }
    }

    await prisma.alert.deleteMany();
    for (const a of this.alerts) {
      const { id, taskId, taskName, reporterName, message, type, timestamp, ...rest } = a;
      await prisma.alert.create({
        data: {
          id, taskId, taskName, reporterName, message, type, timestamp,
          payload: Object.keys(rest).length ? JSON.stringify(rest) : null,
        },
      });
    }

    await prisma.undoEntry.deleteMany();
    for (const u of this.undoStack) {
      await prisma.undoEntry.create({
        data: { targetId: u.targetId, prevAssigneeId: u.prevAssigneeId },
      });
    }

    const userIds = this.users.map(u => u.id);
    if (userIds.length > 0) {
      await prisma.appUser.deleteMany({ where: { id: { notIn: userIds } } });
    }
    for (const u of this.users) {
      await prisma.appUser.upsert({
        where: { id: u.id },
        create: {
          id: u.id, name: u.name, email: u.email, role: u.role, state: u.state,
          managedProjectIds: (u.managedProjectIds || []).join(","),
          linkedResourceId: u.linkedResourceId,
        },
        update: {
          name: u.name, email: u.email, role: u.role, state: u.state,
          managedProjectIds: (u.managedProjectIds || []).join(","),
          linkedResourceId: u.linkedResourceId,
        },
      });
    }
  }
}

export const dbInstance = new Datastore();
