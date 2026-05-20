// ── Edits layer ──────────────────────────────────────────────────────────────
// Manages user mutations (add task, delete project, shift timeline, etc) on top
// of the base parsed xlsx data. Edits are persisted as a single JSON blob;
// applying them rebuilds the schedData object.

import { addW, parseDate, fmtDDMMYYYY } from './dates.jsx';
import { loadDepOverrides, saveSchedEdits } from '../storage/persist.jsx';

/**
 * Merge saved edits into a parsed schedData object.
 * Edits shape: { rawTasks, projs, people, deletedIds, deletedProjs }
 *
 * @param {object} base - Parsed schedData (from parseXlsx)
 * @param {object|null} edits
 * @returns {object} New schedData with edits applied
 */
export function applyEditsToData(base, edits) {
  if (!edits) return base;

  const deletedIds   = new Set(edits.deletedIds   || []);
  const deletedProjs = new Set(edits.deletedProjs || []);

  // An edited task (e.g. one moved via shiftTimeline) keeps the SAME id as its
  // base version. We must let the edited copy REPLACE the base copy — not
  // append alongside it. Previously both were included, so a shifted task and
  // its un-shifted original (same id, same person, overlapping dates) were
  // detected as conflicting with each other — a phantom self-conflict.
  const editedTasks   = edits.rawTasks || [];
  const editedTaskIds = new Set(editedTasks.map(t => t.id));

  let rawTasks = [
    // base tasks, EXCEPT any that have an edited replacement
    ...base.rawTasks.filter(t => !editedTaskIds.has(t.id)),
    // the edited versions
    ...editedTasks,
  ].filter(t => !deletedIds.has(t.id) && !deletedProjs.has(t.proj));

  let projs = [
    ...base.projs,
    ...(edits.projs || []).filter(p => !base.projs.find(x => x.id === p.id)),
  ].filter(p => !deletedProjs.has(p.id));

  let people = [
    ...base.people,
    ...(edits.people || []).filter(p => !base.people.find(x => x.name === p.name)),
  ];

  // Prune people with no remaining tasks
  const activePeople = new Set(rawTasks.map(t => t.person));
  people = people.filter(p => activePeople.has(p.name));

  const tdepMap = Object.fromEntries(rawTasks.map(t => [t.id, t.deps]));

  // Overlay typed dep overrides
  const depOverrides = loadDepOverrides();
  for (const [taskId, typedDeps] of depOverrides.entries()) {
    if (rawTasks.find(t => t.id === taskId)) {
      tdepMap[taskId] = typedDeps;
    }
  }

  return { ...base, rawTasks, projs, people, tdepMap };
}

/**
 * Apply a mutation: persists the new edits blob and returns the updated schedData.
 *
 * @param {object} baseData - Parsed schedData
 * @param {object|null} currentEdits - Previously saved edits (or null)
 * @param {object} mutation - One of:
 *   { type:'deleteTask', taskId }
 *   { type:'deleteProject', projId }
 *   { type:'addTasks', tasks, people }
 *   { type:'shiftTimeline', taskIds, days }
 * @returns {object} New schedData
 */
