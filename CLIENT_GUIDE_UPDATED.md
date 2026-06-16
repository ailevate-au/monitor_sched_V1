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

- **Timeline is the main PM view** — app opens directly to the programme timeline
- **Conflict alert rule:** a manpower conflict is raised only when the **same person is assigned to tasks with overlapping dates**
- **Conflicts** shows why someone cannot be used and suggests replacement manpower
- **AI Recommendation (Demo)** — mock recommendation card ranks suitable replacements by trade, state, and load (real AI layer planned for next phase)
- Simplified Gantt UI — larger timeline, fewer filters visible by default

---

## 3) Main Navigation

### Overview
- `Overview`
- `Projects`
- `Weather`

### Scheduling
- **`Timeline`** ← primary demo view

### Resources
- `Resources`
- **`Conflicts`** ← manpower overlap alerts + recommendations

### Finance
- `Finance`
- `Project Expenses`
- `Reports`

### Administration
- `Settings`

---

## 4) Roles and Access

Two active operating personas:

- **PM View** — full management workspace (Gantt-first)
- **Field Worker View** — mobile-first `My Work` screen

Field workers can update progress and report delays; they cannot edit the full programme.

---

## 5) Feature Guide (Demo Focus)

## Timeline (Main View)

- Views: **Overall**, **By Manpower**, **Kanban**
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

- 7-day BOM forecast with risk levels
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
