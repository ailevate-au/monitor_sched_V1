# FlowIQ
## Client Guide (Demo Edition)
### Project Monitoring Platform — Australian Edition

Built for Australian construction companies that need earlier warnings, faster decisions, and clearer control across schedule, resources, and cost.

---

## 1) What FlowIQ Does

FlowIQ is a web-based construction monitoring platform that combines:

- Portfolio visibility (projects, tasks, risks)
- Shared scheduling (Gantt + dependency cascade)
- Resource allocation and **overlap-based conflict detection**
- Financial tracking and project expenses
- Weather risk integration (BOM forecast)
- Report export (PDF and Excel)

Core outcome: issues are flagged before they become expensive.

---

## 2) Demo Highlights (Current Build)

This demo build is optimized for a clear client walkthrough:

- **Owner-first.** The company Owner signs in and lands on **Problems** — one feed of everything wrong across all projects, each with 2–3 suggested fixes. Pick one, confirm, done.
- **Problems are caught five ways:** double-booking, running late, tight handover, weather risk, and **no one assigned**.
- **Two ways problems appear:** a new batch of work landing (**⚡ Bring in new work**), or **a PM changing their own schedule** — e.g. marking a job *Delayed*, which cascades and can clash into a project that PM can't see. The Owner catches it.
- **Per-state weather.** Forecasts are per state (not Sydney-only); a storm only flags jobs in the affected state. Timeline rows show each project's state and a weather chip.
- **PM scoping.** A PM only sees the projects they manage; the Owner/Admin see the whole portfolio.
- **Conflict alert rule:** a manpower conflict is raised only when the **same person is assigned to tasks with overlapping dates**.
- **AI Recommendation (Demo)** — mock ranking of replacements by trade, state, and load (real AI layer planned for next phase).

---

## 3) Main Navigation

### Overview
- `Overview` — four numbers: Projects Running · On Track % · Total Issues · **Unassigned Jobs**
- `Projects` — counts: Total · Active · Total Issues
- **`Problems`** ← the Owner's landing page: every issue + suggested fixes
- `Weather` — per-state forecast with a location selector

### Scheduling
- **`Timeline`** ← drag-to-reschedule, dependency cascade, per-state weather chips, PM job-status controls

### Resources
- `Resources`

### Finance
- `Finance` — incl. portfolio contract sum, certified value, **retention held**
- `Project Expenses`
- `Reports`

### Administration
- `Settings`
- `Access` (Owner only) — role permission matrix

---

## 4) Roles and Access

Four roles (one-click login buttons on the sign-in screen):

- **Owner / Director** — sees every project and every problem; lands on **Problems**. Full access.
- **Admin** — day-to-day setup across all projects.
- **Project Manager** — **sees only the projects they manage.** Can change job status (incl. *Delayed*, which cascades). A PM's change can break a project they can't see — the Owner catches it in Problems.
- **Field Worker** — mobile-first `My Work` screen; update progress and report delays; cannot edit the full programme.

---

## 5) Feature Guide (Demo Focus)

## Timeline

- Views: **Team Allocation**, **By Project**, **By Resource**, **Change History** *(Kanban removed)*
- Each project row shows its **state + weather chip**; an **"Issues on this schedule"** strip and a **status legend** explain what's flagged
- Each job has **PM status controls** (In progress / Complete / **Delayed +N**); a delay cascades dependents and reports how many new issues it created
- Drag task bars to reschedule; resize to change duration
- **Draft-first workflow:** drag, resize, and add/edit tasks stay in **draft** until you click **Save programme**
- Draft conflict check runs client-side (same manpower + overlapping dates) — save is blocked until conflicts are resolved
- Conflict tasks show in **red** in the draft preview
- Essential filters: search + project (more filters available on demand)
- Weather risk days highlighted on the timeline when BOM flags rain/storm

## Conflicts

- **Manpower Conflicts** — same person assigned to overlapping tasks
- Each conflict shows:
  - Which tasks overlap and their date ranges
  - Current load percentage
  - **AI Recommendation (Demo)** — top suggested replacement with reason tags
  - Full list of available replacements (same state first)
- One-click **Assign** to apply a replacement

## Overview

- Portfolio KPIs and at-risk watchlist
- PM alert stream from field workers
- Quick jump to other modules

## Projects

- Project cards with progress and risk badges
- Jump to Gantt workflow

## Weather

- **Per-state** 7-day BOM forecast with a **location selector** (projects span several states)
- A storm only flags jobs in the affected state — a Perth job isn't judged by a Sydney storm
- Timeline rows show each project's state + a small weather chip
- Delay compensation flow

## Resources

- Roster with utilization signals
- Add/import/edit resources

## Finance / Expenses / Reports

- Available in full build; secondary for this demo walkthrough
- `Project Expenses` are PM-entered records for cost and cashflow tracking
- Default workflow is lightweight: simple entry log (no approval flow in this phase)
- Recommended expense fields: period, amount, and short description

## Settings

- Cost categories, states, sectors, trades, companies
- Programme settings (auto-cascade dependents)

---

## 6) Conflict Logic (Demo Rule)

A **hard conflict** is raised when:

1. A task has an assigned manpower (not unassigned)
2. That same manpower is assigned to another active task
3. The two task date ranges **overlap**

Non-overlapping multi-assignment does **not** trigger a conflict in this phase.

A separate **"No one assigned"** issue is raised for any job on an active project that has
nobody on it — the Problems hub suggests the best free same-trade person to assign.

After any schedule or assignment change, conflicts are recalculated automatically.

---

## 7) Recommended Demo Flow

1. Open app → lands on **Timeline**
2. Drag a task or add a new one → changes appear as **draft** (dashed bar)
3. Review draft banner — fix any manpower overlap before saving
4. Click **Save programme** → changes commit to live schedule
5. If server still flags conflicts → open **Conflicts** → apply AI recommendation
6. Return to Gantt → verify clean schedule

---

## 8) Quick FAQ

### When does a conflict alert appear?
Only when the same manpower is assigned to tasks with overlapping dates.

### Is the AI recommendation real AI?
Not yet — it is a **mock recommendation engine** using trade, state, and load rules. Real AI integration is planned for a later phase.

### Can task dates be moved from the timeline?
Yes. Drag and resize bars directly in Gantt.

### What is the main screen for PM?
Timeline — the app opens there by default.

---

## 9) Notes

- This guide reflects the current demo-focused product behavior.
- Terminology: `Settings`, `Programme settings`, `By Manpower` view.
- For finance language in this phase, prefer `Project Expense` and `Expense Entry` for internal tracking.
- For stakeholder docs, this can be split into Operations / Field / Admin guides.