export function mutateSchedData(baseData, currentEdits, mutation) {
  const edits = {
    rawTasks:     [...(currentEdits?.rawTasks     || [])],
    projs:        [...(currentEdits?.projs        || [])],
    people:       [...(currentEdits?.people       || [])],
    deletedIds:   [...(currentEdits?.deletedIds   || [])],
    deletedProjs: [...(currentEdits?.deletedProjs || [])],
  };

  switch (mutation.type) {
    case 'deleteTask': {
      if (!edits.deletedIds.includes(mutation.taskId)) edits.deletedIds.push(mutation.taskId);
      edits.rawTasks = edits.rawTasks.filter(t => t.id !== mutation.taskId);
      break;
    }
    case 'deleteProject': {
      if (!edits.deletedProjs.includes(mutation.projId)) edits.deletedProjs.push(mutation.projId);
      edits.rawTasks = edits.rawTasks.filter(t => t.proj !== mutation.projId);
      edits.projs    = edits.projs.filter(p => p.id !== mutation.projId);
      break;
    }
    case 'addTasks': {
      edits.rawTasks.push(...mutation.tasks);
      for (const p of (mutation.people || [])) {
        if (!edits.people.find(x => x.name === p.name)) edits.people.push(p);
      }
      break;
    }
    case 'shiftTimeline': {
      const { taskIds, days } = mutation;
      // Most up-to-date raw task for each id (base + already-edited)
      const rawMap = {};
      for (const t of [...baseData.rawTasks, ...edits.rawTasks]) rawMap[t.id] = t;

      for (const id of taskIds) {
        const t = rawMap[id];
        if (!t) continue;
        const sDate = parseDate(t.start);
        const eDate = parseDate(t.end);
        if (!sDate || !eDate) continue;
        const shifted = {
          ...t,
          start: fmtDDMMYYYY(addW(sDate, days)),
          end:   fmtDDMMYYYY(addW(eDate, days)),
        };
        const idx = edits.rawTasks.findIndex(x => x.id === id);
        if (idx >= 0) edits.rawTasks[idx] = shifted;
        else edits.rawTasks.push(shifted);
        edits.deletedIds = edits.deletedIds.filter(x => x !== id);
      }
      break;
    }
    case 'reassignTasks': {
      // Reassign one or more tasks to new people. Each entry: { taskId, toPerson }.
      // The new person object (color, role, init) is looked up from baseData.people
      // and added to edits.people if not already present.
      const { assignments } = mutation;
      const rawMap = {};
      for (const t of [...baseData.rawTasks, ...edits.rawTasks]) rawMap[t.id] = t;
      const allPeople = [...baseData.people, ...edits.people];

      for (const { taskId, toPerson } of assignments) {
        const t = rawMap[taskId];
        if (!t || t.person === toPerson) continue;
        const reassigned = { ...t, person: toPerson };
        const idx = edits.rawTasks.findIndex(x => x.id === taskId);
        if (idx >= 0) edits.rawTasks[idx] = reassigned;
        else edits.rawTasks.push(reassigned);
        edits.deletedIds = edits.deletedIds.filter(x => x !== taskId);

        // If toPerson isn't already in base or edits.people, add them.
        if (!allPeople.find(p => p.name === toPerson) &&
            !edits.people.find(p => p.name === toPerson)) {
          // Best-effort lookup — they should exist somewhere; if not, synthesize.
          const known = allPeople.find(p => p.name === toPerson);
          edits.people.push(known || { name: toPerson, role: '', init: toPerson.slice(0,2).toUpperCase(), color: '#5B7B9A', rate: '$42/hr' });
        }
      }
      break;
    }
    default: {
      // Unknown mutation — no-op, but warn in dev
      console.warn('mutateSchedData: unknown mutation type', mutation);
    }
  }

  saveSchedEdits(edits);
  return applyEditsToData(baseData, edits);
}

// ────────────────────────────────────────────────────────────────────────────
// History log entries
// ────────────────────────────────────────────────────────────────────────────
// Each commit through mutateSchedData produces one structured history entry.
// App.jsx is responsible for appending these to its `history` state and
// persisting via storage/persist.jsx. The shape:
//   {
//     id: String,              // unique id, e.g. timestamp + random suffix
//     timestamp: Number,       // Date.now()
//     kind: String,            // 'shiftTimeline' | 'reassignTasks' | 'addTasks'
//                              // | 'deleteTask' | 'deleteProject' | 'upload' | 'revert'
//     summary: String,         // one-line action + impact, e.g. "Shifted P1 by +3d · 5 tasks moved"
//     details: Array,          // expanded rows, freeform per-kind
//     refersTo: String|null,   // id of an earlier entry this reverts (for 'revert' kind)
//   }
//
// `buildHistoryEntry` is intentionally pure — it doesn't touch persistence.
// That's App.jsx's job, so the log can be a normal React-state slot.
let _hentrySeq = 0;
function _newEntryId() {
  _hentrySeq++;
  return `h-${Date.now()}-${_hentrySeq}`;
}

/**
 * Translate a mutation into a structured history entry.
 *
 * @param {object} mutation - same shape passed to mutateSchedData
 * @param {object} baseData - schedData (for looking up names/projects to enrich the summary)
 * @param {object} [extra]  - optional caller-provided enrichment (e.g. {affectedTaskCount:5})
 * @returns {object} A history entry, OR null if the mutation type doesn't merit one.
 */
