// ── XLSX parser ──────────────────────────────────────────────────────────────
// Reads an ArrayBuffer from an .xlsx file.
// Expected sheet "Schedule" (or first sheet) with columns:
//   Project | Task ID | Task Name | Assigned | Role | Rate | Start | End | Dependencies | Status
// Optional second sheet matching /people|resource|team/ to provide person metadata.
// Optional third sheet named "Projects" with columns:
//   Project ID | Project Name | Status | Start | End | Color
// Status defaults to 'active' (if tasks exist) or 'draft' (if no tasks).
// The "Assigned" column on Schedule rows is OPTIONAL — blank means the task
// is unassigned; the parser collects these for the import-confirm summary.

import { parseDate, calDiff } from './dates.jsx';
import { PROJ_COLORS, PERSON_COLORS } from '../theme.jsx';

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{
 *   rawTasks, projs, people, tdepMap, base, todayDay, periods,
 *   parsed:  same fields above grouped under one key (for new callers),
 *   pending: {
 *     implicitPeople: Array<{name, role, taskCount}>,
 *     autoCreatedProjs: Array<{id, taskCount}>,
 *     draftWithTasksWarnings: Array<string>,  // project IDs
 *     unassignedTaskCount: number,
 *   }
 * }>}
 *
 * The legacy fields at the top of the returned object are kept for
 * backward compatibility — existing callers that destructure
 * `{ rawTasks, projs, ... }` continue to work. New callers should read
 * `result.parsed` (the data) and `result.pending` (the confirmation data).
 */
