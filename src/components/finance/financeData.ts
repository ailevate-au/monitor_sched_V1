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

export function durationWeeks(projects: Project[]): Array<{ name: string; weeks: number; start: string; end: string }> {
  return projects
    .map((p) => {
      const start = new Date(p.pcStartDate).getTime();
      const end = new Date(p.pcEndDate).getTime();
      const weeks = Number.isFinite(start) && Number.isFinite(end) && end > start
        ? Math.max(1, Math.round((end - start) / (7 * 24 * 3600 * 1000)))
        : 0;
      return { name: p.name, weeks, start: p.pcStartDate, end: p.pcEndDate };
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
const SPEND_WEIGHT_CURVE = [1.3, 0.9, 1.05, 0.75, 1.4, 0.85, 0.9, 0.9, 0.75, 1.1, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];

export const ymOf = (dateStr: string): string => {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const addMonths = (ym: string, n: number): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
};

export interface MonthRange {
  minYM: string;
  maxYM: string;
}

/** Bounds for a date-range picker, spanning every (filtered) project's active months. */
export function monthRangeOf(projects: Project[]): MonthRange | null {
  if (!projects.length) return null;
  let min = ymOf(projects[0].pcStartDate);
  let max = ymOf(projects[0].pcEndDate);
  for (const p of projects) {
    const s = ymOf(p.pcStartDate);
    const e = ymOf(p.pcEndDate);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  return { minYM: min, maxYM: max };
}

/**
 * Real-calendar spend-over-time series — each project's actual cost spread
 * across the real months it's active (pcStartDate → pcEndDate), using the
 * same deterministic weight curve as before but against a real month axis
 * instead of an unlabelled "week 1..N". `range` (from monthRangeOf bounds)
 * clips the returned months and drops projects with no overlap.
 */
export function monthlySpendSeries(
  projects: Project[],
  fin: FinMap,
  range?: { fromYM?: string; toYM?: string } | null
): { rows: Array<Record<string, number | string>>; seriesNames: string[] } {
  const perProject = projects.map((p) => {
    const startYM = ymOf(p.pcStartDate);
    const endYM = ymOf(p.pcEndDate);
    const months: string[] = [];
    let cur = startYM;
    let guard = 0;
    while (cur <= endYM && guard < 240) {
      months.push(cur);
      cur = addMonths(cur, 1);
      guard++;
    }
    const total = actualOf(p, fin[p.id]);
    const curve = SPEND_WEIGHT_CURVE;
    const usedCurve = months.map((_, i) => curve[i % curve.length]);
    const curveSum = usedCurve.reduce((a, b) => a + b, 0) || 1;
    const values = usedCurve.map((w) => (total * w) / curveSum);
    return { name: p.name, months, values };
  });

  let allYMs = Array.from(new Set(perProject.flatMap((p) => p.months))).sort();
  if (range?.fromYM) allYMs = allYMs.filter((ym) => ym >= range.fromYM!);
  if (range?.toYM) allYMs = allYMs.filter((ym) => ym <= range.toYM!);

  const rows = allYMs.map((ym) => {
    const row: Record<string, number | string> = { ym, label: monthLabel(ym) };
    for (const p of perProject) {
      const idx = p.months.indexOf(ym);
      if (idx >= 0) row[p.name] = Math.round(p.values[idx]);
    }
    return row;
  });

  const seriesNames = perProject.filter((p) => p.months.some((m) => allYMs.includes(m))).map((p) => p.name);
  return { rows, seriesNames };
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