export function buildHistoryEntry(mutation, baseData, extra = {}) {
  const ts = Date.now();
  const id = _newEntryId();
  const findTask = tid => baseData.rawTasks.find(t => t.id === tid);
  const findProj = pid => baseData.projs.find(p => p.id === pid);

  switch (mutation.type) {
    case 'shiftTimeline': {
      const { taskIds, days } = mutation;
      const affected = extra.affectedTaskCount || taskIds.length;
      const t0 = findTask(taskIds[0]);
      const projId = t0?.proj || '';
      const sign = days > 0 ? '+' : '';
      return {
        id, timestamp: ts, kind: 'shiftTimeline',
        summary: `Shifted ${projId ? projId + ' ' : ''}by ${sign}${days}d · ${affected} task${affected===1?'':'s'} moved`,
        details: taskIds.map(tid => {
          const t = findTask(tid);
          return t ? { taskId: tid, name: t.name, proj: t.proj, person: t.person } : { taskId: tid };
        }),
        refersTo: null,
      };
    }
    case 'reassignTasks': {
      const { assignments } = mutation;
      const summary = assignments.length === 1
        ? `Reassigned ${findTask(assignments[0].taskId)?.person || '?'} → ${assignments[0].toPerson} · ${findTask(assignments[0].taskId)?.name || assignments[0].taskId}`
        : `Reassigned ${assignments.length} tasks across people`;
      return {
        id, timestamp: ts, kind: 'reassignTasks', summary,
        details: assignments.map(a => {
          const t = findTask(a.taskId);
          return { taskId: a.taskId, name: t?.name, proj: t?.proj, from: t?.person, to: a.toPerson };
        }),
        refersTo: null,
      };
    }
    case 'addTasks': {
      const { tasks, people } = mutation;
      const newPeopleCount = (people || []).length;
      const projIds = [...new Set(tasks.map(t => t.proj))];
      const projPart = projIds.length === 1 ? ` to ${projIds[0]}` : ` across ${projIds.length} projects`;
      const peoplePart = newPeopleCount ? ` · +${newPeopleCount} new ${newPeopleCount===1?'person':'people'}` : '';
      return {
        id, timestamp: ts, kind: 'addTasks',
        summary: `Added ${tasks.length} task${tasks.length===1?'':'s'}${projPart}${peoplePart}`,
        details: tasks.map(t => ({ taskId: t.id, name: t.name, proj: t.proj, person: t.person, start: t.start, end: t.end })),
        refersTo: null,
      };
    }
    case 'deleteTask': {
      const t = findTask(mutation.taskId);
      return {
        id, timestamp: ts, kind: 'deleteTask',
        summary: t ? `Deleted ${t.proj} · ${t.name}` : `Deleted task ${mutation.taskId}`,
        details: t ? [{ taskId: t.id, name: t.name, proj: t.proj, person: t.person }] : [{ taskId: mutation.taskId }],
        refersTo: null,
      };
    }
    case 'deleteProject': {
      const p = findProj(mutation.projId);
      const affectedTasks = baseData.rawTasks.filter(t => t.proj === mutation.projId);
      return {
        id, timestamp: ts, kind: 'deleteProject',
        summary: `Deleted project ${mutation.projId}${p?.name ? ' (' + p.name + ')' : ''} · ${affectedTasks.length} task${affectedTasks.length===1?'':'s'}`,
        details: affectedTasks.map(t => ({ taskId: t.id, name: t.name, person: t.person })),
        refersTo: null,
      };
    }
    default:
      return null;
  }
}

/**
 * Build a synthetic history entry for an initial xlsx upload.
 * Called by App.jsx the first time schedData is loaded.
 */
export function buildUploadHistoryEntry(schedData, sourceLabel = 'Initial upload') {
  const id = _newEntryId();
  return {
    id,
    timestamp: Date.now(),
    kind: 'upload',
    summary: `${sourceLabel} · Imported ${schedData.projs.length} project${schedData.projs.length===1?'':'s'}, ${schedData.rawTasks.length} task${schedData.rawTasks.length===1?'':'s'}`,
    details: schedData.rawTasks.map(t => ({ taskId: t.id, name: t.name, proj: t.proj, person: t.person, start: t.start, end: t.end })),
    refersTo: null,
  };
}

/**
 * Build a "revert" history entry referencing an earlier committed change.
 * Used when the user reverts a previously-committed shift or reassignment.
 */
export function buildRevertHistoryEntry(originalEntry) {
  return {
    id: _newEntryId(),
    timestamp: Date.now(),
    kind: 'revert',
    summary: `Reverted: ${originalEntry.summary}`,
    details: originalEntry.details,
    refersTo: originalEntry.id,
  };
}