export async function parseXlsx(buffer) {
  // Dynamic import — works in Vite. If you migrate to a bundler that doesn't
  // support HTTP imports (Next/CRA), `npm install xlsx` and change to:
  //   import * as XLSX from 'xlsx';
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
  const wb = XLSX.read(buffer, { type:'array', cellDates:true });

  // ── Schedule sheet ─────────────────────────────────────────────────────────
  const sheetName = wb.SheetNames.find(n => /schedule/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });
  if (!rows.length) throw new Error('Schedule sheet is empty.');

  const norm = obj => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k.trim().toLowerCase().replace(/\s+/g,'_')] = v;
    return out;
  };
  const data = rows.map(norm);

  const col = (row, ...keys) => {
    for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; }
    return '';
  };

  const rawTasks = [];
  const projOrder = [], personOrder = [];
  const projMap = {}, personMap = {};
  // Track WHERE each person was first seen — 'sheet' (explicit People sheet entry)
  // or 'task' (implicit, only seen as a task assignee). The import-confirm modal
  // uses this to decide which people need a checkbox prompt (only 'task' ones).
  const personSource = {};
  // Task IDs that were imported without an assignee — surfaced as a count in
  // the import confirmation modal so the user can verify the import looked right.
  const unassignedTaskIds = [];

  for (const row of data) {
    const projId   = String(col(row, 'project', 'proj')).trim();
    const seqId    = String(col(row, 'task_id', 'taskid', 'id')).trim();
    const name     = String(col(row, 'task_name', 'taskname', 'name')).trim();
    const person   = String(col(row, 'assigned', 'person', 'resource')).trim();
    const role     = String(col(row, 'role')).trim();
    const rate     = String(col(row, 'rate')).trim();
    const startRaw = col(row, 'start', 'start_date');
    const endRaw   = col(row, 'end', 'end_date', 'finish');
    const depsRaw  = String(col(row, 'dependencies', 'depends_on', 'deps')).trim();

    // Task identity needs projId + seqId + name. Person is optional now.
    if (!projId || !seqId || !name) continue;

    const id = `${projId}-${seqId}`;
    const startD = startRaw instanceof Date ? startRaw : parseDate(startRaw);
    const endD   = endRaw   instanceof Date ? endRaw   : parseDate(endRaw);
    if (!startD || !endD) continue;

    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    const dur = Math.max(1, Math.round(Math.abs(endD - startD) / (864e5 * 7 / 5)));

    const deps = depsRaw
      ? depsRaw.split(/[,;]+/).map(d => {
          const clean = d.trim();
          if (!clean) return null;
          return clean.includes('-') ? clean : `${projId}-${clean}`;
        }).filter(Boolean)
      : [];

    if (!projMap[projId]) {
      projMap[projId] = {
        id: projId,
        name: `${projId} — New Build`,
        color: PROJ_COLORS[projOrder.length % PROJ_COLORS.length],
        base: startD,
        status: 'active',     // tasks exist → default active (Projects sheet may override)
        autoCreated: true,    // flag for the import-confirm warning (cleared if Projects sheet later defines this id)
      };
      projOrder.push(projId);
    } else if (startD < projMap[projId].base) {
      projMap[projId].base = startD;
    }

    // Track unassigned tasks for the import summary
    if (!person) {
      unassignedTaskIds.push(id);
    }

    if (person && !personMap[person]) {
      const init = person.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      personMap[person] = {
        name: person, role, init,
        color: PERSON_COLORS[personOrder.length % PERSON_COLORS.length],
        rate: rate || '$42/hr',
      };
      personOrder.push(person);
      personSource[person] = 'task';  // implicit — first seen on a task row
    }
    if (person && rate && personMap[person]) personMap[person].rate = rate;

    rawTasks.push({ id, proj:projId, name, person, dur, start:fmt(startD), end:fmt(endD), deps });
  }

  // ── Optional People sheet ──────────────────────────────────────────────────
  const peopleSheet = wb.SheetNames.find(n => /people|resource|team/i.test(n));
  if (peopleSheet) {
    const pws = wb.Sheets[peopleSheet];
    const prows = XLSX.utils.sheet_to_json(pws, { defval:'' }).map(norm);
    for (const row of prows) {
      const name  = String(col(row, 'name')).trim();
      const role  = String(col(row, 'role')).trim();
      const rate  = String(col(row, 'rate')).trim();
      const color = String(col(row, 'color')).trim();
      if (!name) continue;
      if (!personMap[name]) {
        const init = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        personMap[name] = { name, role, init, color: color || PERSON_COLORS[personOrder.length % PERSON_COLORS.length], rate: rate || '$42/hr' };
        personOrder.push(name);
      } else {
        if (role)  personMap[name].role  = role;
        if (rate)  personMap[name].rate  = rate;
        if (color) personMap[name].color = color;
      }
      // EXPLICIT entry — always wins over an earlier 'task' tag. People listed
      // in the People sheet are added unconditionally (no prompt).
      personSource[name] = 'sheet';
    }
  }

  // ── Optional Projects sheet ────────────────────────────────────────────────
  // A project can exist here WITHOUT having any tasks in the Schedule sheet
  // — that's a draft. Fields:
  //   Project ID (required), Project Name, Status (draft/active/completed),
  //   Start, End, Color
  // Projects-sheet entries OVERRIDE the auto-created defaults from the
  // Schedule sheet pass. A project named here clears its `autoCreated` flag.
  // If a project has tasks but the sheet says 'draft', the sheet wins (per spec)
  // and a warning is collected for the import-confirm modal.
  const projectsSheet = wb.SheetNames.find(n => /^projects?$/i.test(n));
  const draftWithTasksWarnings = [];
  if (projectsSheet) {
    const prws = wb.Sheets[projectsSheet];
    const prrows = XLSX.utils.sheet_to_json(prws, { defval:'' }).map(norm);
    for (const row of prrows) {
      const pid    = String(col(row, 'project_id', 'projectid', 'id', 'project')).trim();
      const pname  = String(col(row, 'project_name', 'projectname', 'name')).trim();
      const pstat  = String(col(row, 'status')).trim().toLowerCase();
      const pcolor = String(col(row, 'color')).trim();
      const pstartRaw = col(row, 'start', 'start_date');
      const pendRaw   = col(row, 'end', 'end_date', 'finish');
      const pstart = pstartRaw instanceof Date ? pstartRaw : (pstartRaw ? parseDate(pstartRaw) : null);
      const pend   = pendRaw   instanceof Date ? pendRaw   : (pendRaw   ? parseDate(pendRaw)   : null);
      if (!pid) continue;

      const validStatuses = ['draft', 'active', 'completed'];
      let status = validStatuses.includes(pstat) ? pstat : null;

      if (!projMap[pid]) {
        // Project exists only in Projects sheet — no tasks. This is a draft
        // by default unless explicitly set otherwise.
        projMap[pid] = {
          id: pid,
          name: pname || `${pid} — New Build`,
          color: pcolor || PROJ_COLORS[projOrder.length % PROJ_COLORS.length],
          base: pstart || new Date(),
          status: status || 'draft',
          ...(pstart ? { start: pstart } : {}),
          ...(pend   ? { end:   pend   } : {}),
        };
        projOrder.push(pid);
      } else {
        // Project also has tasks. Update metadata; flag if status conflict.
        const proj = projMap[pid];
        proj.autoCreated = false;  // explicitly defined now
        if (pname)  proj.name  = pname;
        if (pcolor) proj.color = pcolor;
        if (pstart) proj.start = pstart;
        if (pend)   proj.end   = pend;
        if (status) {
          if (status === 'draft' && rawTasks.some(t => t.proj === pid)) {
            draftWithTasksWarnings.push(pid);
          }
          proj.status = status;
        }
      }
    }
  }

  if (!rawTasks.length && projOrder.length === 0) {
    throw new Error('No valid tasks or projects found. Check column names match the template.');
  }

  const projs   = projOrder.map(id => projMap[id]);
  const people  = personOrder.map(n => personMap[n]);
  const tdepMap = Object.fromEntries(rawTasks.map(t => [t.id, t.deps]));

  // Base year: prefer earliest task start; fall back to earliest draft start; finally today.
  const allStarts = rawTasks.map(t => parseDate(t.start)).filter(Boolean);
  const draftStarts = projs.map(p => p.start).filter(Boolean);
  const allDates = [...allStarts, ...draftStarts];
  const earliest = allDates.length
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : new Date();
  const baseYear = new Date(earliest.getFullYear(), 0, 1);

  const today = new Date();
  today.setHours(0,0,0,0);
  const todayDay = calDiff(baseYear, today);

  // Build month periods covering all tasks (up to 24 months).
  // If there are no tasks (drafts-only import), fall back to draft windows or
  // a 24-month forward window from today.
  const taskEnds = rawTasks.map(t => parseDate(t.end)).filter(Boolean).map(d => d.getTime());
  const draftEnds = projs.map(p => p.end).filter(Boolean).map(d => d.getTime());
  const maxEndMs = (taskEnds.length || draftEnds.length)
    ? Math.max(...taskEnds, ...draftEnds)
    : (new Date(baseYear.getFullYear(), 11, 31)).getTime();
  const maxEnd = new Date(maxEndMs);
  const periods = [];
  const startYear = baseYear.getFullYear();
  for (let mo = 0; mo < 24; mo++) {
    const mStart = new Date(startYear, mo, 1);
    const mEnd   = new Date(startYear, mo + 1, 0);
    if (mStart > maxEnd) break;
    const sd = calDiff(baseYear, mStart);
    const ed = calDiff(baseYear, mEnd);
    const label = mStart.toLocaleDateString('en-AU', { month:'short', year:'2-digit' });
    const key   = `m${startYear}${String(mo+1).padStart(2,'0')}`;
    periods.push({ key, label, startDay:sd, endDay:ed });
  }

  // ── Pending confirmation data ──────────────────────────────────────────────
  // Built so App.jsx can decide whether to show the ImportConfirmModal.
  // - implicitPeople: people seen only on tasks (not in People sheet) — get
  //   a checkbox prompt before being added to the resource database.
  // - autoCreatedProjs: projects that were referenced by tasks but never
  //   defined in a Projects sheet — shown as a warning so the user can clean
  //   up next import.
  // - draftWithTasksWarnings: project IDs marked 'draft' in the Projects
  //   sheet but with tasks — kept as draft per spec, surfaced as a note.
  // - unassignedTaskCount: shown as a summary so the user can sanity-check.
  const taskCountByPerson = {};
  for (const t of rawTasks) {
    if (t.person) taskCountByPerson[t.person] = (taskCountByPerson[t.person] || 0) + 1;
  }
  const implicitPeople = personOrder
    .filter(n => personSource[n] === 'task')
    .map(n => ({
      name: n,
      role: personMap[n].role || '',
      taskCount: taskCountByPerson[n] || 0,
    }));
  const taskCountByProj = {};
  for (const t of rawTasks) taskCountByProj[t.proj] = (taskCountByProj[t.proj] || 0) + 1;
  const autoCreatedProjs = projs
    .filter(p => p.autoCreated)
    .map(p => ({ id: p.id, taskCount: taskCountByProj[p.id] || 0 }));
  // Strip the `autoCreated` flag from the returned projs — internal-only.
  // Same for `base` and `start`/`end` Date objects — keep `start`/`end` on
  // drafts as Dates (they may be used by Phase 3 UI), but remove `autoCreated`.
  const cleanProjs = projs.map(({ autoCreated, ...rest }) => rest);

  const parsed = { rawTasks, projs: cleanProjs, people, tdepMap, base:baseYear, todayDay, periods };
  const pending = {
    implicitPeople,
    autoCreatedProjs,
    draftWithTasksWarnings,
    unassignedTaskCount: unassignedTaskIds.length,
  };
  // Backward-compat: a caller that destructures the old shape directly still
  // works because the parsed fields are spread at the top of the returned object.
  // New callers should read `result.parsed` and `result.pending` explicitly.
  return { ...parsed, parsed, pending };
}