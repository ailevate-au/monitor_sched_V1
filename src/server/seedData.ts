import { MastersBundle } from "../types/masters";
import { cloneDefaultMasters } from "./mastersDefaults";
import type { AppUserAccount } from "../types";

/**
 * Which PM owns which project. PMs only see their own projects, so when a PM
 * changes their schedule and it ripples into a project they DON'T own, only the
 * Owner sees the resulting cross-project problem. Demo reference data (not in the
 * Prisma schema) — applied in memory on load.
 */
export const PROJECT_MANAGERS: Record<string, string> = {
  // The demo PM (pm@flowiq.com.au) runs Victoria Harbour only. Delaying a piling
  // job here pushes Tom into a clash on Southbank (p3) — which this PM can't see.
  p2: "pm@flowiq.com.au",
};

export const DEFAULT_COST_CATEGORIES = [
  { id: "cc1", name: "Labour", is_active: true, sort_order: 1 },
  { id: "cc2", name: "Subcontractors", is_active: true, sort_order: 2 },
  { id: "cc3", name: "Materials", is_active: true, sort_order: 3 },
  { id: "cc4", name: "Plant & Equipment", is_active: true, sort_order: 4 },
  { id: "cc5", name: "Machinery", is_active: true, sort_order: 5 },
];

// Cost line `amount` and `revenueReceived` are REAL DOLLARS (not millions) —
// use fmtMoney (src/lib/money.ts) to render. plannedCost/actualCost stay in
// A$M (legacy contract-level fields) and equal the dollar line totals / 1e6,
// so the two views (contract-level $M vs category-level $) always agree.
// Labour is a seeded cost category line (budget + actual) like Materials —
// it is no longer derived from the schedule, so completed projects (which
// have no live tasks) still carry a real labour figure.
export const DEFAULT_PROJECTS = [
  {
    id: "p1", name: "Parramatta Square — Tower C", type: "Mixed-use development",
    location: "Parramatta NSW", contractor: "Lendlease", state: "NSW",
    originalContractSum: 58.0, finalContractSum: 68.0, plannedCost: 70.0, actualCost: 73.5,
    ldRatePerDay: 68000, pcStartDate: "2026-03-01", pcEndDate: "2026-09-30",
    retentionPercent: 5.0, status: "ACTIVE", progress: 41, weatherRisk: true, overBudget: true,
    budgetLines: [
      { id: "bl-p1-0", label: "Labour", category: "Labour", amount: 12_000_000 },
      { id: "bl-p1-1", label: "Materials", category: "Materials", amount: 32_000_000 },
      { id: "bl-p1-2", label: "Subcontractors", category: "Subcontractors", amount: 18_000_000 },
      { id: "bl-p1-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 8_000_000 },
    ],
    actualLines: [
      { id: "al-p1-0", label: "Labour", category: "Labour", amount: 13_100_000 },
      { id: "al-p1-1", label: "Materials", category: "Materials", amount: 33_500_000 },
      { id: "al-p1-2", label: "Subcontractors", category: "Subcontractors", amount: 18_900_000 },
      { id: "al-p1-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 8_000_000 },
    ],
    revenueReceived: 40_000_000,
  },
  {
    id: "p2", name: "Victoria Harbour — Stage 2", type: "High-density residential",
    location: "Docklands VIC", contractor: "CPB Contractors", state: "VIC",
    originalContractSum: 36.0, finalContractSum: 54.0, plannedCost: 46.0, actualCost: 44.8,
    ldRatePerDay: 54000, pcStartDate: "2026-02-15", pcEndDate: "2026-11-30",
    retentionPercent: 5.0, status: "ACTIVE", progress: 28, weatherRisk: false, overBudget: false,
    budgetLines: [
      { id: "bl-p2-0", label: "Labour", category: "Labour", amount: 10_000_000 },
      { id: "bl-p2-1", label: "Materials", category: "Materials", amount: 20_000_000 },
      { id: "bl-p2-2", label: "Subcontractors", category: "Subcontractors", amount: 12_000_000 },
      { id: "bl-p2-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 4_000_000 },
    ],
    actualLines: [
      { id: "al-p2-0", label: "Labour", category: "Labour", amount: 10_800_000 },
      { id: "al-p2-1", label: "Materials", category: "Materials", amount: 18_500_000 },
      { id: "al-p2-2", label: "Subcontractors", category: "Subcontractors", amount: 11_500_000 },
      { id: "al-p2-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 4_000_000 },
    ],
    revenueReceived: 22_000_000,
  },
  {
    id: "p3", name: "Southbank Residences — T1", type: "High-density residential",
    location: "South Brisbane QLD", contractor: "John Holland", state: "QLD",
    originalContractSum: 41.0, finalContractSum: 41.0, plannedCost: 11.2, actualCost: 10.3,
    ldRatePerDay: 41000, pcStartDate: "2026-05-01", pcEndDate: "2026-12-20",
    retentionPercent: 5.0, status: "ACTIVE", progress: 18, weatherRisk: false, overBudget: false,
    budgetLines: [
      { id: "bl-p3-0", label: "Labour", category: "Labour", amount: 3_000_000 },
      { id: "bl-p3-1", label: "Materials", category: "Materials", amount: 5_000_000 },
      { id: "bl-p3-2", label: "Subcontractors", category: "Subcontractors", amount: 2_500_000 },
      { id: "bl-p3-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 700_000 },
    ],
    actualLines: [
      { id: "al-p3-0", label: "Labour", category: "Labour", amount: 2_900_000 },
      { id: "al-p3-1", label: "Materials", category: "Materials", amount: 4_500_000 },
      { id: "al-p3-2", label: "Subcontractors", category: "Subcontractors", amount: 2_200_000 },
      { id: "al-p3-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 700_000 },
    ],
    revenueReceived: 5_000_000,
  },

  // ─── COMPLETED PROJECTS (p4–p10) — closed-out jobs for the Finance /
  // Projects "Completed" section, so projected-vs-actual has real history to
  // compare (some under budget, some over) rather than just the 3 live jobs.
  {
    id: "p4", name: "Bondi Junction Tower", type: "Commercial office",
    location: "Bondi Junction NSW", contractor: "Multiplex", state: "NSW",
    originalContractSum: 32.0, finalContractSum: 34.0, plannedCost: 36.0, actualCost: 39.6,
    ldRatePerDay: 34000, pcStartDate: "2024-11-01", pcEndDate: "2025-10-15",
    retentionPercent: 5.0, status: "COMPLETED", progress: 100, weatherRisk: false, overBudget: true,
    budgetLines: [
      { id: "bl-p4-0", label: "Labour", category: "Labour", amount: 9_000_000 },
      { id: "bl-p4-1", label: "Materials", category: "Materials", amount: 16_000_000 },
      { id: "bl-p4-2", label: "Subcontractors", category: "Subcontractors", amount: 8_500_000 },
      { id: "bl-p4-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 2_500_000 },
    ],
    actualLines: [
      { id: "al-p4-0", label: "Labour", category: "Labour", amount: 10_100_000 },
      { id: "al-p4-1", label: "Materials", category: "Materials", amount: 18_000_000 },
      { id: "al-p4-2", label: "Subcontractors", category: "Subcontractors", amount: 9_200_000 },
      { id: "al-p4-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 2_300_000 },
    ],
    revenueReceived: 34_000_000,
  },
  {
    id: "p5", name: "Chatswood Central", type: "Mixed-use development",
    location: "Chatswood NSW", contractor: "Built", state: "NSW",
    originalContractSum: 25.0, finalContractSum: 25.0, plannedCost: 27.0, actualCost: 24.7,
    ldRatePerDay: 25000, pcStartDate: "2024-06-01", pcEndDate: "2025-04-30",
    retentionPercent: 5.0, status: "COMPLETED", progress: 100, weatherRisk: false, overBudget: false,
    budgetLines: [
      { id: "bl-p5-0", label: "Labour", category: "Labour", amount: 7_000_000 },
      { id: "bl-p5-1", label: "Materials", category: "Materials", amount: 12_000_000 },
      { id: "bl-p5-2", label: "Subcontractors", category: "Subcontractors", amount: 6_000_000 },
      { id: "bl-p5-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 2_000_000 },
    ],
    actualLines: [
      { id: "al-p5-0", label: "Labour", category: "Labour", amount: 6_300_000 },
      { id: "al-p5-1", label: "Materials", category: "Materials", amount: 11_000_000 },
      { id: "al-p5-2", label: "Subcontractors", category: "Subcontractors", amount: 5_600_000 },
      { id: "al-p5-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 1_800_000 },
    ],
    revenueReceived: 25_000_000,
  },
  {
    id: "p6", name: "Geelong Waterfront", type: "High-density residential",
    location: "Geelong VIC", contractor: "Probuild", state: "VIC",
    originalContractSum: 40.0, finalContractSum: 44.0, plannedCost: 46.0, actualCost: 52.6,
    ldRatePerDay: 44000, pcStartDate: "2024-08-15", pcEndDate: "2025-09-01",
    retentionPercent: 5.0, status: "COMPLETED", progress: 100, weatherRisk: false, overBudget: true,
    budgetLines: [
      { id: "bl-p6-0", label: "Labour", category: "Labour", amount: 12_000_000 },
      { id: "bl-p6-1", label: "Materials", category: "Materials", amount: 20_000_000 },
      { id: "bl-p6-2", label: "Subcontractors", category: "Subcontractors", amount: 11_000_000 },
      { id: "bl-p6-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 3_000_000 },
    ],
    actualLines: [
      { id: "al-p6-0", label: "Labour", category: "Labour", amount: 13_900_000 },
      { id: "al-p6-1", label: "Materials", category: "Materials", amount: 23_000_000 },
      { id: "al-p6-2", label: "Subcontractors", category: "Subcontractors", amount: 12_400_000 },
      { id: "al-p6-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 3_300_000 },
    ],
    revenueReceived: 42_000_000,
  },
  {
    id: "p7", name: "Adelaide Oval Precinct", type: "Commercial office",
    location: "Adelaide SA", contractor: "Hansen Yuncken", state: "SA",
    originalContractSum: 55.0, finalContractSum: 58.0, plannedCost: 62.0, actualCost: 55.3,
    ldRatePerDay: 58000, pcStartDate: "2024-02-01", pcEndDate: "2025-06-30",
    retentionPercent: 5.0, status: "COMPLETED", progress: 100, weatherRisk: false, overBudget: false,
    budgetLines: [
      { id: "bl-p7-0", label: "Labour", category: "Labour", amount: 16_000_000 },
      { id: "bl-p7-1", label: "Materials", category: "Materials", amount: 27_000_000 },
      { id: "bl-p7-2", label: "Subcontractors", category: "Subcontractors", amount: 14_000_000 },
      { id: "bl-p7-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 5_000_000 },
    ],
    actualLines: [
      { id: "al-p7-0", label: "Labour", category: "Labour", amount: 14_600_000 },
      { id: "al-p7-1", label: "Materials", category: "Materials", amount: 24_300_000 },
      { id: "al-p7-2", label: "Subcontractors", category: "Subcontractors", amount: 12_200_000 },
      { id: "al-p7-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 4_200_000 },
    ],
    revenueReceived: 58_000_000,
  },
  {
    id: "p8", name: "Fremantle Wharf", type: "Industrial",
    location: "Fremantle WA", contractor: "BGC Construction", state: "WA",
    originalContractSum: 22.0, finalContractSum: 22.0, plannedCost: 24.0, actualCost: 28.2,
    ldRatePerDay: 22000, pcStartDate: "2024-09-01", pcEndDate: "2025-05-15",
    retentionPercent: 5.0, status: "COMPLETED", progress: 100, weatherRisk: false, overBudget: true,
    budgetLines: [
      { id: "bl-p8-0", label: "Labour", category: "Labour", amount: 6_000_000 },
      { id: "bl-p8-1", label: "Materials", category: "Materials", amount: 11_000_000 },
      { id: "bl-p8-2", label: "Subcontractors", category: "Subcontractors", amount: 5_500_000 },
      { id: "bl-p8-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 1_500_000 },
    ],
    actualLines: [
      { id: "al-p8-0", label: "Labour", category: "Labour", amount: 7_300_000 },
      { id: "al-p8-1", label: "Materials", category: "Materials", amount: 13_000_000 },
      { id: "al-p8-2", label: "Subcontractors", category: "Subcontractors", amount: 6_200_000 },
      { id: "al-p8-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 1_700_000 },
    ],
    revenueReceived: 21_500_000,
  },
  {
    id: "p9", name: "Newcastle Foreshore", type: "Mixed-use development",
    location: "Newcastle NSW", contractor: "Richard Crookes", state: "NSW",
    originalContractSum: 18.0, finalContractSum: 19.0, plannedCost: 20.0, actualCost: 19.1,
    ldRatePerDay: 19000, pcStartDate: "2024-12-01", pcEndDate: "2025-07-20",
    retentionPercent: 5.0, status: "COMPLETED", progress: 100, weatherRisk: false, overBudget: false,
    budgetLines: [
      { id: "bl-p9-0", label: "Labour", category: "Labour", amount: 5_000_000 },
      { id: "bl-p9-1", label: "Materials", category: "Materials", amount: 9_000_000 },
      { id: "bl-p9-2", label: "Subcontractors", category: "Subcontractors", amount: 4_500_000 },
      { id: "bl-p9-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 1_500_000 },
    ],
    actualLines: [
      { id: "al-p9-0", label: "Labour", category: "Labour", amount: 4_900_000 },
      { id: "al-p9-1", label: "Materials", category: "Materials", amount: 8_500_000 },
      { id: "al-p9-2", label: "Subcontractors", category: "Subcontractors", amount: 4_300_000 },
      { id: "al-p9-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 1_400_000 },
    ],
    revenueReceived: 19_000_000,
  },
  {
    id: "p10", name: "Cairns Marina", type: "High-density residential",
    location: "Cairns QLD", contractor: "Hutchinson Builders", state: "QLD",
    originalContractSum: 29.0, finalContractSum: 30.0, plannedCost: 32.0, actualCost: 37.3,
    ldRatePerDay: 30000, pcStartDate: "2024-10-15", pcEndDate: "2025-08-10",
    retentionPercent: 5.0, status: "COMPLETED", progress: 100, weatherRisk: false, overBudget: true,
    budgetLines: [
      { id: "bl-p10-0", label: "Labour", category: "Labour", amount: 8_000_000 },
      { id: "bl-p10-1", label: "Materials", category: "Materials", amount: 14_500_000 },
      { id: "bl-p10-2", label: "Subcontractors", category: "Subcontractors", amount: 7_000_000 },
      { id: "bl-p10-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 2_500_000 },
    ],
    actualLines: [
      { id: "al-p10-0", label: "Labour", category: "Labour", amount: 9_500_000 },
      { id: "al-p10-1", label: "Materials", category: "Materials", amount: 16_700_000 },
      { id: "al-p10-2", label: "Subcontractors", category: "Subcontractors", amount: 8_100_000 },
      { id: "al-p10-3", label: "Plant & Equipment", category: "Plant & Equipment", amount: 3_000_000 },
    ],
    revenueReceived: 29_000_000,
  },
];

/**
 * Seeded app-user accounts (Owner / Coordinator / Admin / PM). User
 * Management (Owner + Coordinator) can add, edit and remove accounts on top
 * of this baseline; role is normally inferred from the email prefix
 * (see roleFromEmail in server.ts), but a match here takes priority so admins
 * can rename/re-role/re-scope a seeded account.
 */
export const DEFAULT_USERS: AppUserAccount[] = [
  { id: "u1", name: "Owner", email: "owner@flowiq.com.au", role: "Owner", state: "NSW", managedProjectIds: [] },
  { id: "u2", name: "Coordinator", email: "coordinator@flowiq.com.au", role: "Coordinator", state: "NSW", managedProjectIds: [] },
  { id: "u3", name: "Admin", email: "admin@flowiq.com.au", role: "Admin", state: "NSW", managedProjectIds: [] },
  { id: "u4", name: "Pm", email: "pm@flowiq.com.au", role: "PM", state: "VIC", managedProjectIds: ["p2"] },
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
  { id: "r11", initials: "LC", name: "Liam Carter",      trade: "Site Manager",          state: "NSW", rate: "A$82/hr",  hourlyRateVal: 82,  util: 50,  status: "ok"       },
  { id: "r12", initials: "OB", name: "Olivia Brown",     trade: "Services Coordinator",  state: "VIC", rate: "A$60/hr",  hourlyRateVal: 60,  util: 48,  status: "ok"       },
  { id: "r13", initials: "NW", name: "Noah Wilson",      trade: "Structural Foreman",    state: "QLD", rate: "A$70/hr",  hourlyRateVal: 70,  util: 52,  status: "ok"       },
  { id: "r14", initials: "MD", name: "Mia Davis",        trade: "Quantity Surveyor",     state: "ACT", rate: "A$74/hr",  hourlyRateVal: 74,  util: 40,  status: "ok"       },
  { id: "r15", initials: "EM", name: "Ethan Moore",      trade: "Formwork Foreman",      state: "WA",  rate: "A$58/hr",  hourlyRateVal: 58,  util: 35,  status: "ok"       },
  { id: "r16", initials: "AT", name: "Ava Taylor",       trade: "HSE Officer",           state: "SA",  rate: "A$63/hr",  hourlyRateVal: 63,  util: 30,  status: "ok"       },
  // Spare pilers so a piling double-booking (e.g. Tom on two sites at once) can be
  // fixed by REPLACING the person, not just by pushing a job back. Daniel (VIC) is
  // the same-state, low-load recommended swap; Patrick (QLD) is the interstate alt.
  { id: "r17", initials: "DN", name: "Daniel Nguyen",    trade: "Piling Subcontractor",  state: "VIC", rate: "A$72/hr",  hourlyRateVal: 72,  util: 45,  status: "ok"       },
  { id: "r18", initials: "PO", name: "Patrick O'Shea",   trade: "Piling Subcontractor",  state: "QLD", rate: "A$70/hr",  hourlyRateVal: 70,  util: 38,  status: "ok"       },
];

/**
 * Static resource profiles (bio + skills) used to enrich replacement suggestions
 * in the Problems hub and the Resources screen. Kept out of the Prisma schema —
 * this is reference data merged at response time, not mutable per-project state.
 */
export const RESOURCE_PROFILES: Record<string, { bio: string; skills: string[] }> = {
  r1:  { bio: "12 yrs formwork lead on Tier-1 high-rise. Known for fast, clean pours.",        skills: ["Jump-form", "Post-tension decks", "Crane coordination"] },
  r2:  { bio: "Structural steel foreman, ex-fabrication. Strong on connection sequencing.",     skills: ["Steel erection", "Bolt-up QA", "Rigging"] },
  r3:  { bio: "Site manager across civil + residential. Runs tight subbie programmes.",         skills: ["Earthworks", "Dewatering", "Subcontractor management"] },
  r4:  { bio: "Specialist piling subcontractor. CFA + bored pier experience.",                  skills: ["CFA piling", "Bored piers", "Geotech liaison"] },
  r5:  { bio: "Services coordinator (hydraulic + mechanical). Detail-focused on rough-in.",     skills: ["Hydraulic rough-in", "Mechanical services", "BIM clash review"] },
  r6:  { bio: "Interior fitout foreman. Premium commercial finishes background.",               skills: ["Partitions & ceilings", "Joinery", "Finishes QA"] },
  r7:  { bio: "Quantity surveyor. AS 4000 claims and variation assessment specialist.",         skills: ["Cost planning", "Variations", "Progress claims"] },
  r8:  { bio: "HSE officer. Zero-LTI record across last 3 projects.",                            skills: ["SWMS review", "Site inductions", "Incident response"] },
  r9:  { bio: "Formwork foreman, NSW-based. Available and low current load — strong backfill.",  skills: ["Conventional formwork", "Slab pours", "Edge protection"] },
  r10: { bio: "Project coordinator. Keeps programme reporting and subbie comms on track.",      skills: ["Programme reporting", "Document control", "Procurement"] },
  r11: { bio: "Site manager, Newcastle region. Strong on early works and establishment.",        skills: ["Site establishment", "Traffic management", "Council liaison"] },
  r12: { bio: "Services coordinator, VIC health-sector experience.",                            skills: ["Medical gas", "Mechanical services", "Commissioning"] },
  r13: { bio: "Structural foreman, QLD infrastructure background.",                             skills: ["Precast", "In-situ concrete", "Survey set-out"] },
  r14: { bio: "Quantity surveyor, public-sector cost reporting.",                               skills: ["Cost reporting", "Tender review", "Forecasting"] },
  r15: { bio: "Formwork foreman, WA-based. Interstate availability for surge work.",            skills: ["Jump-form", "Slab pours", "Formwork design review"] },
  r16: { bio: "HSE officer, SA. Retail + heritage redevelopment experience.",                   skills: ["Heritage site safety", "Public-interface controls", "Audits"] },
  r17: { bio: "Piling subcontractor, VIC-based. Free this window — strong same-state backfill.", skills: ["CFA piling", "Bored piers", "Rig supervision"] },
  r18: { bio: "Piling subcontractor, QLD. Interstate availability for surge piling work.",       skills: ["Driven piles", "Bored piers", "Geotech liaison"] },
};

// 15 tasks across 3 active projects (Parramatta, Victoria Harbour, Southbank) —
// 5 per project, trimmed to keep the demo Gantt simple and cascades contained.
// CLEAN BASELINE: this seed has NO conflicts, NO overdue, NO tight handovers and
// NO weather risk — a fresh boot shows "Everything on track" (0 issues). Every
// dependent gap is >= 3 working days so nothing trips the default tight-handover
// threshold; King's Birthday (Mon 8 Jun 2026, NSW/VIC) is accounted for.
//
// Two scripted scenarios sit on top of this baseline:
//  • PM-delay (hero): mark TSK-P2-02 (Tom's piling) delayed 5 days → it slides into
//    his TSK-P3-01 (Southbank) → ONE cross-project clash; its only dependent
//    TSK-P2-04 is squeezed to a thin buffer → one (toggle-able) tight handover.
//  • Owner double-booking: POST /api/v1/demo/simulate reassigns TSK-P2-03 to Ben
//    (r1) so it overlaps his TSK-P1-01; POST /api/v1/demo/reset restores 0 issues.
// Each task carries a `deadline` (the "must finish by" date) seeded to its planned
// end. On the clean baseline end === deadline, so nothing is behind schedule. When
// a job is delayed and its `end` runs past `deadline`, the (opt-in) deadline warning
// flags it "behind schedule" — see db.settings.deadlineWarnings + conflictEngine.
export const DEFAULT_TASKS = [

  // ─── PARRAMATTA SQUARE — TOWER C (p1, NSW) ──────────────────────────────
  // Ben: single formwork pour early June — the anchor for the Ben double-booking.
  { id: "TSK-P1-01", projectId: "p1", name: "Formwork Pour — Level 4",            assigneeId: "r1",  tradeRequired: "Formwork Foreman",     start: "2026-06-01", end: "2026-06-05", deadline: "2026-06-05", durationDays: 5,  dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // James: structural steel after Ben's pour — comfortable gap (not a tight handover).
  { id: "TSK-P1-02", projectId: "p1", name: "Structural Steel Frame — Level 4",   assigneeId: "r2",  tradeRequired: "Structural Foreman",   start: "2026-06-15", end: "2026-06-26", deadline: "2026-06-26", durationDays: 10, dependencies: "TSK-P1-01", status: "scheduled",  percent_complete: 0  },
  // Sam: QS cost report (clean NSW job — simulate pulls this into the storm window).
  { id: "TSK-P1-03", projectId: "p1", name: "Cost Report & Variation Assessment", assigneeId: "r7",  tradeRequired: "Quantity Surveyor",    start: "2026-06-10", end: "2026-06-19", deadline: "2026-06-19", durationDays: 8,  dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // Chris: fitout after the steel frame — big gap (simulate pulls it up for the tight handover).
  { id: "TSK-P1-04", projectId: "p1", name: "Internal Fitout — Level 1 to 3",     assigneeId: "r6",  tradeRequired: "Interior Foreman",     start: "2026-07-13", end: "2026-07-31", deadline: "2026-07-31", durationDays: 15, dependencies: "TSK-P1-02", status: "scheduled",  percent_complete: 0  },
  // Wayne: concrete pour completed in late May — keeps him FREE in June so he is
  // the recommended same-state replacement when Ben's double-booking is simulated.
  { id: "TSK-P1-05", projectId: "p1", name: "Concrete Pour — Basement B3",        assigneeId: "r9",  tradeRequired: "Formwork Foreman",     start: "2026-05-20", end: "2026-05-26", deadline: "2026-05-26", durationDays: 5,  dependencies: "-",        status: "completed",  percent_complete: 100 },

  // ─── VICTORIA HARBOUR — STAGE 2 (p2, VIC) ───────────────────────────────
  // Matt: excavation done (also the "late job" simulate flips to overdue).
  { id: "TSK-P2-01", projectId: "p2", name: "Excavation Works — Zone B",          assigneeId: "r3",  tradeRequired: "Site Manager",         start: "2026-05-12", end: "2026-05-28", deadline: "2026-05-28", durationDays: 13, dependencies: "-",        status: "completed",  percent_complete: 100 },
  // Tom: north-sector piling — the PM delays THIS; +5 days slides it into his p3 piling.
  { id: "TSK-P2-02", projectId: "p2", name: "Piling Works — North Sector",        assigneeId: "r4",  tradeRequired: "Piling Subcontractor", start: "2026-06-02", end: "2026-06-20", deadline: "2026-06-20", durationDays: 15, dependencies: "TSK-P2-01", status: "scheduled",  percent_complete: 0  },
  // Wayne (clean): basement formwork. Demo simulate reassigns this to Ben → clash.
  { id: "TSK-P2-03", projectId: "p2", name: "Formwork — Basement Level B1",       assigneeId: "r9",  tradeRequired: "Formwork Foreman",     start: "2026-06-01", end: "2026-06-09", deadline: "2026-06-09", durationDays: 7,  dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // Wayne: ground-floor slab after the piling — comfortable gap now, but delaying the
  // piling squeezes this to a thin buffer → the single tight handover of the delay scene.
  { id: "TSK-P2-04", projectId: "p2", name: "Concrete Slab — Ground Floor",       assigneeId: "r9",  tradeRequired: "Formwork Foreman",     start: "2026-06-30", end: "2026-07-10", deadline: "2026-07-10", durationDays: 9,  dependencies: "TSK-P2-02", status: "scheduled",  percent_complete: 0  },
  // Yuni: programme coordination, p2 only.
  { id: "TSK-P2-05", projectId: "p2", name: "Programme Reporting — June",         assigneeId: "r10", tradeRequired: "Project Coordinator",  start: "2026-06-03", end: "2026-06-26", deadline: "2026-06-26", durationDays: 18, dependencies: "-",        status: "inprogress", percent_complete: 10 },

  // ─── SOUTHBANK RESIDENCES — T1 (p3, QLD) ────────────────────────────────
  // Tom: main-core piling — Jun 23, just after his p2 piling so a 5-day p2 delay overlaps it.
  { id: "TSK-P3-01", projectId: "p3", name: "Piling — Main Core",                 assigneeId: "r4",  tradeRequired: "Piling Subcontractor", start: "2026-06-23", end: "2026-07-13", deadline: "2026-07-13", durationDays: 15, dependencies: "-",        status: "scheduled",  percent_complete: 0  },
  // Anika: services rough-in, p3 only.
  { id: "TSK-P3-02", projectId: "p3", name: "Services Rough-in — Ground Level",   assigneeId: "r5",  tradeRequired: "Services Coordinator", start: "2026-06-05", end: "2026-06-22", deadline: "2026-06-22", durationDays: 14, dependencies: "-",        status: "inprogress", percent_complete: 20 },
  // Anika: hydraulic services after rough-in — comfortable gap.
  { id: "TSK-P3-03", projectId: "p3", name: "Hydraulic Services — Level 1 & 2",  assigneeId: "r5",  tradeRequired: "Services Coordinator", start: "2026-07-01", end: "2026-07-14", deadline: "2026-07-14", durationDays: 10, dependencies: "TSK-P3-02", status: "scheduled",  percent_complete: 0  },
  // Wayne: podium pour after the main-core piling — Jul 20, well clear of his other jobs.
  { id: "TSK-P3-04", projectId: "p3", name: "Concrete Pour — Podium Level",       assigneeId: "r9",  tradeRequired: "Formwork Foreman",     start: "2026-07-20", end: "2026-07-30", deadline: "2026-07-30", durationDays: 9,  dependencies: "TSK-P3-01", status: "scheduled",  percent_complete: 0  },
  // Rachel: HSE induction completed late May.
  { id: "TSK-P3-05", projectId: "p3", name: "HSE Induction — New Trades",         assigneeId: "r8",  tradeRequired: "HSE Officer",          start: "2026-05-29", end: "2026-06-02", deadline: "2026-06-02", durationDays: 3,  dependencies: "-",        status: "completed",  percent_complete: 100},
];

export const DEFAULT_CLAIMS = [
  { id: "cl8", claimNumber: "PC-008", projectId: "p1", project: "Parramatta Square",   period: "Jun 2026", claimedAmount: "A$3.6M", certifiedAmount: "A$0",    claimedVal: 3600000, certifiedVal: 0,       retentionVal: 0,      dueDate: "2026-07-15", status: "pending",   costCategoryId: "cc1", costCategoryName: "Labour"          },
  { id: "cl7", claimNumber: "PC-007", projectId: "p2", project: "Victoria Harbour",    period: "Jun 2026", claimedAmount: "A$2.8M", certifiedAmount: "A$0",    claimedVal: 2800000, certifiedVal: 0,       retentionVal: 0,      dueDate: "2026-07-10", status: "pending",   costCategoryId: "cc2", costCategoryName: "Subcontractors"  },
  { id: "cl6", claimNumber: "PC-006", projectId: "p3", project: "Southbank Res.",      period: "Jun 2026", claimedAmount: "A$1.4M", certifiedAmount: "A$0",    claimedVal: 1400000, certifiedVal: 0,       retentionVal: 0,      dueDate: "2026-07-12", status: "pending",   costCategoryId: "cc4", costCategoryName: "Plant & Equipment"},
  { id: "cl5", claimNumber: "PC-005", projectId: "p1", project: "Parramatta Square",   period: "May 2026", claimedAmount: "A$3.4M", certifiedAmount: "A$3.4M", claimedVal: 3400000, certifiedVal: 3400000, retentionVal: 170000, dueDate: "2026-06-15", status: "certified", costCategoryId: "cc1", costCategoryName: "Labour"          },
  { id: "cl4", claimNumber: "PC-004", projectId: "p2", project: "Victoria Harbour",    period: "May 2026", claimedAmount: "A$2.6M", certifiedAmount: "A$2.5M", claimedVal: 2600000, certifiedVal: 2500000, retentionVal: 125000, dueDate: "2026-06-15", status: "certified", costCategoryId: "cc3", costCategoryName: "Materials"       },
  { id: "cl3", claimNumber: "PC-003", projectId: "p3", project: "Southbank Res.",      period: "May 2026", claimedAmount: "A$1.8M", certifiedAmount: "A$1.8M", claimedVal: 1800000, certifiedVal: 1800000, retentionVal: 90000,  dueDate: "2026-06-10", status: "certified", costCategoryId: "cc4", costCategoryName: "Plant & Equipment"},
  { id: "cl2", claimNumber: "PC-002", projectId: "p2", project: "Victoria Harbour",    period: "Apr 2026", claimedAmount: "A$2.2M", certifiedAmount: "A$2.2M", claimedVal: 2200000, certifiedVal: 2200000, retentionVal: 110000, dueDate: "2026-05-20", status: "certified", costCategoryId: "cc2", costCategoryName: "Subcontractors"  },
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
