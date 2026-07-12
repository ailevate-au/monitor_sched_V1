/* eslint-disable @typescript-eslint/no-explicit-any */
import { dbInstance } from "../../src/server/db";
import {
  DEFAULT_PROJECTS,
  DEFAULT_RESOURCES,
  DEFAULT_CLAIMS,
  DEFAULT_COST_CATEGORIES,
  DEFAULT_USERS,
  DEFAULT_ALERTS,
  PROJECT_MANAGERS,
  buildBaselineTasks,
  getDefaultMasters,
} from "../../src/server/seedData";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * Fill the in-memory Datastore straight from the seed — no Prisma, no
 * dbInstance.init(). save() is stubbed so route handlers can call it freely.
 */
export function seedInMemory() {
  const db = dbInstance as any;
  db.save = () => {};

  db.projects = clone(DEFAULT_PROJECTS).map((p: any) => ({ ...p, managerEmail: PROJECT_MANAGERS[p.id] }));
  db.resources = clone(DEFAULT_RESOURCES).map((r: any) => ({ ...r, rate_type: r.rate_type || "hourly", projectRateOverrides: {} }));
  db.tasks = buildBaselineTasks();
  db.claims = clone(DEFAULT_CLAIMS);
  db.costCategories = clone(DEFAULT_COST_CATEGORIES);
  db.users = clone(DEFAULT_USERS);
  db.alerts = clone(DEFAULT_ALERTS);
  db.masters = getDefaultMasters();
  db.settings = {
    tightHandover: { enabled: true, thresholdDays: 3 },
    deadlineWarnings: { enabled: false },
  };
  db.undoStack = [];
  db.conflictResolutionLog = [];
  db.conflicts = [];
  db.fragileTasks = [];
  db.conflictMetrics = { hardConflicts: 0, fragileBufferSlots: 0, resolvedThisFortnight: 0 };
}

export function setTask(id: string, patch: Record<string, any>) {
  const t = dbInstance.tasks.find(x => x.id === id) as any;
  if (t) Object.assign(t, patch);
}
