import type { Resource, Task } from "../types";

/** Full scheduled cost for a task (rate × duration, before % complete). */
export function calculateTaskCost(
  task: Task,
  resource: Resource | undefined
): number {
  const duration = task.durationDays || 5;

  if (task.cost_override !== null && task.cost_override !== undefined) {
    const type = task.cost_override_type || "hourly";
    if (type === "hourly") return task.cost_override * 8 * duration;
    if (type === "daily") return task.cost_override * duration;
    if (type === "lump_sum") return task.cost_override;
    return 0;
  }

  if (!resource) return 0;

  let baseRate = resource.hourlyRateVal || 75;
  if (resource.projectRateOverrides?.[task.projectId] !== undefined) {
    baseRate = resource.projectRateOverrides[task.projectId];
  }
  const dailyAllowance = resource.dailyAllowanceVal || 0;
  return baseRate * 8 * duration + dailyAllowance * duration;
}

/** Earned value for claiming: full cost × percent complete. */
export function calculateTaskEarnedValue(
  task: Task,
  resource: Resource | undefined
): number {
  const fullCost = calculateTaskCost(task, resource);
  const pct = task.percent_complete ?? 0;
  return fullCost * (pct / 100);
}

/** Format a dollar amount as AUD (e.g. A$1,234 or A$1.2M). */
export function formatAud(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `A$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `A$${Math.round(value).toLocaleString("en-AU")}`;
  return `A$${Math.round(value)}`;
}

/** Format a cost delta with verb (e.g. "adds A$500" or "saves A$1.2M"). */
export function formatCostDelta(delta: number): string {
  if (delta === 0) return "no change";
  const verb = delta > 0 ? "adds" : "saves";
  return `${verb} ${formatAud(Math.abs(delta))}`;
}

/** Sum scheduled cost for all tasks in a project (millions). */
export function sumProjectScheduledCost(
  tasks: Task[],
  resources: Resource[],
  projectId: string
): number {
  const total = tasks
    .filter((t) => t.projectId === projectId)
    .reduce((acc, t) => {
      const r = resources.find((res) => res.id === t.assigneeId);
      return acc + calculateTaskCost(t, r);
    }, 0);
  return Math.round((total / 1_000_000) * 1000) / 1000;
}

/** Scheduled labour total for a project (millions, 3 dp). */
export function formatProjectScheduledM(valueM: number): string {
  return `A$${valueM.toFixed(3)}M`;
}

/** Delta on project scheduled total — uses K for small moves, M for large. */
export function formatProjectDeltaM(deltaM: number): string {
  if (deltaM === 0) return "no change";
  const dollars = deltaM * 1_000_000;
  if (Math.abs(dollars) < 10_000) return formatCostDelta(dollars);
  const verb = deltaM > 0 ? "adds" : "saves";
  return `${verb} A$${Math.abs(deltaM).toFixed(3)}M`;
}
