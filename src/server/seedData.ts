import { MastersBundle } from "../types/masters";
import { cloneDefaultMasters } from "./mastersDefaults";

export const DEFAULT_COST_CATEGORIES = [
  { id: "cc1", name: "Labour", is_active: true, sort_order: 1 },
  { id: "cc2", name: "Subcontractors", is_active: true, sort_order: 2 },
  { id: "cc3", name: "Materials", is_active: true, sort_order: 3 },
  { id: "cc4", name: "Plant & Equipment", is_active: true, sort_order: 4 },
  { id: "cc5", name: "Machinery", is_active: true, sort_order: 5 },
];

export const DEFAULT_PROJECTS = [
  {
    id: "p1", name: "Parramatta Square — Tower C", type: "Mixed-use development",
    location: "Parramatta NSW", contractor: "Lendlease", state: "NSW",
    originalContractSum: 58.0, finalContractSum: 68.0, plannedCost: 58.0, actualCost: 60.4,
    ldRatePerDay: 68000, pcStartDate: "2026-03-01", pcEndDate: "2026-09-30",
    retentionPercent: 5.0, status: "ACTIVE", progress: 41, weatherRisk: true, overBudget: true,
  },
  {
    id: "p2", name: "Victoria Harbour — Stage 2", type: "High-density residential",
    location: "Docklands VIC", contractor: "CPB Contractors", state: "VIC",
    originalContractSum: 36.0, finalContractSum: 54.0, plannedCost: 36.0, actualCost: 34.0,
    ldRatePerDay: 54000, pcStartDate: "2026-02-15", pcEndDate: "2026-11-30",
    retentionPercent: 5.0, status: "ACTIVE", progress: 28, weatherRisk: false, overBudget: false,
  },
  {
    id: "p3", name: "Southbank Residences — T1", type: "High-density residential",
    location: "South Brisbane QLD", contractor: "John Holland", state: "QLD",
    originalContractSum: 41.0, finalContractSum: 41.0, plannedCost: 8.2, actualCost: 7.4,
    ldRatePerDay: 41000, pcStartDate: "2026-05-01", pcEndDate: "2026-12-20",
    retentionPercent: 5.0, status: "ACTIVE", progress: 18, weatherRisk: false, overBudget: false,
  },
  {
    id: "p4", name: "North Ryde Business Park — S1", type: "Commercial fitout",
    location: "North Ryde NSW", contractor: "Built", state: "NSW",
    originalContractSum: 24.0, finalContractSum: 24.0, plannedCost: 20.0, actualCost: 20.6,
    ldRatePerDay: 24000, pcStartDate: "2025-01-01", pcEndDate: "2025-05-15",
    retentionPercent: 5.0, status: "PRACTICAL_COMPLETION", progress: 100, weatherRisk: false, overBudget: false,
  },
];

// 10 resources — 2 in conflict (Ben and Tom), rest available at varying load
export const DEFAULT_RESOURCES = [
  { id: "r1",  initials: "BN", name: "Ben Nguyen",       trade: "Formwork Foreman",      state: "NSW", rate: "A$62/hr",  hourlyRateVal: 62,  util: 130, status: "conflict" },
  { id: "r2",  initials: "JW", name: "James Walsh",      trade: "Structural Foreman",    state: "NSW", rate: "A$68/hr",  hourlyRateVal: 68,  util: 84,  status: "fragile"  },
  { id: "r3",  initials: "MO", name: "Matt O'Brien",     trade: "Site Manager",          state: "VIC", rate: "A$85/hr",  hourlyRateVal: 85,  util: 72,  status: "ok"       },
  { id: "r4",  initials: "TK", name: "Tom Kowalski",     trade: "Piling Subcontractor",  state: "VIC", rate: "A$75/hr",  hourlyRateVal: 75,  util: 120, status: "conflict" },
  { id: "r5",  initials: "AP", name: "Anika Patel",      trade: "Services Coordinator",  state: "QLD", rate: "A$58/hr",  hourlyRateVal: 58,  util: 65,  status: "ok"       },
  { id: "r6",  initials: "CT", name: "Chris Thompson",   trade: "Interior Foreman",      state: "NSW", rate: "A$55/hr",  hourlyRateVal: 55,  util: 40,  status: "ok"       },
  { id: "r7",  initials: "SL", name: "Sam Liu",          trade: "Quantity Surveyor",     state: "NSW", rate: "A$72/hr",  hourlyRateVal: 72,  util: 55,  status: "ok"       },
  { id: "r8",  initials: "RM", name: "Rachel Murphy",    trade: "HSE Officer",           state: "NSW", rate: "A$65/hr",  hourlyRateVal: 65,  util: 22,  status: "ok"       },
  { id: "r9",  initials: "WR", name: "Wayne Roberts",    trade: "Formwork Foreman",      state: "NSW", rate: "A$60/hr",  hourlyRateVal: 60,  util: 58,  status: "ok"       },
  { id: "r10", initials: "YN", name: "Yuni Nanda",       trade: "Project Coordinator",   state: "VIC", rate: "A$36/hr",  hourlyRateVal: 36,  util: 45,  status: "ok"       },
];

