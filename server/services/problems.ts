/**
 * PROBLEMS HUB engine — owner-centric unified feed: conflicts + unassigned +
 * late projects + fragile buffers + weather, each carrying 2–3 plain-language
 * suggested fixes. Derived on every request (not persisted); resolving an
 * action mutates the underlying tasks so the problem disappears on the next
 * recompute. Moved 1:1 out of the old server.ts monolith.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { dbInstance } from "../../src/server/db";
import { computeCascade, getReplacementCandidates } from "../../src/server/conflictEngine";
import { RESOURCE_PROFILES } from "../../src/server/seedData";

export const SCENARIO_TODAY = new Date("2026-07-02"); // demo "now" — aligns with weather + dashboard

export const profileFor = (id: string): { bio?: string; skills?: string[] } => RESOURCE_PROFILES[id] || {};

const stateForTask = (t: any) =>
  dbInstance.projects.find(p => p.id === t?.projectId)?.state || "NSW";

const projectNameFor = (pid: string) =>
  dbInstance.projects.find(p => p.id === pid)?.name || "Unknown project";

// Clear, unambiguous job label: project + full task name, so two jobs with the
// same name (e.g. "… — Level 4/5") are told apart. e.g. "Parramatta Square · Structural Steel Frame — Level 4".
const jobLabelFor = (t: any) => {
  const proj = (projectNameFor(t?.projectId) || "").split(" — ")[0];
  return proj ? `${proj} · ${t?.name}` : (t?.name || "this job");
};

export function applyShift(taskId: string, delayDays: number) {
  const db = dbInstance;
  const t = db.tasks.find(x => x.id === taskId);
  if (!t) return;
  const updated = computeCascade(db.tasks, taskId, delayDays, stateForTask(t));
  db.tasks = db.tasks.map(tk => {
    const u = updated.find(x => x.id === tk.id);
    return u ? { ...tk, start: u.start, end: u.end } : tk;
  });
}

export function buildProblemsResponse() {
  const db = dbInstance;
  const problems: any[] = [];
  const conflictedIds = new Set(db.conflicts.map(c => c.resourceId));

  // 1) CONFLICTS — double-booked resources
  for (const c of db.conflicts) {
    const conflictTasks = db.tasks.filter(t => t.assigneeId === c.resourceId && t.status === "conflict");
    const reassignTask = conflictTasks[0];
    const projNames = Array.from(new Set(conflictTasks.map(t => projectNameFor(t.projectId))));
    const candidates = (c.candidates || [])
      .filter((cd: any) => !conflictedIds.has(cd.id))
      .slice(0, 2);

    const actions: any[] = candidates.map((cd: any, i: number) => {
      const prof = profileFor(cd.id);
      const interstate = cd.same_state === false ? ` Lives in ${cd.state} (would travel).` : "";
      return {
        id: `reassign:${cd.id}`,
        kind: "reassign",
        label: reassignTask ? `Give "${jobLabelFor(reassignTask)}" to ${cd.name}` : `Give the job to ${cd.name}`,
        detail: `${cd.name} is free for these dates. Costs ${cd.rate}, ${cd.util}% booked right now.${interstate} ${prof.bio || ""}`.trim(),
        recommended: i === 0,
        resource: { ...cd, bio: prof.bio, skills: prof.skills, recommended: i === 0 },
      };
    });
    if (reassignTask) {
      actions.push({
        id: `shift:${reassignTask.id}:14`,
        kind: "accept_delay",
        label: `Push "${jobLabelFor(reassignTask)}" back 2 weeks instead`,
        detail: `Keep ${c.resource} on both jobs and move "${reassignTask.name}" 2 weeks later. Jobs that wait on it move too.`,
        delayDays: 14,
      });
    }

    const crossProject = projNames.length > 1;
    problems.push({
      id: `prob-conflict-${c.resourceId}`,
      category: "conflict",
      severity: "critical",
      taskIds: conflictTasks.map(t => t.id),
      title: `${c.resource} is booked on two jobs at the same time`,
      projectName: projNames.join(" + ") || (reassignTask ? projectNameFor(reassignTask.projectId) : ""),
      // Name both jobs with their project + dates so a cross-project clash is obvious.
      what: conflictTasks.length >= 2
        ? `${c.resource} is needed on ${conflictTasks.length} jobs at once${crossProject ? " (on different projects)" : ""}: ${conflictTasks.map(t => `"${jobLabelFor(t)}" (${t.start} to ${t.end})`).join(" and ")}.`
        : c.desc,
      impact: "",
      suggestedActions: actions,
    });
  }

  // 1b) UNASSIGNED — active-project jobs with nobody assigned. A real problem:
  // the work has no one to do it. Suggest the best same-trade person who's free.
  const activeIds = new Set(db.projects.filter(p => p.status === "ACTIVE").map(p => p.id));
  const unassignedTasks = db.tasks.filter(
    t => !t.assigneeId && t.status !== "completed" && activeIds.has(t.projectId)
  );
  for (const t of unassignedTasks) {
    const cands = getReplacementCandidates("", t.tradeRequired, t)
      .filter((cd: any) => !conflictedIds.has(cd.id))
      .slice(0, 2);
    const actions: any[] = cands.map((cd: any, i: number) => {
      const prof = profileFor(cd.id);
      const interstate = cd.same_state === false ? ` Lives in ${cd.state} (would travel).` : "";
      return {
        id: `assign:${t.id}:${cd.id}`,
        kind: "reassign",
        label: `Put ${cd.name} on "${jobLabelFor(t)}"`,
        detail: `${cd.name} is free for these dates. Costs ${cd.rate}, ${cd.util}% booked right now.${interstate} ${prof.bio || ""}`.trim(),
        recommended: i === 0,
        resource: { ...cd, bio: prof.bio, skills: prof.skills, recommended: i === 0 },
      };
    });
    problems.push({
      id: `prob-unassigned-${t.id}`,
      category: "unassigned",
      severity: "medium",
      taskIds: [t.id],
      title: `No one is assigned to "${jobLabelFor(t)}"`,
      projectName: projectNameFor(t.projectId),
      what: `"${t.name}" (${t.start} to ${t.end}) needs a ${t.tradeRequired}, but nobody is on it yet.`,
      impact: "Nobody is doing this job yet, so it can't start.",
      suggestedActions: actions,
    });
  }

  // 2) LATE — tasks past their end date (relative to the scenario "now"), plus —
  // when the opt-in deadline warning is on — jobs now forecast to finish AFTER
  // their must-finish-by deadline (behind schedule even if the end is in future).
  const deadlineWarn = !!db.settings.deadlineWarnings?.enabled;
  const lateByProject = new Map<string, any[]>();
  for (const t of db.tasks) {
    if (t.status === "completed" || (t.percent_complete ?? 0) >= 100) continue;
    const pastDue = new Date(t.end) < SCENARIO_TODAY;
    const missesDeadline = deadlineWarn && !!t.deadline && t.end > t.deadline;
    if (!pastDue && !missesDeadline) continue;
    if (!lateByProject.has(t.projectId)) lateByProject.set(t.projectId, []);
    lateByProject.get(t.projectId)!.push(t);
  }
  for (const [pid, tasks] of lateByProject) {
    const worst = tasks.slice().sort((a, b) => +new Date(a.end) - +new Date(b.end))[0];
    const pastDue = new Date(worst.end) < SCENARIO_TODAY;
    const byDeadline = !pastDue && deadlineWarn && !!worst.deadline && worst.end > worst.deadline;
    const daysLate = byDeadline
      ? Math.round((new Date(worst.end).getTime() - new Date(worst.deadline).getTime()) / 86400000)
      : Math.round((SCENARIO_TODAY.getTime() - new Date(worst.end).getTime()) / 86400000);
    const actions: any[] = [{
      id: `shift:${worst.id}:10`,
      kind: "extend_deadline",
      label: "Give it 2 more weeks",
      detail: `Move the late job 2 weeks later and clear the red flag. Jobs that wait on it move too.`,
      delayDays: 10,
      recommended: true,
    }];
    const assignee = db.resources.find(r => r.id === worst.assigneeId);
    if (assignee) {
      const cands = getReplacementCandidates(assignee.id, assignee.trade, worst).filter(cd => !conflictedIds.has(cd.id));
      if (cands[0]) {
        const prof = profileFor(cands[0].id);
        actions.push({
          id: `reassign:${cands[0].id}`,
          kind: "reassign",
          label: `Bring in ${cands[0].name} to catch up`,
          detail: `Costs ${cands[0].rate}, ${cands[0].util}% booked. ${prof.bio || ""}`.trim(),
          resource: { ...cands[0], bio: prof.bio, skills: prof.skills },
        });
      }
    }
    problems.push({
      id: `prob-late-${worst.id}`,
      category: "late",
      severity: "high",
      taskIds: [worst.id],
      title: `${projectNameFor(pid)} is behind schedule`,
      projectName: projectNameFor(pid),
      what: byDeadline
        ? `"${jobLabelFor(worst)}" is now forecast to finish ${worst.end}, ${daysLate} day${daysLate !== 1 ? "s" : ""} past its ${worst.deadline} deadline${assignee ? ` (${assignee.name}'s job)` : ""}.`
        : `"${jobLabelFor(worst)}" was due ${worst.end}, now ${daysLate} day${daysLate !== 1 ? "s" : ""} late${assignee ? ` (${assignee.name}'s job)` : ""}.`,
      impact: byDeadline
        ? "This job is set to miss its deadline, so the jobs after it are at risk too."
        : "This job is already late, so the jobs after it are waiting too.",
      suggestedActions: actions,
    });
  }

  // 3) FRAGILE — surface only the single most at-risk handover (keeps the
  // owner's feed focused rather than listing every ≤1-day gap).
  const worstFragile = db.fragileTasks.slice().sort((a, b) => a.bufferDays - b.bufferDays)[0];
  for (const f of (worstFragile ? [worstFragile] : [])) {
    const parent = db.tasks.find(t => t.id === f.id);
    if (!parent) continue;
    // Use the exact tight successor detection flagged (falls back to the first
    // assigned dependent) so the "breathing room" fix shifts the job the
    // problem actually names.
    const child =
      (f.childId ? db.tasks.find(t => t.id === f.childId) : undefined) ||
      db.tasks.find(t => (t.dependencies || "").split(",").map(d => d.trim()).includes(f.id) && t.assigneeId);
    const actions: any[] = [];
    if (child) {
      actions.push({
        id: `shift:${child.id}:3`,
        kind: "extend_deadline",
        label: "Add 3 days of breathing room",
        detail: `Start the next job 3 days later so there's a gap. Removes the risk of a pile-up.`,
        delayDays: 3,
        recommended: true,
      });
    }
    actions.push({
      id: `shift:${f.id}:-2`,
      kind: "extend_deadline",
      label: "Start the first job 2 days earlier",
      detail: `Bring the earlier job forward 2 days to open up a safety gap.`,
      delayDays: -2,
    });
    problems.push({
      id: `prob-fragile-${f.id}`,
      category: "fragile",
      severity: "medium",
      taskIds: [f.id],
      title: `No gap between two jobs on ${f.name}`,
      projectName: projectNameFor(parent.projectId),
      what: f.desc,
      impact: "If the first job runs even 1 day over, the next one can't start. Easy to miss.",
      suggestedActions: actions,
    });
  }

  // 4) WEATHER — group all storm-exposed tasks into one problem
  const weatherTasks = db.tasks.filter(t => t.status === "weather");
  if (weatherTasks.length) {
    const ids = weatherTasks.map(t => t.id).join(",");
    problems.push({
      id: `prob-weather`,
      category: "weather",
      severity: "high",
      taskIds: weatherTasks.map(t => t.id),
      title: `Bad weather could stop ${weatherTasks.length} job(s) this week`,
      projectName: Array.from(new Set(weatherTasks.map(t => projectNameFor(t.projectId)))).join(" + "),
      what: `Rain and storms forecast this week. Outdoor jobs at risk: ${weatherTasks.map(t => jobLabelFor(t)).join("; ")}.`,
      impact: "Storms could stop this outdoor work, so the jobs may not get done this week.",
      suggestedActions: [
        {
          id: `shiftmany:${ids}:5`,
          kind: "extend_deadline",
          label: "Move these jobs past the storm",
          detail: "Push the outdoor jobs 5 days later so they land in clear weather.",
          delayDays: 5,
          recommended: true,
        },
        {
          id: `shiftmany:${ids}:7`,
          kind: "extend_deadline",
          label: "Claim the lost time and extend",
          detail: "Log the storm as an official delay and move the jobs 7 days later.",
          delayDays: 7,
        },
      ],
    });
  }

  const order: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  problems.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    problems,
    summary: {
      total: problems.length,
      critical: problems.filter(p => p.severity === "critical").length,
      projectsAffected: new Set(problems.flatMap(p => p.projectName.split(" + "))).size,
      projectsTotal: db.projects.filter(p => p.status === "ACTIVE").length,
    },
  };
}
