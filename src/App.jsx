// ── App ──────────────────────────────────────────────────────────────────────
// Top-level: handles xlsx import, persistence wiring, and the empty state.
// Once data is loaded, renders <ScheduleApp /> which owns the dashboard.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ScheduleCtx } from './context.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import {
  loadFromStorage, saveToStorage,
  loadSchedEdits, saveSchedEdits,
  loadCompleted, saveCompleted,
  loadCompletedProjs, saveCompletedProjs,
  loadStatusOverrides, saveStatusOverrides,
  loadDepOverrides, saveDepOverrides,
  loadHistory, saveHistory,
  clearAllStorage,
  LS_KEY, LS_EDITS_KEY,
} from './storage/persist.jsx';
import { parseXlsx } from './engine/xlsx.jsx';
import { buildSched } from './engine/schedule.jsx';
import { applyEditsToData, mutateSchedData, buildHistoryEntry, buildUploadHistoryEntry, buildRevertHistoryEntry } from './engine/edits.jsx';
import { addW, parseDate, fmtDDMMYYYY } from './engine/dates.jsx';
import { NAV, SURFACE, CARD, BORDER, ORANGE, TEXT, MUTED, TASK_BLUE, STATUS_TOKENS } from './theme.jsx';

import { EditModal } from './components/EditModal.jsx';
import { ConflictResolutionPopover } from './components/ConflictResolutionPopover.jsx';
import { ProjectGanttTab } from './components/tabs/ProjectGanttTab.jsx';
import { DashboardTab } from './components/tabs/DashboardTab.jsx';
import { ProjectViewTab } from './components/tabs/ProjectViewTab.jsx';
import { ConflictsTab } from './components/tabs/ConflictsTab.jsx';
import { PeopleTab } from './components/tabs/PeopleTab.jsx';
import { WorkflowsTab } from './components/tabs/WorkflowsTab.jsx';
import { AddTasksModal } from './components/modals/AddTasksModal.jsx';
import { NewProjectModal } from './components/modals/NewProjectModal.jsx';
import { ImportConfirmModal } from './components/modals/ImportConfirmModal.jsx';

const FONT_STACK = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