// 26 tasks across 3 active projects
// INTENDED CONFLICTS (only these two):
//   Ben Nguyen (r1): TSK-P1-01 p1 Jun 1–7  ↔  TSK-P2-03 p2 Jun 1–9   → double-booked
//   Tom Kowalski(r4): TSK-P2-02 p2 Jun 2–20 ↔  TSK-P3-01 p3 Jun 1–19  → double-booked
// All other resources have non-overlapping task dates.
// Ben is also packed in p1 with 2 back-to-back formwork tasks showing a busy schedule.
// James has 2 sequential structural tasks in p1 with a 1-day buffer (fragile).
export const DEFAULT_TASKS = [

  // ─── PARRAMATTA SQUARE — TOWER C (p1) ───────────────────────────────────
  // Ben: 2 formwork tasks packed back-to-back + CONFLICT in p2
  { id: "TSK-P1-01", projectId: "p1", name: "Formwork Pour — Level 4",            assigneeId: "r1",  tradeRequired: "Formwork Foreman",     start: "2026-06-01", end: "2026-06-07", durationDays: 5,  dependencies: "-",        status: "conflict",   percent_complete: 40 },
  { id: "TSK-P1-02", projectId: "p1", name: "Formwork Pour — Level 5",            assigneeId: "r1",  tradeRequired: "Formwork Foreman",     start: "2026-06-10", end: "2026-06-15", durationDays: 5,  dependencies: "TSK-P1-01", status: "scheduled",  percent_complete: 0  },
  // James: 2 structural tasks with 1-day gap (fragile buffer)
  { id: "TSK-P1-03", projectId: "p1", name: "Structural Steel Frame — Level 4",   assigneeId: "r2",  tradeRequired: "Structural Foreman",   start: "2026-06-08", end: "2026-06-22", durationDays: 11, dependencies: "TSK-P1-01", status: "scheduled",  percent_complete: 0  },
  { id: "TSK-P1-04", projectId: "p1", name: "Structural Steel Frame — Level 5",   assigneeId: "r2",  tradeRequired: "Structural Foreman",   start: "2026-06-23", end: "2026-07-05", durationDays: 9,  dependencies: "TSK-P1-03", status: "fragile",    percent_complete: 0  },
  // Wayne: concrete pour in p1 only (finishes Jun 5, then free)
  { id: "TSK-P1-05", projectId: "p1", name: "Concrete Pour — Basement B3",        assigneeId: "r9",  tradeRequired: "Formwork Foreman",     start: "2026-06-01", end: "2026-06-05", durationDays: 5,  dependencies: "-",        status: "inprogress", percent_complete: 60 },
  // Sam: QS cost report in p1 (Jun 10–21, then free for p2 Jul+)
  { id: "TSK-P1-06", projectId: "p1", name: "Cost Report & Variation Assessment", assigneeId: "r7",  tradeRequired: "Quantity Surveyor",    start: "2026-06-10", end: "2026-06-21", durationDays: 9,  dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // Chris: fitout p1 only (Jul 14 – Aug 2)
  { id: "TSK-P1-07", projectId: "p1", name: "Internal Fitout — Level 1 to 3",     assigneeId: "r6",  tradeRequired: "Interior Foreman",     start: "2026-07-14", end: "2026-08-02", durationDays: 15, dependencies: "TSK-P1-03", status: "scheduled",  percent_complete: 0  },
  // Rachel: HSE audit p1 (Jun 16–17, short)
  { id: "TSK-P1-08", projectId: "p1", name: "HSE Site Audit — Q2",                assigneeId: "r8",  tradeRequired: "HSE Officer",          start: "2026-06-16", end: "2026-06-17", durationDays: 2,  dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // Unassigned: waterproofing open slot
  { id: "TSK-P1-09", projectId: "p1", name: "External Waterproofing — Tower C",   assigneeId: null,  tradeRequired: "Interior Foreman",     start: "2026-07-01", end: "2026-07-13", durationDays: 9,  dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // Ben again in p1 after conflict resolves (Jun 29 — no overlap with anything)
  { id: "TSK-P1-10", projectId: "p1", name: "Formwork Strip & Prep — Level 6",    assigneeId: "r1",  tradeRequired: "Formwork Foreman",     start: "2026-06-29", end: "2026-07-08", durationDays: 8,  dependencies: "TSK-P1-02", status: "scheduled",  percent_complete: 0  },

  // ─── VICTORIA HARBOUR — STAGE 2 (p2) ────────────────────────────────────
  // Matt: excavation (overdue), then site works — all in p2 only
  { id: "TSK-P2-01", projectId: "p2", name: "Excavation Works — Zone B",          assigneeId: "r3",  tradeRequired: "Site Manager",         start: "2026-05-12", end: "2026-05-28", durationDays: 13, dependencies: "-",        status: "overdue",    percent_complete: 85 },
  { id: "TSK-P2-02", projectId: "p2", name: "Piling Works — North Sector",        assigneeId: "r4",  tradeRequired: "Piling Subcontractor", start: "2026-06-02", end: "2026-06-20", durationDays: 15, dependencies: "TSK-P2-01", status: "conflict",  percent_complete: 10 },
  // Ben: CONFLICT — also on TSK-P1-01 same dates
  { id: "TSK-P2-03", projectId: "p2", name: "Formwork — Basement Level B1",       assigneeId: "r1",  tradeRequired: "Formwork Foreman",     start: "2026-06-01", end: "2026-06-09", durationDays: 7,  dependencies: "-",        status: "conflict",   percent_complete: 30 },
  // Matt continues p2 site management (Jun 5 — after excavation stalls, sequential)
  { id: "TSK-P2-04", projectId: "p2", name: "Site Dewatering & Rock Breaking",    assigneeId: "r3",  tradeRequired: "Site Manager",         start: "2026-06-05", end: "2026-06-20", durationDays: 12, dependencies: "TSK-P2-01", status: "inprogress", percent_complete: 25 },
  // James: structural p2 — starts Jul 21, after his p1 finishes Jul 5
  { id: "TSK-P2-05", projectId: "p2", name: "Structural Frame — Level 1 & 2",     assigneeId: "r2",  tradeRequired: "Structural Foreman",   start: "2026-07-21", end: "2026-08-07", durationDays: 14, dependencies: "TSK-P2-02", status: "scheduled",  percent_complete: 0  },
  // Wayne: concrete slab p2 — Jun 23, after his p1 finishes Jun 5
  { id: "TSK-P2-06", projectId: "p2", name: "Concrete Slab — Ground Floor",       assigneeId: "r9",  tradeRequired: "Formwork Foreman",     start: "2026-06-23", end: "2026-07-05", durationDays: 9,  dependencies: "TSK-P2-02", status: "scheduled",  percent_complete: 0  },
  // Sam: waterproofing p2 — Jul 7, after his p1 QS finishes Jun 21
  { id: "TSK-P2-07", projectId: "p2", name: "Waterproofing — Basement Slab",      assigneeId: "r7",  tradeRequired: "Quantity Surveyor",    start: "2026-07-07", end: "2026-07-18", durationDays: 9,  dependencies: "TSK-P2-02", status: "scheduled",  percent_complete: 0  },
  // Yuni: programme coordination p2 (Jun 3–28 only, then p3 Jul 7+)
  { id: "TSK-P2-08", projectId: "p2", name: "Programme Reporting — June",         assigneeId: "r10", tradeRequired: "Project Coordinator",  start: "2026-06-03", end: "2026-06-28", durationDays: 20, dependencies: "-",        status: "inprogress", percent_complete: 10 },

  // ─── SOUTHBANK RESIDENCES — T1 (p3) ─────────────────────────────────────
  // Tom: CONFLICT — also on TSK-P2-02 same dates
  { id: "TSK-P3-01", projectId: "p3", name: "Piling — Main Core",                 assigneeId: "r4",  tradeRequired: "Piling Subcontractor", start: "2026-06-01", end: "2026-06-19", durationDays: 15, dependencies: "-",        status: "conflict",   percent_complete: 15 },
  // Rachel: HSE induction p3 (completed May 29–Jun 2, before p1 audit Jun 16)
  { id: "TSK-P3-02", projectId: "p3", name: "HSE Induction — New Trades",         assigneeId: "r8",  tradeRequired: "HSE Officer",          start: "2026-05-29", end: "2026-06-02", durationDays: 3,  dependencies: "-",        status: "completed",  percent_complete: 100},
  // Anika: services p3 only (Jun 5–22, then Jul 1–14 — all in p3)
  { id: "TSK-P3-03", projectId: "p3", name: "Services Rough-in — Ground Level",   assigneeId: "r5",  tradeRequired: "Services Coordinator", start: "2026-06-05", end: "2026-06-22", durationDays: 14, dependencies: "-",        status: "inprogress", percent_complete: 20 },
  { id: "TSK-P3-04", projectId: "p3", name: "Hydraulic Services — Level 1 & 2",  assigneeId: "r5",  tradeRequired: "Services Coordinator", start: "2026-07-01", end: "2026-07-14", durationDays: 10, dependencies: "TSK-P3-03", status: "scheduled",  percent_complete: 0  },
  // Wayne: concrete podium p3 — Jul 14, after his p2 finishes Jul 5
  { id: "TSK-P3-05", projectId: "p3", name: "Concrete Pour — Podium Level",       assigneeId: "r9",  tradeRequired: "Formwork Foreman",     start: "2026-07-14", end: "2026-07-24", durationDays: 9,  dependencies: "TSK-P3-01", status: "scheduled",  percent_complete: 0  },
  // Chris: fitout p3 — Aug 4, after his p1 finishes Aug 2
  { id: "TSK-P3-06", projectId: "p3", name: "Internal Works — Level 1",           assigneeId: "r6",  tradeRequired: "Interior Foreman",     start: "2026-08-04", end: "2026-08-20", durationDays: 13, dependencies: "TSK-P3-05", status: "scheduled",  percent_complete: 0  },
  // Sam: scaffold p3 — Jul 28, after his p2 finishes Jul 18
  { id: "TSK-P3-07", projectId: "p3", name: "External Scaffold — Stage 1",        assigneeId: "r7",  tradeRequired: "Quantity Surveyor",    start: "2026-07-28", end: "2026-08-08", durationDays: 10, dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // Yuni: coordination p3 — Jul 7, after her p2 finishes Jun 28
  { id: "TSK-P3-08", projectId: "p3", name: "Subcontractor Coordination — Q3",    assigneeId: "r10", tradeRequired: "Project Coordinator",  start: "2026-07-07", end: "2026-08-01", durationDays: 20, dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // Unassigned: fire services open slot
  { id: "TSK-P3-09", projectId: "p3", name: "Fire Services Rough-in — L1 & L2",  assigneeId: null,  tradeRequired: "Services Coordinator", start: "2026-07-21", end: "2026-08-04", durationDays: 11, dependencies: "-",        status: "scheduled",  percent_complete: 0  },
];

export const DEFAULT_CLAIMS = [
  { id: "cl8", claimNumber: "PC-008", projectId: "p1", project: "Parramatta Square",   period: "Jun 2026", claimedAmount: "A$3.6M", certifiedAmount: "A$0",    claimedVal: 3600000, certifiedVal: 0,       retentionVal: 0,      dueDate: "2026-07-15", status: "pending",   costCategoryId: "cc1", costCategoryName: "Labour"          },
  { id: "cl7", claimNumber: "PC-007", projectId: "p2", project: "Victoria Harbour",    period: "Jun 2026", claimedAmount: "A$2.8M", certifiedAmount: "A$0",    claimedVal: 2800000, certifiedVal: 0,       retentionVal: 0,      dueDate: "2026-07-10", status: "pending",   costCategoryId: "cc2", costCategoryName: "Subcontractors"  },
  { id: "cl6", claimNumber: "PC-006", projectId: "p3", project: "Southbank Res.",      period: "Jun 2026", claimedAmount: "A$1.4M", certifiedAmount: "A$0",    claimedVal: 1400000, certifiedVal: 0,       retentionVal: 0,      dueDate: "2026-07-12", status: "pending",   costCategoryId: "cc4", costCategoryName: "Plant & Equipment"},
  { id: "cl5", claimNumber: "PC-005", projectId: "p1", project: "Parramatta Square",   period: "May 2026", claimedAmount: "A$3.4M", certifiedAmount: "A$3.4M", claimedVal: 3400000, certifiedVal: 3400000, retentionVal: 170000, dueDate: "2026-06-15", status: "certified", costCategoryId: "cc1", costCategoryName: "Labour"          },
  { id: "cl4", claimNumber: "PC-004", projectId: "p2", project: "Victoria Harbour",    period: "May 2026", claimedAmount: "A$2.6M", certifiedAmount: "A$2.5M", claimedVal: 2600000, certifiedVal: 2500000, retentionVal: 125000, dueDate: "2026-06-15", status: "certified", costCategoryId: "cc3", costCategoryName: "Materials"       },
  { id: "cl3", claimNumber: "PC-003", projectId: "p3", project: "Southbank Res.",      period: "May 2026", claimedAmount: "A$1.8M", certifiedAmount: "A$1.8M", claimedVal: 1800000, certifiedVal: 1800000, retentionVal: 90000,  dueDate: "2026-06-10", status: "certified", costCategoryId: "cc4", costCategoryName: "Plant & Equipment"},
  { id: "cl2", claimNumber: "PC-002", projectId: "p2", project: "Victoria Harbour",    period: "Apr 2026", claimedAmount: "A$2.2M", certifiedAmount: "A$2.2M", claimedVal: 2200000, certifiedVal: 2200000, retentionVal: 110000, dueDate: "2026-05-20", status: "certified", costCategoryId: "cc2", costCategoryName: "Subcontractors"  },
  { id: "cl1", claimNumber: "PC-001", projectId: "p4", project: "North Ryde BP",       period: "Apr 2026", claimedAmount: "A$4.6M", certifiedAmount: "A$4.6M", claimedVal: 4600000, certifiedVal: 4600000, retentionVal: 0,      dueDate: "2026-05-01", status: "released",  costCategoryId: "cc1", costCategoryName: "Labour"          },
];

export const DEFAULT_ALERTS = [
  {
    id: "a1",
    taskId: "TSK-P1-01",
    taskName: "Formwork Pour — Level 4",
    reporterName: "Ben Nguyen",
    message: "Ben Nguyen reported delay on Formwork Pour — Level 4. Weather on 2 Jun impacted pour schedule by 1 day.",
    type: "delay",
    projectedCompletion: "2026-06-08",
    timestamp: new Date().toISOString(),
  },
  {
    id: "a2",
    taskId: "TSK-P2-01",
    taskName: "Excavation Works — Zone B",
    reporterName: "Matt O'Brien",
    message: "Matt O'Brien: Excavation Zone B is 85% complete but past end date. Awaiting rock breaking subcontractor.",
    type: "delay",
    projectedCompletion: "2026-06-06",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
];

export function getDefaultMasters(): MastersBundle {
  return cloneDefaultMasters();
}
