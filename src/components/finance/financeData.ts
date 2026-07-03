import { Project } from "../../types";
import { toDollars } from "../../lib/money";

/** Shape of GET /api/v1/financial/projects/:id — dollar-native fields render with fmtMoney. */
export interface ProjectFinDetail {
  name: string;
  contractSumVal: number;
  plannedCostVal: number;
  actualCostVal: number;
  scheduledCostVal?: number;
  profitVal: number;
  marginVal: number;
  costOverrunVal: number;
  revenueVarianceVal: number;
  retentionBalanceVal: number;
  ldExposure: number;
  budgetLinesTotalVal?: number;
  actualLinesTotalVal?: number;
  projectedFinalCostVal?: number;
  revenueReceivedVal?: number;
  projectedProfitVal?: number;
  actualProfitVal?: number;
  status?: string;
  categoryBreakdown?: Array<{ category: string; expected: number; actual: number; variance: number }>;
  budgetLinesTotalDollars?: number;
  actualLinesTotalDollars?: number;
  revenueDollars?: number;
  contractSumDollars?: number;
  projectedProfitDollars?: number;
  actualProfitDollars?: number;
}

export type FinMap = Record<string, ProjectFinDetail>;

/** Fixed category → color assignment, so a category is always the same color across charts. */
export const CATEGORY_ORDER = ["Labour", "Materials", "Subcontractors", "Plant & Equipment", "Machinery"];

const contractOf = (p: Project) => toDollars(p.finalContractSum);
const actualOf = (p: Project, fin?: ProjectFinDetail) => fin?.actualLinesTotalDollars ?? toDollars(p.actualCost);
const projectedOf = (p: Project, fin?: ProjectFinDetail) => fin?.budgetLinesTotalDollars ?? toDollars(p.plannedCost);
const profitOf = (p: Project, fin?: ProjectFinDetail) => fin?.actualProfitDollars ?? (toDollars(p.finalContractSum) - actualOf(p, fin));

export function portfolioKpis(projects: Project[], fin: FinMap) {
  const totalContract = projects.reduce((acc, p) => acc + contractOf(p), 0);
  const totalProfit = projects.reduce((acc, p) => acc + profitOf(p, fin[p.id]), 0);
  const totalCosts = projects.reduce((acc, p) => acc + actualOf(p, fin[p.id]), 0);
  const margins = projects
    .filter((p) => contractOf(p) > 0)
    .map((p) => profitOf(p, fin[p.id]) / contractOf(p));
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
  return { numProjects: projects.length, totalContract, totalProfit, totalCosts, avgMargin };
}

export function projectsByType(projects: Project[]): Array<{ name: string; value: number }> {
  const byType = new Map<string, number>();
  for (const p of projects) byType.set(p.type, (byType.get(p.type) || 0) + 1);
  return Array.from(byType.entries()).map(([name, value]) => ({ name, value }));
}

export function projectsByRegion(projects: Project[]): Array<{ name: string; size: number }> {
  const byRegion = new Map<string, number>();
  for (const p of projects) byRegion.set(p.state, (byRegion.get(p.state) || 0) + 1);
  return Array.from(byRegion.entries()).map(([name, size]) => ({ name, size }));
}

export function durationWeeks(projects: Project[]): Array<{ name: string; weeks: number }> {
  return projects
    .map((p) => {
      const start = new Date(p.pcStartDate).getTime();
      const end = new Date(p.pcEndDate).getTime();
      const weeks = Number.isFinite(start) && Number.isFinite(end) && end > start
        ? Math.max(1, Math.round((end - start) / (7 * 24 * 3600 * 1000)))
        : 0;
      return { name: p.name, weeks };
    })
    .sort((a, b) => b.weeks - a.weeks);
}

/**
 * Weekly expense series aren't stored (only a lifetime actual-cost total per
 * project), so we spread each project's actual cost across its duration with
 * a fixed, deterministic weight curve (front-loaded, dips mid-project, a
 * closeout bump) — the same shape every time for a given project, not random.
 * This is an approximation for the chart, not a source of truth.
 */