// ── App: imports/empty state + ScheduleApp orchestration ────────────────────
export default function App() {
  const [schedData,   setSchedData]   = useState(null);
  const [baseData,    setBaseData]    = useState(null);
  const [importing,   setImporting]   = useState(false);
  const [importError, setImportError] = useState(null);
  const [showNewProj, setShowNewProj] = useState(false);
  // Pending import awaiting user confirmation. Shape:
  //   { parsed: <full schedData>, pending: <implicit-people/auto-projs/etc.>, buf: <ArrayBuffer> }
  // Null when no import is in-flight (either nothing imported, or confirmed).
  const [pendingImport, setPendingImport] = useState(null);
  const fileInputRef = useRef(null);

  // Restore from localStorage on mount.
  // This path does NOT go through the confirmation modal — the user
  // already confirmed at original import time. We just rehydrate.
  useEffect(() => {
    const buf = loadFromStorage();
    if (!buf) return;
    parseXlsx(buf)
      .then(result => {
        const data = result.parsed || result;
        setBaseData(data);
        const edits = loadSchedEdits();
        setSchedData(edits ? applyEditsToData(data, edits) : data);
      })
      .catch(() => {
        // Corrupted buffer — clear it so we don't loop forever
        try { localStorage.removeItem(LS_KEY); } catch {}
      });
  }, []);

  const handleFileChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const buf = await file.arrayBuffer();
      const result = await parseXlsx(buf);
      // The parser now returns the data PLUS a `pending` object describing
      // items that need user attention (implicit people, auto-created
      // projects, etc.). If anything is pending, open the confirmation
      // modal and defer commit. Otherwise commit immediately.
      const pending = result.pending || {};
      const hasPending =
        (pending.implicitPeople && pending.implicitPeople.length > 0) ||
        (pending.autoCreatedProjs && pending.autoCreatedProjs.length > 0) ||
        (pending.draftWithTasksWarnings && pending.draftWithTasksWarnings.length > 0) ||
        (pending.unassignedTaskCount > 0);
      if (hasPending) {
        // Stash everything; commit happens in confirmImport.
        setPendingImport({ parsed: result.parsed || result, pending, buf });
      } else {
        // Clean import — go straight in.
        saveToStorage(buf);
        try { localStorage.removeItem(LS_EDITS_KEY); } catch {}
        const data = result.parsed || result;
        setBaseData(data);
        setSchedData(data);
      }
    } catch (err) {
      setImportError(err.message || 'Failed to parse file.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  // Confirm a pending import. Applies the user's implicit-people selection,
  // then commits the data to storage + state.
  const confirmImport = ({ acceptedImplicitPeople }) => {
    if (!pendingImport) return;
    const { parsed, buf } = pendingImport;
    // acceptedImplicitPeople is a Set of names the user kept checked. Any
    // implicit person not in the set is REMOVED from people[], AND any task
    // assigned to them has its person field cleared (becomes unassigned).
    const implicitNames = new Set((pendingImport.pending.implicitPeople || []).map(p => p.name));
    const accepted = acceptedImplicitPeople || new Set();
    // Build the rejected set explicitly so we don't accidentally remove
    // people who came from the People sheet.
    const rejected = new Set();
    for (const name of implicitNames) {
      if (!accepted.has(name)) rejected.add(name);
    }

    let finalData = parsed;
    if (rejected.size > 0) {
      finalData = {
        ...parsed,
        people: parsed.people.filter(p => !rejected.has(p.name)),
        rawTasks: parsed.rawTasks.map(t => rejected.has(t.person) ? { ...t, person: '' } : t),
      };
    }

    saveToStorage(buf);
    try { localStorage.removeItem(LS_EDITS_KEY); } catch {}
    setBaseData(finalData);
    setSchedData(finalData);
    setPendingImport(null);
  };

  // Discard a pending import. Nothing was written; just clear the modal.
  const cancelImport = () => setPendingImport(null);

  const handleAddProject = ({ proj, rawTasks: newTasks, people: newPeople, isDraft }) => {
    setSchedData(prev => {
      if (!prev) return prev;
      const currentBaseData = { rawTasks: prev.rawTasks, projs: prev.projs, people: prev.people, tdepMap: prev.tdepMap, base: prev.base, todayDay: prev.todayDay, periods: prev.periods };
      let currentEdits = loadSchedEdits();
      // For drafts: addProject mutation (no tasks).
      // For full projects: addProject FIRST (so the project exists with status='active'),
      //   THEN addTasks (so the tasks attach to a known project).
      let updated = mutateSchedData(currentBaseData, currentEdits, { type:'addProject', project: proj });
      // appendHistory deferred — outer ScheduleApp owns the history state.
      // (We can't call appendHistory here; this handler lives in the outer App
      // component which doesn't have access. The mutation still applies and
      // persists via saveSchedEdits, but no history entry is logged for
      // project creation from the modal. This is a known small gap — drafts
      // will appear in the data on next render but not in the History log.)
      if (!isDraft && newTasks && newTasks.length > 0) {
        currentEdits = loadSchedEdits();
        const updatedBaseForTasks = { ...currentBaseData, rawTasks: updated.rawTasks, projs: updated.projs, people: updated.people, tdepMap: updated.tdepMap };
        updated = mutateSchedData(updatedBaseForTasks, currentEdits, { type:'addTasks', tasks:newTasks, people:newPeople || [] });
      }
      return updated;
    });
  };

  const triggerImport = () => fileInputRef.current?.click();

  const clearData = () => {
    clearAllStorage();
    setSchedData(null);
    setBaseData(null);
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!schedData) {
    return (
      <ErrorBoundary>
        {pendingImport && (
          <ImportConfirmModal
            pending={pendingImport.pending}
            onConfirm={confirmImport}
            onCancel={cancelImport} />
        )}
        <EmptyState
          fileInputRef={fileInputRef}
          showNewProj={showNewProj}
          setShowNewProj={setShowNewProj}
          handleFileChange={handleFileChange}
          triggerImport={triggerImport}
          importing={importing}
          importError={importError}
        />
      </ErrorBoundary>
    );
  }

  // ── Loaded ────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <ScheduleCtx.Provider value={schedData}>
        {pendingImport && (
          <ImportConfirmModal
            pending={pendingImport.pending}
            onConfirm={confirmImport}
            onCancel={cancelImport} />
        )}
        {showNewProj && (
          <NewProjectModal
            existingProjs={schedData.projs}
            existingPeople={schedData.people}
            onAdd={handleAddProject}
            onClose={() => setShowNewProj(false)}
          />
        )}
        <ScheduleApp
          schedData={schedData}
          baseData={baseData}
          onImport={triggerImport}
          onClear={clearData}
          onNewProject={() => setShowNewProj(true)}
          onMutate={setSchedData}
          importing={importing}
          importError={importError}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          style={{ display:'none' }}
        />
      </ScheduleCtx.Provider>
    </ErrorBoundary>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
// Pre-import shell. Renders the same header + tab bar as the loaded app, with
// the Dashboard tab fully populated in "empty mode" (zero values + a prominent
// Import banner). Other tabs in the empty state show a small stub explaining
// they'll populate once data is imported. This keeps the app's structure
// consistent whether or not data is loaded.
function EmptyState({ fileInputRef, showNewProj, setShowNewProj, handleFileChange, triggerImport, importing, importError }) {
  const [tab, setTab] = useState('dashboard');
  const TAB_ITEMS = [
    { id:'dashboard', l:'Dashboard'   },
    { id:'gantt',     l:'Gantt Chart'  },
    { id:'project',   l:'Project View' },
    { id:'workflows', l:'Workflows'    },
    { id:'conflicts', l:'Conflicts'    },
    { id:'people',    l:'Resource'     },
  ];

  // Stub for non-dashboard tabs in empty mode — simple, informative.
  const TabStub = ({ name }) => (
    <div style={{ padding:'80px 28px', textAlign:'center' }}>
      <div style={{ fontSize:'15px', fontWeight:'600', color:TEXT, marginBottom:'10px' }}>{name} is empty</div>
      <div style={{ fontSize:'12px', color:MUTED, marginBottom:'18px', maxWidth:'420px', margin:'0 auto 18px' }}>
        Import an xlsx with projects and tasks to populate this view. Or jump back to the Dashboard for the full overview.
      </div>
      <button onClick={triggerImport} disabled={importing}
        style={{ padding:'8px 18px', borderRadius:'8px', border:'none', background:ORANGE, color:'white', fontSize:'12px', fontWeight:'700', cursor:'pointer', marginRight:'8px' }}>
        {importing ? 'Importing...' : '↥ Import xlsx'}
      </button>
      <button onClick={() => setTab('dashboard')}
        style={{ padding:'8px 18px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', fontWeight:'600', cursor:'pointer' }}>
        Back to Dashboard
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily:FONT_STACK, background:SURFACE, minHeight:'100vh', color:TEXT }}>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display:'none' }} />

      {showNewProj && (
        <NewProjectModal existingProjs={[]} existingPeople={[]} onAdd={()=>{}} onClose={() => setShowNewProj(false)} />
      )}

      {/* Nav — same chrome as the loaded path, with all tabs clickable */}
      <div style={{ background:NAV, padding:'0 28px', height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ display:'flex', alignItems:'center' }}>
          <span style={{ color:ORANGE, fontWeight:'800', fontSize:'18px', letterSpacing:'-0.5px', marginRight:'32px' }}>Interscale</span>
          {TAB_ITEMS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'0 18px', height:'52px', border:'none', background:'none', cursor:'pointer', fontSize:'13px', fontWeight:'500', color:tab===t.id?ORANGE:MUTED, borderBottom:tab===t.id?`2px solid ${ORANGE}`:'2px solid transparent', whiteSpace:'nowrap' }}>
              {t.l}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', background:CARD, border:`1px solid ${BORDER}`, borderRadius:'8px', padding:'6px 12px', minWidth:'200px' }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="5" stroke={MUTED} strokeWidth="1.5"/><path d="M10.5 10.5 14 14" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span style={{ fontSize:'12px', color:MUTED }}>Search tasks, people...</span>
          </div>
          <button style={{ padding:'6px 14px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer' }}>AI Chat and Notifications?</button>
        </div>
      </div>

      {/* Tab content. Dashboard renders in empty mode; other tabs show a stub. */}
      {tab === 'dashboard' && (
        <DashboardTab
          tasks={[]}
          kpi={{ fragile:0, conflicts:0, hasProjRisk:false, hasCrossRisk:false }}
          projRisk={[]}
          crossRisk={[]}
          onSchedulePct={0}
          onGoToTab={setTab}
          onImport={triggerImport}
          isEmpty={true}
        />
      )}
      {tab !== 'dashboard' && <TabStub name={TAB_ITEMS.find(t => t.id === tab)?.l || 'Tab'} />}

      {importError && (
        <div style={{ margin:'0 28px 28px', padding:'12px 16px', borderRadius:'8px', background:STATUS_TOKENS.DANGER_SUBTLE, border:`1px solid ${STATUS_TOKENS.DANGER_BORDER}`, color:STATUS_TOKENS.DANGER_TEXT, fontSize:'12px' }}>
          <strong>Import failed:</strong> {importError}
        </div>
      )}
    </div>
  );
}

