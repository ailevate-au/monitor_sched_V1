import { z } from "zod";

/**
 * Body schemas for mutating endpoints. DELIBERATELY LOOSE:
 *  - every field is optional and passthrough() keeps unknown keys — required-
 *    field checks (and their bespoke error messages) stay in the handlers so
 *    no UI-visible string changes;
 *  - numeric fields accept number OR string wherever the handler already runs
 *    parseFloat/parseInt coercion on them today.
 * What these buy us: a request whose fields are the WRONG TYPE (an object
 * where a string belongs) is rejected with a clean 400 instead of leaking a
 * 500 out of the handler.
 */

const numeric = z.union([z.number(), z.string()]);

// ── users ────────────────────────────────────────────────────────────────
export const userCreateSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  state: z.string().optional(),
  managedProjectIds: z.array(z.string()).optional(),
  alsoResource: z.boolean().optional(),
  trade: z.string().optional(),
  rate: numeric.optional(),
}).passthrough();

export const userUpdateSchema = userCreateSchema;

// ── permissions ──────────────────────────────────────────────────────────
export const permissionsUpdateSchema = z.object({
  permissions: z.record(z.unknown()).optional(),
}).passthrough();

// ── projects ─────────────────────────────────────────────────────────────
const costLineInput = z.object({
  label: z.string().optional(),
  category: z.string().optional(),
  amount: numeric.optional(),
}).passthrough();

export const projectCreateSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  contractor: z.string().optional(),
  state: z.string().optional(),
  originalContractSum: numeric.optional(),
  plannedCost: numeric.optional(),
  ldRatePerDay: numeric.optional(),
  pcEndDate: z.string().optional(),
  retentionPercent: numeric.optional(),
  budgetLines: z.array(costLineInput).optional(),
  revenueReceived: numeric.optional(),
}).passthrough();

export const costLineAddSchema = z.object({
  label: z.string().optional(),
  category: z.string().optional(),
  amount: numeric.optional(),
}).passthrough();

export const revenueSchema = z.object({ revenueReceived: numeric.optional() }).passthrough();

export const projectStatusSchema = z.object({ status: z.string().optional() }).passthrough();

export const projectRatesSchema = z.object({
  resourceRates: z.record(numeric.nullable()).optional(),
}).passthrough();

export const projectImportSchema = z.object({
  rows: z.array(z.record(z.unknown())).optional(),
  sample: z.boolean().optional(),
}).passthrough();

// ── tasks ────────────────────────────────────────────────────────────────
export const taskCreateSchema = z.object({
  project: z.string().optional(),
  name: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  deadline: z.string().nullable().optional(),
  dependencies: z.string().optional(),
  lag_days: numeric.optional(),
  dependency_type: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  trade: z.string().optional(),
  cost_override: numeric.nullable().optional(),
  cost_override_type: z.string().nullable().optional(),
}).passthrough();

export const taskUpdateSchema = taskCreateSchema.extend({
  cascade: z.boolean().optional(),
  percent_complete: numeric.optional(),
});

export const taskStatusSchema = z.object({
  pmStatus: z.string().optional(),
  delayDays: numeric.optional(),
}).passthrough();

export const taskRestoreSchema = z.object({
  tasks: z.array(z.record(z.unknown())).optional(),
}).passthrough();

export const taskProgressSchema = z.object({
  status: z.string().optional(),
  percent_complete: numeric.optional(),
  reportBehind: z.boolean().optional(),
}).passthrough();

// ── resources ────────────────────────────────────────────────────────────
export const resourceCreateSchema = z.object({
  name: z.string().optional(),
  trade: z.string().optional(),
  state: z.string().optional(),
  rate: numeric.optional(),
  email: z.string().optional(),
  company: z.string().optional(),
  overtimeRateVal: numeric.optional(),
  dailyAllowanceVal: numeric.optional(),
  projectRateOverrides: z.record(numeric).optional(),
  bio: z.string().optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  rate_type: z.string().optional(),
}).passthrough();

export const resourceBulkSchema = z.object({
  list: z.array(z.record(z.unknown())).optional(),
}).passthrough();

export const resourceUpdateSchema = resourceCreateSchema;

// ── conflicts / problems / settings ──────────────────────────────────────
export const conflictResolveSchema = z.object({ targetResourceId: z.string().optional() }).passthrough();

export const problemResolveSchema = z.object({ actionId: z.string().optional() }).passthrough();

export const settingsSchema = z.object({
  tightHandover: z.object({
    enabled: z.boolean().optional(),
    thresholdDays: numeric.optional(),
  }).passthrough().optional(),
  deadlineWarnings: z.object({ enabled: z.boolean().optional() }).passthrough().optional(),
}).passthrough();

// ── financial / claims ───────────────────────────────────────────────────
export const varianceSchema = z.object({
  projectId: z.string().optional(),
  description: z.string().optional(),
  amountVal: numeric.optional(),
  type: z.string().optional(),
}).passthrough();

export const claimCreateSchema = z.object({
  projectId: z.string().optional(),
  claimedAmountVal: numeric.optional(),
  dueDate: z.string().optional(),
  costCategoryId: z.string().optional(),
  taskIds: z.string().optional(),
  description: z.string().optional(),
}).passthrough();

export const claimCertifySchema = z.object({ certifiedAmountVal: numeric.optional() }).passthrough();

export const claimUpdateSchema = z.object({
  claimedAmountVal: numeric.optional(),
  costCategoryId: z.string().optional(),
  description: z.string().optional(),
}).passthrough();

// ── masters / cost categories ────────────────────────────────────────────
export const masterUpsertSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  code: z.string().optional(),
  value: z.string().optional(),
}).passthrough();

export const costCategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
}).passthrough();
