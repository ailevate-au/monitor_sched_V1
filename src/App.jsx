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
  loadStatusOverrides, saveStatusOverrides,
  loadDepOverrides, saveDepOverrides,
  clearAllStorage,
  LS_KEY, LS_EDITS_KEY,
} from './storage/persist.jsx';
import { parseXlsx } from './engine/xlsx.jsx';
import { buildSched } from './engine/schedule.jsx';
import { applyEditsToData, mutateSchedData } from './engine/edits.jsx';
import { addW, parseDate, fmtDDMMYYYY } from './engine/dates.jsx';
import { NAV, SURFACE, CARD, BORDER, ORANGE, TEXT, MUTED } from './theme.jsx';

import { EditModal } from './components/EditModal.jsx';
import { ConflictResolutionPopover } from './components/ConflictResolutionPopover.jsx';
import { ProjectGanttTab } from './components/tabs/ProjectGanttTab.jsx';
import { ProjectViewTab } from './components/tabs/ProjectViewTab.jsx';
import { ConflictsTab } from './components/tabs/ConflictsTab.jsx';
import { PeopleTab } from './components/tabs/PeopleTab.jsx';
import { WorkflowsTab } from './components/tabs/WorkflowsTab.jsx';
import { AddTasksModal } from './components/modals/AddTasksModal.jsx';
import { NewProjectModal } from './components/modals/NewProjectModal.jsx';

const FONT_STACK = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