const WEEK_WEIGHT_CURVE = [1.3, 0.9, 1.05, 0.75, 1.4, 0.85, 0.9, 0.9, 0.75, 1.1, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];

export function weeklyExpensesSeries(
  projects: Project[],
  fin: FinMap
): { weeks: number; rows: Array<Record<string, number | string>>; seriesNames: string[] } {
  const perProject = projects.map((p) => {
    const weeks = Math.max(4, Math.min(16, durationWeeksFor(p)));
    const total = actualOf(p, fin[p.id]);
    const curve = WEEK_WEIGHT_CURVE.slice(0, weeks);
    const curveSum = curve.reduce((a, b) => a + b, 0) || 1;
    const values = curve.map((w) => (total * w) / curveSum);
    return { name: p.name, weeks, values };
  });
  const maxWeeks = perProject.reduce((m, p) => Math.max(m, p.weeks), 0);
  const rows: Array<Record<string, number | string>> = [];
  for (let w = 0; w < maxWeeks; w++) {
    const row: Record<string, number | string> = { week: w + 1 };
    for (const p of perProject) {
      if (w < p.values.length) row[p.name] = Math.round(p.values[w]);
    }
    rows.push(row);
  }
  return { weeks: maxWeeks, rows, seriesNames: perProject.map((p) => p.name) };
}

function durationWeeksFor(p: Project): number {
  const start = new Date(p.pcStartDate).getTime();
  const end = new Date(p.pcEndDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 8;
  return Math.max(4, Math.round((end - start) / (7 * 24 * 3600 * 1000)));
}

function groupSum(
  projects: Project[],
  fin: FinMap,
  keyFn: (p: Project) => string
): Array<{ name: string; contract: number; actual: number }> {
  const byKey = new Map<string, { contract: number; actual: number }>();
  for (const p of projects) {
    const key = keyFn(p);
    const cur = byKey.get(key) || { contract: 0, actual: 0 };
    cur.contract += contractOf(p);
    cur.actual += actualOf(p, fin[p.id]);
    byKey.set(key, cur);
  }
  return Array.from(byKey.entries()).map(([name, v]) => ({ name, ...v }));
}

export const budgetVsCostByType = (projects: Project[], fin: FinMap) => groupSum(projects, fin, (p) => p.type);
export const budgetVsCostByRegion = (projects: Project[], fin: FinMap) => groupSum(projects, fin, (p) => p.state);
export const budgetVsCostByContractor = (projects: Project[], fin: FinMap) => groupSum(projects, fin, (p) => p.contractor);

export function marginByProject(projects: Project[], fin: FinMap): Array<{ name: string; marginPct: number }> {
  return projects.map((p) => {
    const f = fin[p.id];
    const contract = contractOf(p);
    const projected = f?.projectedProfitDollars ?? (contract - projectedOf(p, f));
    return { name: p.name, marginPct: contract > 0 ? Math.round((projected / contract) * 1000) / 10 : 0 };
  });
}

export function costOverrunByProject(projects: Project[], fin: FinMap): Array<{ name: string; overrun: number }> {
  return projects
    .map((p) => ({ name: p.name, overrun: actualOf(p, fin[p.id]) - projectedOf(p, fin[p.id]) }))
    .sort((a, b) => b.overrun - a.overrun);
}

export function expensesShareByProject(projects: Project[], fin: FinMap): Array<{ name: string; value: number }> {
  return projects.map((p) => ({ name: p.name, value: actualOf(p, fin[p.id]) }));
}

export function categoryStackedByProject(
  projects: Project[],
  fin: FinMap
): Array<Record<string, number | string>> {
  return projects.map((p) => {
    const row: Record<string, number | string> = { name: p.name };
    const breakdown = fin[p.id]?.categoryBreakdown || [];
    for (const cat of CATEGORY_ORDER) {
      row[cat] = breakdown.find((c) => c.category === cat)?.actual ?? 0;
    }
    return row;
  });
}