// ── ScheduleApp ──────────────────────────────────────────────────────────────
// Main dashboard once data is loaded. Owns simulated delays, completion state,
// status overrides, and routes between the five tabs.
function ScheduleApp({ schedData, baseData, onImport, onClear, onNewProject, onMutate, importing, importError }) {
  const { rawTasks, projs, people, tdepMap, base, todayDay, periods } = schedData;

  const [simDelays,       setSimDelays]       = useState({});
  const [cascadeMode,     setCascadeMode]     = useState('full');
  const [completedIds,    setCompletedIds]    = useState(() => loadCompleted());
  const [statusOverrides, setStatusOverrides] = useState(() => loadStatusOverrides());

  // ── Completed projects ────────────────────────────────────────────────────
  // Projects the user has formally "concluded" (all tasks done + clicked
  // Complete Project). Stored as a Set of project IDs. Filtered out of every
  // active surface (Gantt, conflicts, KPIs) — only ProjectView's Completed
  // sub-tab shows them.
  //
  // The `status` field on each project object is now the source of truth for
  // completion (and draft state). A derived `completedProjIds` set is computed
  // for filtering purposes — but no separate state slot exists. The legacy
  // `completedProjs` localStorage Set is migrated on first load (see effect
  // below) and the storage key cleared.

  // ── History log ────────────────────────────────────────────────────────────
  // Append-only commit log (think: single-branch git). Each entry describes a
  // committed change (shift, reassign, add, delete, upload, revert).
  // Persisted to localStorage; seeded with an 'upload' entry on first load.
  const [history, setHistory] = useState(() => loadHistory());

  // Append + persist in one shot. Used by every mutation site below.
  const appendHistory = useCallback(entry => {
    if (!entry) return;
    setHistory(prev => {
      const next = [...prev, entry];
      saveHistory(next);
      return next;
    });
  }, []);

  // ── Project completion (now status-based) ──────────────────────────────────
  // Both callbacks go through mutateSchedData with the setProjectStatus
  // mutation type — same path used for any project status change, fully
  // history-aware. The old completedProjs Set is gone.
  const completeProject = useCallback((projId, projName) => {
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const mutation = { type:'setProjectStatus', projId, status:'completed' };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory({
      id: `h-${Date.now()}-cp`,
      timestamp: Date.now(),
      kind: 'completeProject',
      summary: `Concluded project ${projId}${projName ? ' (' + projName + ')' : ''}`,
      details: [{ projId, name: projName || projId }],
      refersTo: null,
    });
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  const uncompleteProject = useCallback((projId, projName) => {
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const mutation = { type:'setProjectStatus', projId, status:'active' };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory({
      id: `h-${Date.now()}-up`,
      timestamp: Date.now(),
      kind: 'uncompleteProject',
      summary: `Reopened project ${projId}${projName ? ' (' + projName + ')' : ''}`,
      details: [{ projId, name: projName || projId }],
      refersTo: null,
    });
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // ── Legacy migration: completedProjs Set → status field ────────────────────
  // Runs once on mount. If the old localStorage Set has any IDs, set each
  // project's status to 'completed' via the edits layer, then clear the key.
  // After this runs, the Set is gone forever and status is the only signal.
  useEffect(() => {
    const legacy = loadCompletedProjs();
    if (!legacy || legacy.size === 0) return;
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    let currentEdits = loadSchedEdits();
    let updated = null;
    for (const projId of legacy) {
      // Skip if already completed on the project itself
      const proj = projs.find(p => p.id === projId);
      if (!proj || proj.status === 'completed') continue;
      updated = mutateSchedData(currentBaseData, currentEdits, { type:'setProjectStatus', projId, status:'completed' });
      currentEdits = loadSchedEdits();
    }
    if (updated) onMutate(updated);
    // Clear the legacy key — migration done.
    try { saveCompletedProjs(new Set()); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the history log with an 'upload' entry the first time we ever load
  // data (i.e. log is empty but schedData exists). Runs once per fresh install.
  useEffect(() => {
    if (history.length === 0 && schedData) {
      const seed = buildUploadHistoryEntry(schedData, 'Initial upload');
      setHistory([seed]);
      saveHistory([seed]);
    }
    // We intentionally only check this once on mount — subsequent xlsx
    // uploads are handled by handleFileChange in the outer component, which
    // will need its own logging path if we add it later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayMs = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }, []);

  // A task counts as "completed" for scheduling/conflict purposes if EITHER:
  //  - it's in the completedIds set (the ✓ toggle), OR
  //  - it has a status override explicitly set to 'Completed' (via EditModal).
  // buildSched only takes one Set, so we merge both notions here. Without this,
  // marking a task Completed in the EditModal wouldn't clear its conflicts.
  const effectiveCompletedIds = useMemo(() => {
    const s = new Set(completedIds);
    for (const [taskId, status] of statusOverrides.entries()) {
      if (status === 'Completed') s.add(taskId);
    }
    return s;
  }, [completedIds, statusOverrides]);

  // ── Active vs all (filter out completed projects) ─────────────────────────
  // `allTasks` and `allProjs` are the raw computed lists. `tasks` and `projs`
  // (the names used throughout the rest of this component) are filtered to
  // EXCLUDE any project the user has formally concluded OR that's still in
  // draft state. That way Gantt, conflicts, KPIs etc. don't need to know
  // about lifecycle — they just see the active set. ProjectView's Drafts
  // and Completed sub-tabs read `allTasks`/`allProjs` through dedicated props.
  const allTasks = useMemo(
    () => buildSched(rawTasks, tdepMap, base, simDelays, cascadeMode, effectiveCompletedIds, todayMs),
    [rawTasks, tdepMap, base, simDelays, cascadeMode, effectiveCompletedIds, todayMs]
  );
  const allProjs = projs;  // alias — destructured from schedData earlier

  // Derive lifecycle sets from the `status` field on each project — single
  // source of truth, no separate Set. A project without an explicit status
  // counts as 'active' (the engine's pre-Phase-1 default).
  const completedProjIds = useMemo(
    () => new Set(allProjs.filter(p => p.status === 'completed').map(p => p.id)),
    [allProjs]
  );
  const draftProjIds = useMemo(
    () => new Set(allProjs.filter(p => p.status === 'draft').map(p => p.id)),
    [allProjs]
  );
  // Active set: hide tasks and projects belonging to completed OR draft projects.
  // Drafts have no tasks anyway, but the projection rule is the same.
  const tasks = useMemo(
    () => allTasks.filter(t => !completedProjIds.has(t.projId) && !draftProjIds.has(t.projId)),
    [allTasks, completedProjIds, draftProjIds]
  );
  const projsActive = useMemo(
    () => allProjs.filter(p => !completedProjIds.has(p.id) && !draftProjIds.has(p.id)),
    [allProjs, completedProjIds, draftProjIds]
  );
  // For backwards-compat with code below that still destructured `projs` from
  // schedData, alias the active list to a local name. Anything that reads the
  // top-level `projs` variable from this point on gets the filtered set.
  const activeProjs = projsActive;

  const toggleComplete = useCallback(taskId => {
    setCompletedIds(prev => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      saveCompleted(next);
      return next;
    });
    // Clear any status override on toggle — let the engine decide
    setStatusOverrides(prev => {
      const next = new Map(prev);
      next.delete(taskId);
      saveStatusOverrides(next);
      return next;
    });
  }, []);

  const setStatusOverride = useCallback((taskId, status) => {
    setStatusOverrides(prev => {
      const next = new Map(prev);
      if (status === null) next.delete(taskId);
      else next.set(taskId, status);
      saveStatusOverrides(next);
      return next;
    });
  }, []);

  // Save a full typed dep list for a task (replaces xlsx deps for that task)
  const saveTaskDeps = useCallback((taskId, typedDeps) => {
    const map = loadDepOverrides();
    if (typedDeps.length === 0) map.delete(taskId);
    else map.set(taskId, typedDeps);
    saveDepOverrides(map);
    // Rebuild from baseData so applyEditsToData doesn't double-merge
    if (!baseData) return;
    const currentEdits = loadSchedEdits();
    onMutate(applyEditsToData(baseData, currentEdits));
  }, [baseData, onMutate]);

  const [tab,        setTab]        = useState('dashboard');
  const [sel,        setSel]        = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [showResolver, setShowResolver] = useState(false);
  const [addTasksProj, setAddTasksProj] = useState(null);

  const handleEdit  = useCallback(target => setEditTarget(target), []);
  const handleApply = useCallback((nd, mode) => { setSimDelays(nd); if (mode) setCascadeMode(mode); }, []);

  // ── Timeline-shift preview/commit ───────────────────────────────────────────
  // A timeline shift is no longer committed immediately. Instead it becomes a
  // `pendingShift` — the Gantt renders a preview (new bars + greyed ghosts of
  // the old positions) and a floating Confirm/Revert bar lets the user decide.
  //   pendingShift shape: { taskIds:[...], days:Number, mode:String } | null
  const [pendingShift, setPendingShift] = useState(null);

  // Called by EditModal's "Apply Shift" — stages the shift instead of committing.
  const stageShift = useCallback((taskIds, days, mode) => {
    if (!days) return;
    setPendingShift({ taskIds: [...taskIds], days, mode });
  }, []);

  // Commit logic — bakes the staged shift into rawTasks via the edits layer.
  const commitShift = useCallback(() => {
    if (!pendingShift) return;
    const { taskIds, days, mode } = pendingShift;
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();

    // Expand to the full set of affected ids — direct + cascade.
    let allIds = [...taskIds];
    if (mode !== 'none') {
      const tempDelays = {};
      taskIds.forEach(id => { tempDelays[id] = Math.abs(days); });
      const preview = buildSched(rawTasks, tdepMap, base, tempDelays, mode);
      const orig    = buildSched(rawTasks, tdepMap, base, {}, mode);
      const origMap = Object.fromEntries(orig.map(t => [t.id, t]));
      preview.forEach(t => {
        if (origMap[t.id] && t.sd !== origMap[t.id].sd) allIds.push(t.id);
      });
      allIds = [...new Set(allIds)];
    }

    const mutation = { type:'shiftTimeline', taskIds: allIds, days };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory(buildHistoryEntry(mutation, currentBaseData, { affectedTaskCount: allIds.length }));
    setSimDelays(prev => {
      const nd = { ...prev };
      allIds.forEach(id => delete nd[id]);
      return nd;
    });
    setPendingShift(null);  // preview consumed
  }, [pendingShift, rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // Discard a staged shift without applying it.
  const cancelShift = useCallback(() => setPendingShift(null), []);

  // ── Reassignment preview/commit ─────────────────────────────────────────────
  // Same pattern as pendingShift but for person reassignments. Shape:
  //   pendingReassigns: { [taskId]: { from:String, to:String } }
  // Multiple reassignments can be staged at once (e.g. resolving several
  // conflicts in one session before committing).
  const [pendingReassigns, setPendingReassigns] = useState({});

  // Stage a single reassignment. Called by ConflictsTab when the user picks
  // a candidate from the dropdown.
  const stageReassign = useCallback((taskId, toPerson, fromPerson) => {
    if (!taskId || !toPerson || toPerson === fromPerson) return;
    setPendingReassigns(prev => ({ ...prev, [taskId]: { from: fromPerson, to: toPerson } }));
  }, []);

  // Cancel one staged reassignment (per-change revert).
  const cancelReassign = useCallback(taskId => {
    setPendingReassigns(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  // Cancel ALL staged reassignments (used by the "Revert all" path).
  const cancelAllReassigns = useCallback(() => setPendingReassigns({}), []);

  // Commit all staged reassignments through the edits layer in one mutation.
  const commitReassigns = useCallback(() => {
    const entries = Object.entries(pendingReassigns);
    if (!entries.length) return;
    const assignments = entries.map(([taskId, { to }]) => ({ taskId, toPerson: to }));
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const mutation = { type:'reassignTasks', assignments };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory(buildHistoryEntry(mutation, currentBaseData));
    setPendingReassigns({});
  }, [pendingReassigns, rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // ── Unified preview task set ───────────────────────────────────────────────
  // Applies BOTH staged shifts and staged reassignments to rawTasks, then runs
  // buildSched on the synthesized version. Returns null if nothing is staged.
  const hasShift     = !!pendingShift;
  const hasReassigns = Object.keys(pendingReassigns).length > 0;
  const isSimulating = hasShift || hasReassigns;

  const previewTasks = useMemo(() => {
    if (!isSimulating) return null;
    let rt = rawTasks;
    // Apply staged reassignments first — rewrite the `person` field.
    if (hasReassigns) {
      rt = rt.map(t => pendingReassigns[t.id]
        ? { ...t, person: pendingReassigns[t.id].to }
        : t);
    }
    // Then apply the staged shift (if any).
    let mode = cascadeMode;
    if (hasShift) {
      const { taskIds, days, mode: m } = pendingShift;
      mode = m || cascadeMode;
      rt = rt.map(t => {
        if (!taskIds.includes(t.id)) return t;
        const sD = parseDate(t.start), eD = parseDate(t.end);
        if (!sD || !eD) return t;
        return { ...t, start: fmtDDMMYYYY(addW(sD, days)), end: fmtDDMMYYYY(addW(eD, days)) };
      });
    }
    return buildSched(rt, tdepMap, base, {}, mode, effectiveCompletedIds, todayMs);
  }, [isSimulating, hasShift, hasReassigns, pendingShift, pendingReassigns, rawTasks, tdepMap, base, cascadeMode, effectiveCompletedIds, todayMs]);

  // Commit BOTH staged change types in one go. Used by the unified "Confirm all".
  const commitAllPending = useCallback(() => {
    // Order matters for the edits layer: commit reassigns first, then shift —
    // so a shift sees the post-reassignment ownership when computing cascade.
    if (hasReassigns) commitReassigns();
    if (hasShift)     commitShift();
  }, [hasReassigns, hasShift, commitReassigns, commitShift]);

  // (Bug fix: original re-declared `baseData` inside the callback, shadowing
  //  the prop. Renamed to `currentBaseData` for clarity.)
  const handleDelete = useCallback(mutation => {
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory(buildHistoryEntry(mutation, currentBaseData));
    if (mutation.type === 'deleteTask') {
      setSimDelays(prev => { const nd = {...prev}; delete nd[mutation.taskId]; return nd; });
    }
    if (mutation.type === 'deleteProject') {
      setSimDelays(prev => {
        const nd = {...prev};
        rawTasks.filter(t => t.proj === mutation.projId).forEach(t => delete nd[t.id]);
        return nd;
      });
    }
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  const handleAddTasks = useCallback(({ tasks: newTasks, people: newPeople }) => {
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const mutation = { type:'addTasks', tasks:newTasks, people:newPeople };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory(buildHistoryEntry(mutation, currentBaseData));
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // ── Assign from Resource tab: existing unassigned → selected person ───────
  // Routes through the standard reassignTasks mutation. The unassigned tasks
  // have person:'', the mutation rewrites that to the target person.
  const handleAssignExisting = useCallback(({ taskIds, toPerson }) => {
    if (!taskIds || taskIds.length === 0 || !toPerson) return;
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const assignments = taskIds.map(taskId => ({ taskId, toPerson }));
    const mutation = { type:'reassignTasks', assignments };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory(buildHistoryEntry(mutation, currentBaseData));
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // ── Create new task assigned to selected person ───────────────────────────
  // Builds a single task row in the shape addTasks expects, then routes
  // through the standard addTasks mutation. The role comes from the person
  // (set by the modal already in task.role).
  const handleCreateAndAssign = useCallback(({ task }) => {
    if (!task || !task.projId || !task.name) return;
    // Build a unique task id: projId-<short-seq>. Pick a seq letter not yet
    // used in this project (A-Z then A1, A2…). Simple but robust enough.
    const used = new Set(rawTasks.filter(t => t.proj === task.projId).map(t => {
      const m = /^.+-(.+)$/.exec(t.id);
      return m ? m[1] : null;
    }).filter(Boolean));
    let seq = '';
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(65 + i);
      if (!used.has(c)) { seq = c; break; }
    }
    if (!seq) {
      // Fall back to numeric extension
      let n = 1;
      while (used.has(`A${n}`)) n++;
      seq = `A${n}`;
    }
    const newTask = {
      id:     `${task.projId}-${seq}`,
      proj:   task.projId,
      name:   task.name,
      person: task.person,
      role:   task.role || '',
      dur:    1,
      start:  task.start,
      end:    task.end,
      deps:   [],
    };
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const mutation = { type:'addTasks', tasks:[newTask], people:[] };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory(buildHistoryEntry(mutation, currentBaseData));
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // ── Add a bench person manually (Resource tab → + Add Person) ─────────────
  // Routes through the addPerson mutation. The person enters the resource pool
  // with no tasks attached — they're available for assignment immediately.
  const handleAddPerson = useCallback(({ person }) => {
    if (!person || !person.name) return;
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const mutation = { type:'addPerson', person };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory(buildHistoryEntry(mutation, currentBaseData));
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // ── Import people from xlsx (Resource tab → Import People) ────────────────
  // Loops through, calling addPerson for each. The mutation itself handles
  // duplicate skipping (case-insensitive), so even if our pre-filter missed
  // an edge case, the engine won't end up with two of anyone.
  const handleImportPeople = useCallback(({ people: newPeople }) => {
    if (!Array.isArray(newPeople) || newPeople.length === 0) return;
    // Chain the mutations: each one builds on the result of the previous so
    // an import of N people produces ONE updated schedData, not N intermediate
    // ones.
    let currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    let currentEdits = loadSchedEdits();
    let updated = null;
    let added = 0;
    for (const person of newPeople) {
      const mutation = { type:'addPerson', person };
      const beforeCount = (updated?.people || currentBaseData.people).length;
      updated = mutateSchedData(currentBaseData, currentEdits, mutation);
      const afterCount = updated.people.length;
      if (afterCount > beforeCount) added++;
      // For the next iteration, the "current" data is what we just produced.
      currentBaseData = updated;
      currentEdits = loadSchedEdits();
    }
    if (updated) onMutate(updated);
    if (added > 0) {
      appendHistory({
        id: `h-${Date.now()}-impp`,
        timestamp: Date.now(),
        kind: 'importPeople',
        summary: `Imported ${added} ${added===1?'person':'people'} from xlsx`,
        details: newPeople.slice(0, 20).map(p => ({ name: p.name, role: p.role })),
        refersTo: null,
      });
    }
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // ── Import tasks for the selected person (Resource tab → Import Tasks) ────
  // Tasks come in already shaped by the modal: blanks auto-assigned to the
  // selected person, explicit names honoured. Routes through the existing
  // addTasks mutation which already auto-creates referenced-but-missing
  // projects. Person objects are NOT added here — names that match existing
  // people get used; new names appear only on the tasks (until/unless the
  // user explicitly adds them to the pool).
  const handleImportTasksForPerson = useCallback(({ tasks: newTasks }) => {
    if (!Array.isArray(newTasks) || newTasks.length === 0) return;
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    // The addTasks mutation accepts a `people` array for any new people
    // discovered in task assignments. Build it now from any names not already
    // in the pool.
    const existingNames = new Set(people.map(p => p.name.toLowerCase()));
    const newPeopleSeen = new Map();  // name → minimal person object
    for (const t of newTasks) {
      const n = (t.person || '').trim();
      if (n && !existingNames.has(n.toLowerCase()) && !newPeopleSeen.has(n)) {
        const init = n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        newPeopleSeen.set(n, {
          name: n, role: t.role || '', init,
          color: TASK_BLUE, rate: '$42/hr',
        });
      }
    }
    const mutation = {
      type: 'addTasks',
      tasks: newTasks,
      people: [...newPeopleSeen.values()],
    };
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
    appendHistory(buildHistoryEntry(mutation, currentBaseData));
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate, appendHistory]);

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  // A task is "effectively completed" if the engine marks it or an override says so.
  const isEffectivelyCompleted = t => t.isCompleted || statusOverrides.get(t.id) === 'Completed';

  // Index tasks by id for fast cross-lookup (conflict partners, dep upstreams).
  const taskById = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, t])), [tasks]);

  // ── Conflict partition: intra-project vs cross-project ────────────────────
  // The engine flags a task as `isC` for ANY same-person overlap. To split
  // these into "Project Risk" vs "Cross Project Risk" we look at each task's
  // conflict-partners (t.cw — the IDs it overlaps with) and see whether any
  // partner is in the SAME project (→ intra) or a DIFFERENT one (→ cross).
  //
  // Clean split: a project shows up in EXACTLY ONE bucket per conflict.
  //   - Has an intra-project conflict?  → Project Risk
  //   - Has a cross-project conflict?    → Cross Project Risk
  // A project can be in BOTH buckets if it has both kinds of conflict, but
  // a single conflict is never double-counted.
  const intraConflictProjs = new Set();
  const crossConflictProjs = new Set();
  for (const t of tasks) {
    if (!t.isC || isEffectivelyCompleted(t)) continue;
    for (const partnerId of (t.cw || [])) {
      const partner = taskById[partnerId];
      if (!partner || isEffectivelyCompleted(partner)) continue;
      if (partner.projId === t.projId) intraConflictProjs.add(t.projId);
      else                              crossConflictProjs.add(t.projId);
    }
  }

  // ── Risky cross-project dependencies ──────────────────────────────────────
  // A project also lights up Cross Project Risk if it has a task whose dep
  // points to a task in a DIFFERENT project AND that upstream is in real
  // trouble (conflict or overdue — not just "moved", per spec).
  for (const t of tasks) {
    if (isEffectivelyCompleted(t)) continue;
    for (const depRaw of (tdepMap[t.id] || [])) {
      const depId = typeof depRaw === 'string' ? depRaw : depRaw.id;
      const upstream = taskById[depId];
      if (!upstream) continue;
      if (upstream.projId === t.projId) continue;       // same-project dep — not a cross-project signal
      if (isEffectivelyCompleted(upstream)) continue;   // upstream is done — no risk to flow
      if (upstream.isC || upstream.isOverdue) {
        crossConflictProjs.add(t.projId);
      }
    }
  }

  // ── On-schedule projects (a project is on schedule if it has NO unresolved risk) ──
  const delayedTaskIds = new Set(Object.keys(simDelays).filter(id => simDelays[id] > 0));
  const onSchedule = activeProjs.filter(p => {
    if (intraConflictProjs.has(p.id) || crossConflictProjs.has(p.id)) return false;
    const pt = tasks.filter(t => t.projId === p.id && !isEffectivelyCompleted(t));
    return !pt.some(t => t.isOverdue || delayedTaskIds.has(t.id));
  }).length;
  const onSchedulePct = activeProjs.length ? Math.round((onSchedule / activeProjs.length) * 100) : 0;

  const projRisk  = activeProjs.filter(p => intraConflictProjs.has(p.id));
  const crossRisk = activeProjs.filter(p => crossConflictProjs.has(p.id));

  // KPI object — must come AFTER projRisk/crossRisk are declared (it reads
  // their lengths) and before the JSX that consumes it.
  const kpi = {
    total:         tasks.length,
    conflicts:     tasks.filter(t => t.isC).length,  // total conflict count (used by resolver)
    fragile:       tasks.filter(t => t.isF).length,
    // Tile-gating flags — true when the respective KPI is non-zero.
    // hasProjRisk lights the "Project Risk" tile (intra-project conflicts).
    // hasCrossRisk lights the "Cross Project Risk" tile (cross-project
    //   conflicts OR a risky cross-project dependency).
    hasProjRisk:   projRisk.length > 0,
    hasCrossRisk:  crossRisk.length > 0,
  };

  const TAB_ITEMS = [
    { id:'dashboard', l:'Dashboard'   },
    { id:'gantt',     l:'Gantt Chart'  },
    { id:'project',   l:'Project View' },
    { id:'workflows', l:'Workflows'    },
    { id:'conflicts', l:'Conflicts'    },
    { id:'people',    l:'Resource'     },
  ];

  return (
    <div style={{ fontFamily:FONT_STACK, background:SURFACE, minHeight:'100vh', color:TEXT }}>

      {editTarget && (
        <EditModal
          target={editTarget}
          tasks={tasks}
          simDelays={simDelays}
          onApply={handleApply}
          onShift={stageShift}
          onClose={() => setEditTarget(null)}
          onDelete={handleDelete}
          statusOverrides={statusOverrides}
          onSetStatus={setStatusOverride}
          todayMs={todayMs}
          onSaveDeps={saveTaskDeps}
        />
      )}

      {addTasksProj && (
        <AddTasksModal
          proj={addTasksProj}
          existingTasks={rawTasks.filter(t => t.proj === addTasksProj.id)}
          existingPeople={people}
          onAdd={handleAddTasks}
          onClose={() => setAddTasksProj(null)}
        />
      )}

      {/* Nav */}
      <div style={{ background:NAV, padding:'0 28px', height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ display:'flex', alignItems:'center' }}>
          <span style={{ color:ORANGE, fontWeight:'800', fontSize:'18px', letterSpacing:'-0.5px', marginRight:'32px' }}>Interscale</span>
          {TAB_ITEMS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id==='people'&&!sel) setSel(people[0]?.name||null); }}
              style={{ padding:'0 18px', height:'52px', border:'none', background:'none', cursor:'pointer', fontSize:'13px', fontWeight:'500', color:tab===t.id?ORANGE:MUTED, borderBottom:tab===t.id?`2px solid ${ORANGE}`:'2px solid transparent', whiteSpace:'nowrap' }}>
              {t.l}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', background:CARD, border:`1px solid ${BORDER}`, borderRadius:'8px', padding:'6px 12px', minWidth:'200px' }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="5" stroke={MUTED} strokeWidth="1.5"/><path d="M10.5 10.5 14 14" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span style={{ fontSize:'12px', color:MUTED }}>Search tasks, people...</span>
          </div>
          <button style={{ padding:'6px 14px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer' }}>
            AI Chat and Notifications?
          </button>
        </div>
      </div>

      {/* KPI row — shown on every tab EXCEPT Dashboard.
          The Dashboard has its own KPI strip; doubling them is redundant. */}
      {tab !== 'dashboard' && (
      <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', padding:'20px 28px 0' }}>
        <div style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${BORDER}`, minWidth:'130px', flex:1 }}>
          <div style={{ fontSize:'11px', color:MUTED, marginBottom:'6px' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="9" y="1" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="1" y="9" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="9" y="9" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/></svg>
          </div>
          <div style={{ fontSize:'28px', fontWeight:'800', color:TEXT, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{activeProjs.length}</div>
          <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>Total Projects</div>
        </div>

        <div style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${BORDER}`, minWidth:'130px', flex:1 }}>
          <div style={{ fontSize:'11px', color:MUTED, marginBottom:'6px' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="12" rx="2" stroke={MUTED} strokeWidth="1.4"/><path d="M1 6h14" stroke={MUTED} strokeWidth="1.4"/><path d="M5 1v2M11 1v2" stroke={MUTED} strokeWidth="1.4" strokeLinecap="round"/></svg>
          </div>
          <div style={{ fontSize:'28px', fontWeight:'800', color:TEXT, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{onSchedulePct}<span style={{ fontSize:'16px', fontWeight:'600' }}>%</span></div>
          <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>Projects On Schedule</div>
        </div>

        <div onClick={() => { if (kpi.hasProjRisk) setTab('conflicts'); }}
          style={{ background:kpi.hasProjRisk?STATUS_TOKENS.DANGER_SUBTLE:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${kpi.hasProjRisk?STATUS_TOKENS.DANGER_BORDER:BORDER}`, minWidth:'130px', cursor:kpi.hasProjRisk?'pointer':'default', position:'relative', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'12px', fontWeight:'600', color:kpi.hasProjRisk?STATUS_TOKENS.DANGER_TEXT:MUTED }}>Project Risk</span>
            {kpi.hasProjRisk && <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 2L14 14H2L8 2Z" stroke={STATUS_TOKENS.DANGER_TEXT} strokeWidth="1.4"/><path d="M8 7v3M8 11.5v.5" stroke={STATUS_TOKENS.DANGER_TEXT} strokeWidth="1.4" strokeLinecap="round"/></svg>}
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
            <span style={{ fontSize:'28px', fontWeight:'800', color:kpi.hasProjRisk?STATUS_TOKENS.DANGER_TEXT:MUTED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{kpi.hasProjRisk?projRisk.length:'—'}</span>
            {kpi.hasProjRisk && projRisk[0] && <span style={{ fontSize:'13px', color:STATUS_TOKENS.DANGER_TEXT, fontWeight:'600' }}>({projRisk[0].id})</span>}
          </div>
          {kpi.hasProjRisk
            ? <div style={{ fontSize:'11px', color:STATUS_TOKENS.DANGER_TEXT2, marginTop:'6px', display:'flex', alignItems:'center', gap:'4px' }}>View <span>›</span></div>
            : <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>No issues</div>
          }
          {showResolver && kpi.conflicts>0 && (
            <ConflictResolutionPopover tasks={tasks} simDelays={simDelays} onApply={handleApply} onClose={() => setShowResolver(false)} />
          )}
        </div>

        <div onClick={() => { if (kpi.hasCrossRisk) setTab('conflicts'); }}
          style={{ background:kpi.hasCrossRisk?STATUS_TOKENS.DANGER_SUBTLE:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${kpi.hasCrossRisk?STATUS_TOKENS.DANGER_BORDER:BORDER}`, minWidth:'130px', cursor:kpi.hasCrossRisk?'pointer':'default', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'12px', fontWeight:'600', color:kpi.hasCrossRisk?STATUS_TOKENS.DANGER_TEXT:MUTED }}>Cross Project Risk</span>
            {kpi.hasCrossRisk && <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 2L14 14H2L8 2Z" stroke={STATUS_TOKENS.DANGER_TEXT} strokeWidth="1.4"/><path d="M8 7v3M8 11.5v.5" stroke={STATUS_TOKENS.DANGER_TEXT} strokeWidth="1.4" strokeLinecap="round"/></svg>}
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
            <span style={{ fontSize:'28px', fontWeight:'800', color:kpi.hasCrossRisk?STATUS_TOKENS.DANGER_TEXT:MUTED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{kpi.hasCrossRisk?crossRisk.length:'—'}</span>
            {kpi.hasCrossRisk && crossRisk[0] && <span style={{ fontSize:'13px', color:STATUS_TOKENS.DANGER_TEXT, fontWeight:'600' }}>({crossRisk[0].id})</span>}
          </div>
          {kpi.hasCrossRisk
            ? <div style={{ fontSize:'11px', color:STATUS_TOKENS.DANGER_TEXT2, marginTop:'6px', display:'flex', alignItems:'center', gap:'4px' }}>View <span>›</span></div>
            : <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>No issues</div>
          }
        </div>

        {/* Fragile Tasks — yellow-themed (warning, not failure). Counts individual
            tasks rather than projects: fragile is a per-task property of the
            schedule's tightness, not a project-level health metric. */}
        <div onClick={() => { if (kpi.fragile > 0) setTab('conflicts'); }}
          style={{ background:kpi.fragile>0?STATUS_TOKENS.WARN_SUBTLE2:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${kpi.fragile>0?STATUS_TOKENS.WARN_BORDER:BORDER}`, minWidth:'130px', cursor:kpi.fragile>0?'pointer':'default', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'12px', fontWeight:'600', color:kpi.fragile>0?STATUS_TOKENS.WARN_BADGE:MUTED }}>Fragile Tasks</span>
            {kpi.fragile>0 && <span style={{ fontSize:'14px', color:STATUS_TOKENS.WARN_BADGE, fontWeight:'800', lineHeight:'1' }}>~</span>}
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
            <span style={{ fontSize:'28px', fontWeight:'800', color:kpi.fragile>0?STATUS_TOKENS.WARN_BADGE:MUTED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{kpi.fragile>0?kpi.fragile:'—'}</span>
            {kpi.fragile>0 && <span style={{ fontSize:'13px', color:STATUS_TOKENS.WARN_BADGE, fontWeight:'600' }}>task{kpi.fragile===1?'':'s'}</span>}
          </div>
          {kpi.fragile>0
            ? <div style={{ fontSize:'11px', color:STATUS_TOKENS.WARN_BADGE, marginTop:'6px', display:'flex', alignItems:'center', gap:'4px' }}>View <span>›</span></div>
            : <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>None</div>
          }
        </div>
      </div>
      )}

      {/* Action row */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', padding:'14px 28px 0' }}>
        <button onClick={onImport}
          style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 16px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 16 16"><path d="M8 2v9M4 8l4 4 4-4" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"/></svg>
          Import
        </button>
        <button onClick={onClear}
          style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 16px', borderRadius:'8px', border:`1px solid ${STATUS_TOKENS.DANGER_BORDER}`, background:'transparent', color:STATUS_TOKENS.DANGER_TEXT2, fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
          Clear Data
        </button>
        <button onClick={onNewProject}
          style={{ padding:'7px 16px', borderRadius:'8px', border:'none', background:ORANGE, color:'white', fontSize:'12px', cursor:'pointer', fontWeight:'700' }}>
          + New Project
        </button>
      </div>

      {/* Tab panel */}
      <div style={{ margin:'14px 28px 28px', background:CARD, borderRadius:'12px', border:`1px solid ${BORDER}`, overflow:'hidden' }}>
        {tab==='dashboard' && <DashboardTab tasks={tasks} kpi={kpi} projRisk={projRisk} crossRisk={crossRisk} onSchedulePct={onSchedulePct} onGoToTab={setTab} />}
        {tab==='gantt'     && <ProjectGanttTab tasks={tasks} previewTasks={previewTasks} pendingShift={pendingShift} pendingReassigns={pendingReassigns} onCommitAll={commitAllPending} onCancelShift={cancelShift} onCancelReassign={cancelReassign} simDelays={simDelays} setSimDelays={setSimDelays} onEdit={handleEdit} setAddTasksProj={setAddTasksProj} onToggleComplete={toggleComplete} statusOverrides={statusOverrides} todayMs={todayMs} effectiveCompletedIds={effectiveCompletedIds} onCompleteProject={completeProject} draftProjIds={draftProjIds} allProjs={allProjs} />}
        {tab==='project'   && <ProjectViewTab tasks={tasks} allTasks={allTasks} allProjs={allProjs} completedProjIds={completedProjIds} draftProjIds={draftProjIds} history={history} onDelete={handleDelete} onEdit={handleEdit} onToggleComplete={toggleComplete} statusOverrides={statusOverrides} onSetStatus={setStatusOverride} todayMs={todayMs} effectiveCompletedIds={effectiveCompletedIds} onCompleteProject={completeProject} onUncompleteProject={uncompleteProject} setAddTasksProj={setAddTasksProj} />}
        {tab==='workflows' && <WorkflowsTab />}
        {tab==='conflicts' && <ConflictsTab tasks={tasks} pendingReassigns={pendingReassigns} onStageReassign={stageReassign} onCancelReassign={cancelReassign} onEdit={handleEdit} />}
        {tab==='people'    && <PeopleTab tasks={tasks} sel={sel} onSel={setSel} statusOverrides={statusOverrides} todayMs={todayMs} onAssignExisting={handleAssignExisting} onCreateNew={handleCreateAndAssign} onAddPerson={handleAddPerson} onImportPeople={handleImportPeople} onImportTasksForPerson={handleImportTasksForPerson} />}
      </div>
    </div>
  );
}