// ── App: imports/empty state + ScheduleApp orchestration ────────────────────
export default function App() {
  const [schedData,   setSchedData]   = useState(null);
  const [baseData,    setBaseData]    = useState(null);
  const [importing,   setImporting]   = useState(false);
  const [importError, setImportError] = useState(null);
  const [showNewProj, setShowNewProj] = useState(false);
  const fileInputRef = useRef(null);

  // Restore from localStorage on mount
  useEffect(() => {
    const buf = loadFromStorage();
    if (!buf) return;
    parseXlsx(buf)
      .then(data => {
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
      const data = await parseXlsx(buf);
      saveToStorage(buf);
      try { localStorage.removeItem(LS_EDITS_KEY); } catch {}
      setBaseData(data);
      setSchedData(data);
    } catch (err) {
      setImportError(err.message || 'Failed to parse file.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleAddProject = ({ proj, rawTasks: newTasks, people: newPeople }) => {
    setSchedData(prev => {
      const allRaw = [...prev.rawTasks, ...newTasks];
      const updated = {
        ...prev,
        rawTasks: allRaw,
        projs:    [...prev.projs, proj],
        people:   [...prev.people, ...newPeople],
        tdepMap:  Object.fromEntries(allRaw.map(t => [t.id, t.deps])),
      };
      const existing = loadSchedEdits() || { rawTasks:[], projs:[], people:[] };
      saveSchedEdits({
        rawTasks: [...existing.rawTasks, ...newTasks],
        projs:    [...existing.projs,    proj],
        people:   [...existing.people,   ...newPeople],
      });
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
// Pre-import shell. Greyed-out KPIs, instructional placeholder, Import button.
function EmptyState({ fileInputRef, showNewProj, setShowNewProj, handleFileChange, triggerImport, importing, importError }) {
  return (
    <div style={{ fontFamily:FONT_STACK, background:SURFACE, minHeight:'100vh', color:TEXT }}>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display:'none' }} />

      {showNewProj && (
        <NewProjectModal existingProjs={[]} existingPeople={[]} onAdd={()=>{}} onClose={() => setShowNewProj(false)} />
      )}

      {/* Nav */}
      <div style={{ background:NAV, padding:'0 28px', height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ display:'flex', alignItems:'center' }}>
          <span style={{ color:ORANGE, fontWeight:'800', fontSize:'18px', letterSpacing:'-0.5px', marginRight:'32px' }}>FlowIQ</span>
          {['Gantt Chart','Project View','Conflicts','Resource'].map((l, i) => (
            <button key={i} style={{ padding:'0 18px', height:'52px', border:'none', background:'none', cursor:'default', fontSize:'13px', fontWeight:'500', color:i===0?ORANGE:MUTED, borderBottom:i===0?`2px solid ${ORANGE}`:'2px solid transparent', whiteSpace:'nowrap', opacity:0.5 }}>{l}</button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'#1E1E2A', border:`1px solid ${BORDER}`, borderRadius:'8px', padding:'6px 12px', minWidth:'200px' }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="5" stroke={MUTED} strokeWidth="1.5"/><path d="M10.5 10.5 14 14" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span style={{ fontSize:'12px', color:MUTED }}>Search tasks, people...</span>
          </div>
          <button style={{ padding:'6px 14px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer' }}>AI Chat and Notifications?</button>
        </div>
      </div>

      {/* Placeholder KPI row */}
      <div style={{ display:'flex', gap:'12px', padding:'20px 28px 0' }}>
        {[{l:'Total Projects',v:'—'},{l:'Projects On Schedule',v:'—%'},{l:'Project Risk',v:'—',sub:'No data'},{l:'Cross Project Risk',v:'—',sub:'No data'}].map((k,i) => (
          <div key={i} style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${BORDER}`, flex:i>1?1:undefined, minWidth:i===0?'140px':'160px' }}>
            <div style={{ fontSize:'10px', color:MUTED, marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.06em' }}>{k.l}</div>
            <div style={{ fontSize:'28px', fontWeight:'800', color:MUTED, lineHeight:'1' }}>{k.v}</div>
            {k.sub && <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>{k.sub}</div>}
          </div>
        ))}
        <div style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px dashed ${BORDER}`, minWidth:'120px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'6px' }}>
          <span style={{ fontSize:'11px', color:MUTED }}>Add KPI</span>
          <div style={{ width:'28px', height:'28px', borderRadius:'50%', border:`1.5px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', color:MUTED, fontSize:'18px' }}>+</div>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', padding:'14px 28px 0' }}>
        <button onClick={triggerImport} disabled={importing}
          style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 16px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 16 16"><path d="M8 2v9M4 8l4 4 4-4" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"/></svg>
          {importing ? 'Importing...' : 'Import'}
        </button>
        <button onClick={() => setShowNewProj(true)}
          style={{ padding:'7px 16px', borderRadius:'8px', border:'none', background:ORANGE, color:'white', fontSize:'12px', cursor:'pointer', fontWeight:'700' }}>
          + New Project
        </button>
      </div>

      {/* Empty tab shell */}
      <div style={{ margin:'14px 28px 28px', background:CARD, borderRadius:'12px', border:`1px solid ${BORDER}`, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', borderBottom:`1px solid ${BORDER}`, background:'#1C1C27', padding:'0 6px' }}>
          {['Gantt Chart','Project View','Conflicts','Resource'].map((l,i) => (
            <button key={i} style={{ padding:'12px 18px', border:'none', background:'none', cursor:'default', fontSize:'13px', fontWeight:i===0?'600':'400', color:i===0?ORANGE:MUTED, borderBottom:i===0?`2px solid ${ORANGE}`:'2px solid transparent', marginBottom:'-1px', whiteSpace:'nowrap', opacity:i===0?1:0.45 }}>{l}</button>
          ))}
        </div>
        <div style={{ position:'relative', minHeight:'420px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ position:'absolute', inset:0, overflow:'hidden', opacity:0.15 }}>
            {Array.from({length:8}).map((_,i) => <div key={i} style={{ position:'absolute', left:`${(i+1)*12.5}%`, top:0, bottom:0, width:'1px', background:MUTED }} />)}
            {Array.from({length:5}).map((_,i) => <div key={i} style={{ position:'absolute', top:`${(i+1)*16.6}%`, left:0, right:0, height:'1px', background:MUTED }} />)}
          </div>
          <div style={{ textAlign:'center', zIndex:1 }}>
            <div style={{ fontSize:'36px', marginBottom:'14px', opacity:0.4 }}>📊</div>
            <div style={{ fontSize:'16px', fontWeight:'600', color:TEXT, marginBottom:'8px', opacity:0.6 }}>No schedule data</div>
            <div style={{ fontSize:'12px', color:MUTED, lineHeight:'1.7', maxWidth:'340px', margin:'0 auto', opacity:0.7 }}>
              Use the <strong style={{color:TEXT}}>Import</strong> button above to load your schedule.<br/>
              Expects a <strong style={{color:TEXT}}>Schedule</strong> sheet with columns:<br/>
              <span style={{ fontSize:'11px', color:'#6B7280' }}>Project · Task ID · Task Name · Assigned · Role · Rate · Start · End · Dependencies</span>
            </div>
            {importError && (
              <div style={{ marginTop:'16px', padding:'10px 14px', borderRadius:'8px', background:'#3B1219', border:'1px solid #7F1D1D', color:'#FCA5A5', fontSize:'12px', maxWidth:'340px', margin:'16px auto 0', textAlign:'left' }}>
                <strong>Import failed:</strong> {importError}
              </div>
            )}
          </div>
        </div>
      </div>
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

  const tasks = useMemo(
    () => buildSched(rawTasks, tdepMap, base, simDelays, cascadeMode, effectiveCompletedIds, todayMs),
    [rawTasks, tdepMap, base, simDelays, cascadeMode, effectiveCompletedIds, todayMs]
  );

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

  const [tab,        setTab]        = useState('gantt');
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

    const updated = mutateSchedData(currentBaseData, currentEdits, { type:'shiftTimeline', taskIds: allIds, days });
    onMutate(updated);
    setSimDelays(prev => {
      const nd = { ...prev };
      allIds.forEach(id => delete nd[id]);
      return nd;
    });
    setPendingShift(null);  // preview consumed
  }, [pendingShift, rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate]);

  // Discard a staged shift without applying it.
  const cancelShift = useCallback(() => setPendingShift(null), []);

  // ── Preview task set ────────────────────────────────────────────────────────
  // When a shift is staged, previewTasks is the schedule WITH the shift applied.
  // The Gantt diffs `tasks` (current) against `previewTasks` to draw ghosts.
  const previewTasks = useMemo(() => {
    if (!pendingShift) return null;
    const { taskIds, days, mode } = pendingShift;
    const tempDelays = {};
    // For a forward shift we use positive delays; backward shifts need the
    // dates rewritten, so we shift the rawTasks directly for the preview.
    const shiftedRaw = rawTasks.map(t => {
      if (!taskIds.includes(t.id)) return t;
      const sD = parseDate(t.start), eD = parseDate(t.end);
      if (!sD || !eD) return t;
      return { ...t, start: fmtDDMMYYYY(addW(sD, days)), end: fmtDDMMYYYY(addW(eD, days)) };
    });
    return buildSched(shiftedRaw, tdepMap, base, {}, mode || cascadeMode, effectiveCompletedIds, todayMs);
  }, [pendingShift, rawTasks, tdepMap, base, cascadeMode, effectiveCompletedIds, todayMs]);

  // (Bug fix: original re-declared `baseData` inside the callback, shadowing
  //  the prop. Renamed to `currentBaseData` for clarity.)
  const handleDelete = useCallback(mutation => {
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const updated = mutateSchedData(currentBaseData, currentEdits, mutation);
    onMutate(updated);
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
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate]);

  const handleAddTasks = useCallback(({ tasks: newTasks, people: newPeople }) => {
    const currentBaseData = { rawTasks, projs, people, tdepMap, base, todayDay, periods };
    const currentEdits = loadSchedEdits();
    const updated = mutateSchedData(currentBaseData, currentEdits, { type:'addTasks', tasks:newTasks, people:newPeople });
    onMutate(updated);
  }, [rawTasks, projs, people, tdepMap, base, todayDay, periods, onMutate]);

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
  const onSchedule = projs.filter(p => {
    if (intraConflictProjs.has(p.id) || crossConflictProjs.has(p.id)) return false;
    const pt = tasks.filter(t => t.projId === p.id && !isEffectivelyCompleted(t));
    return !pt.some(t => t.isOverdue || delayedTaskIds.has(t.id));
  }).length;
  const onSchedulePct = projs.length ? Math.round((onSchedule / projs.length) * 100) : 0;

  const projRisk  = projs.filter(p => intraConflictProjs.has(p.id));
  const crossRisk = projs.filter(p => crossConflictProjs.has(p.id));

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
          <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'#1E1E2A', border:`1px solid ${BORDER}`, borderRadius:'8px', padding:'6px 12px', minWidth:'200px' }}>
            <svg width="13" height="13" fill="none" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="5" stroke={MUTED} strokeWidth="1.5"/><path d="M10.5 10.5 14 14" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span style={{ fontSize:'12px', color:MUTED }}>Search tasks, people...</span>
          </div>
          <button style={{ padding:'6px 14px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer' }}>
            AI Chat and Notifications?
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display:'flex', gap:'12px', padding:'20px 28px 0' }}>
        <div style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${BORDER}`, minWidth:'140px' }}>
          <div style={{ fontSize:'11px', color:MUTED, marginBottom:'6px' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="9" y="1" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="1" y="9" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="9" y="9" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/></svg>
          </div>
          <div style={{ fontSize:'28px', fontWeight:'800', color:TEXT, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{projs.length}</div>
          <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>Total Projects</div>
        </div>

        <div style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${BORDER}`, minWidth:'160px' }}>
          <div style={{ fontSize:'11px', color:MUTED, marginBottom:'6px' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="12" rx="2" stroke={MUTED} strokeWidth="1.4"/><path d="M1 6h14" stroke={MUTED} strokeWidth="1.4"/><path d="M5 1v2M11 1v2" stroke={MUTED} strokeWidth="1.4" strokeLinecap="round"/></svg>
          </div>
          <div style={{ fontSize:'28px', fontWeight:'800', color:TEXT, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{onSchedulePct}<span style={{ fontSize:'16px', fontWeight:'600' }}>%</span></div>
          <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>Projects On Schedule</div>
        </div>

        <div onClick={() => { if (kpi.hasProjRisk) setTab('conflicts'); }}
          style={{ background:kpi.hasProjRisk?'#3B1219':CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${kpi.hasProjRisk?'#7F1D1D':BORDER}`, minWidth:'160px', cursor:kpi.hasProjRisk?'pointer':'default', position:'relative', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'12px', fontWeight:'600', color:kpi.hasProjRisk?'#FCA5A5':MUTED }}>Project Risk</span>
            {kpi.hasProjRisk && <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 2L14 14H2L8 2Z" stroke="#FCA5A5" strokeWidth="1.4"/><path d="M8 7v3M8 11.5v.5" stroke="#FCA5A5" strokeWidth="1.4" strokeLinecap="round"/></svg>}
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
            <span style={{ fontSize:'28px', fontWeight:'800', color:kpi.hasProjRisk?'#FCA5A5':MUTED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{kpi.hasProjRisk?projRisk.length:'—'}</span>
            {kpi.hasProjRisk && projRisk[0] && <span style={{ fontSize:'13px', color:'#FCA5A5', fontWeight:'600' }}>({projRisk[0].id})</span>}
          </div>
          {kpi.hasProjRisk
            ? <div style={{ fontSize:'11px', color:'#F87171', marginTop:'6px', display:'flex', alignItems:'center', gap:'4px' }}>View <span>›</span></div>
            : <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>No issues</div>
          }
          {showResolver && kpi.conflicts>0 && (
            <ConflictResolutionPopover tasks={tasks} simDelays={simDelays} onApply={handleApply} onClose={() => setShowResolver(false)} />
          )}
        </div>

        <div onClick={() => { if (kpi.hasCrossRisk) setTab('conflicts'); }}
          style={{ background:kpi.hasCrossRisk?'#3B1219':CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${kpi.hasCrossRisk?'#7F1D1D':BORDER}`, minWidth:'180px', cursor:kpi.hasCrossRisk?'pointer':'default', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'12px', fontWeight:'600', color:kpi.hasCrossRisk?'#FCA5A5':MUTED }}>Cross Project Risk</span>
            {kpi.hasCrossRisk && <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 2L14 14H2L8 2Z" stroke="#FCA5A5" strokeWidth="1.4"/><path d="M8 7v3M8 11.5v.5" stroke="#FCA5A5" strokeWidth="1.4" strokeLinecap="round"/></svg>}
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
            <span style={{ fontSize:'28px', fontWeight:'800', color:kpi.hasCrossRisk?'#FCA5A5':MUTED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{kpi.hasCrossRisk?crossRisk.length:'—'}</span>
            {kpi.hasCrossRisk && crossRisk[0] && <span style={{ fontSize:'13px', color:'#FCA5A5', fontWeight:'600' }}>({crossRisk[0].id})</span>}
          </div>
          {kpi.hasCrossRisk
            ? <div style={{ fontSize:'11px', color:'#F87171', marginTop:'6px', display:'flex', alignItems:'center', gap:'4px' }}>View <span>›</span></div>
            : <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>No issues</div>
          }
        </div>

        <div style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px dashed ${BORDER}`, minWidth:'120px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', gap:'6px' }}>
          <span style={{ fontSize:'11px', color:MUTED }}>Add KPI</span>
          <div style={{ width:'28px', height:'28px', borderRadius:'50%', border:`1.5px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', color:MUTED, fontSize:'18px', lineHeight:'1' }}>+</div>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', padding:'14px 28px 0' }}>
        <button onClick={onImport}
          style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 16px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 16 16"><path d="M8 2v9M4 8l4 4 4-4" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round"/></svg>
          Import
        </button>
        <button onClick={onClear}
          style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 16px', borderRadius:'8px', border:`1px solid #7F1D1D`, background:'transparent', color:'#F87171', fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
          Clear Data
        </button>
        <button onClick={onNewProject}
          style={{ padding:'7px 16px', borderRadius:'8px', border:'none', background:ORANGE, color:'white', fontSize:'12px', cursor:'pointer', fontWeight:'700' }}>
          + New Project
        </button>
      </div>

      {/* Tab panel */}
      <div style={{ margin:'14px 28px 28px', background:CARD, borderRadius:'12px', border:`1px solid ${BORDER}`, overflow:'hidden' }}>
        {tab==='gantt'     && <ProjectGanttTab tasks={tasks} previewTasks={previewTasks} pendingShift={pendingShift} onCommitShift={commitShift} onCancelShift={cancelShift} simDelays={simDelays} setSimDelays={setSimDelays} onEdit={handleEdit} setAddTasksProj={setAddTasksProj} onToggleComplete={toggleComplete} statusOverrides={statusOverrides} todayMs={todayMs} />}
        {tab==='project'   && <ProjectViewTab tasks={tasks} onDelete={handleDelete} onEdit={handleEdit} onToggleComplete={toggleComplete} statusOverrides={statusOverrides} onSetStatus={setStatusOverride} todayMs={todayMs} />}
        {tab==='workflows' && <WorkflowsTab />}
        {tab==='conflicts' && <ConflictsTab tasks={tasks} />}
        {tab==='people'    && <PeopleTab tasks={tasks} sel={sel} onSel={setSel} statusOverrides={statusOverrides} todayMs={todayMs} />}
      </div>
    </div>
  );
}