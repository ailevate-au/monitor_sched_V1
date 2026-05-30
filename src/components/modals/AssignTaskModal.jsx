// ── AssignTaskModal ──────────────────────────────────────────────────────────
// Smart modal triggered from the Resource (People) tab's "+ Assign" button.
//
// Two paths:
//   A. Pick from existing UNASSIGNED tasks. The modal lists them, filtered by
//      role (matching the selected person's role) by default. A toggle relaxes
//      the role filter. Conflicting tasks (date overlap with selected person's
//      existing tasks) are visually greyed and flagged.
//   B. Create a NEW task for this person.
//
// The mode is auto-selected: if any role-matched unassigned tasks exist, the
// modal opens in "pick" mode. Otherwise it opens straight in "create" mode.

import { useState, useMemo, useEffect } from 'react';
import { CARD, BORDER, ORANGE, TEXT, MUTED, SURFACE, INSET, CHIP, STATUS_TOKENS, STATUS_RED } from '../../theme.jsx';

export function AssignTaskModal({
  person,           // { name, role, color, init }
  unassignedTasks,  // array of all currently-unassigned tasks (person=='')
  personsTasks,     // tasks already assigned to this person — used for conflict check
  projs,            // for project dropdown when creating a new task
  onAssignExisting, // ({ taskIds }) — reassign selected unassigned tasks to person
  onCreateNew,      // ({ task }) — create a new task assigned to person
  onClose,
}) {
  const safeUnassigned = Array.isArray(unassignedTasks) ? unassignedTasks : [];
  const safePersonsTasks = Array.isArray(personsTasks) ? personsTasks : [];
  const safeProjs = Array.isArray(projs) ? projs : [];

  // ── Mode: 'pick' (choose from unassigned) or 'create' (new task form) ────
  // Auto-select based on whether there are role-matched unassigned tasks.
  // Pre-compute the role-matched set so we know which mode to start in.
  const roleMatched = useMemo(
    () => safeUnassigned.filter(t => (t.role || '') === (person?.role || '')),
    [safeUnassigned, person?.role]
  );
  const [mode, setMode] = useState(roleMatched.length > 0 ? 'pick' : 'create');
  // If unassignedTasks changes (rare but possible), don't fight the user's
  // current mode choice — only re-evaluate on first mount.

  // ── Pick mode state ──────────────────────────────────────────────────────
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  // Visible list: when showAllRoles is on, show every unassigned task; else
  // only role-matches. Conflict check independent of role filter.
  const visibleUnassigned = useMemo(() => {
    return showAllRoles ? safeUnassigned : roleMatched;
  }, [showAllRoles, safeUnassigned, roleMatched]);

  // Conflict map: for each visible task, does it overlap with any of the
  // person's existing (non-completed) tasks? Returns the conflicting task
  // for the warning copy, or null.
  const conflictMap = useMemo(() => {
    const out = {};
    const overlaps = (aS, aE, bS, bE) => aS <= bE && bS <= aE;
    const personActive = safePersonsTasks.filter(t => !t.isCompleted);
    for (const u of visibleUnassigned) {
      const us = u.s instanceof Date ? u.s : new Date(u.start);
      const ue = u.e instanceof Date ? u.e : new Date(u.end);
      for (const p of personActive) {
        const ps = p.s instanceof Date ? p.s : new Date(p.start);
        const pe = p.e instanceof Date ? p.e : new Date(p.end);
        if (overlaps(us, ue, ps, pe)) {
          out[u.id] = p;  // remember WHICH existing task collides
          break;
        }
      }
    }
    return out;
  }, [visibleUnassigned, safePersonsTasks]);

  const toggleSelect = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const conflictCount = useMemo(
    () => [...selectedIds].filter(id => conflictMap[id]).length,
    [selectedIds, conflictMap]
  );

  // ── Create mode state ────────────────────────────────────────────────────
  const [newTask, setNewTask] = useState({
    projId: safeProjs[0]?.id || '',
    name: '',
    start: '',
    end: '',
  });
  const [createError, setCreateError] = useState('');

  // ── ESC closes ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Confirm handlers ─────────────────────────────────────────────────────
  const handleConfirmPick = () => {
    if (selectedIds.size === 0) return;
    onAssignExisting && onAssignExisting({ taskIds: [...selectedIds] });
    onClose();
  };

  const handleConfirmCreate = () => {
    setCreateError('');
    if (!newTask.projId) { setCreateError('Pick a project.'); return; }
    if (!newTask.name.trim()) { setCreateError('Task name is required.'); return; }
    if (!newTask.start) { setCreateError('Start date is required.'); return; }
    if (!newTask.end) { setCreateError('End date is required.'); return; }
    if (new Date(newTask.end) < new Date(newTask.start)) { setCreateError('End date must be on or after start.'); return; }
    onCreateNew && onCreateNew({
      task: {
        projId: newTask.projId,
        name: newTask.name.trim(),
        start: newTask.start,
        end: newTask.end,
        role: person?.role || '',
      }
    });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:1000,
        background:'rgba(0,0,0,0.55)',
        display:'flex', alignItems:'center', justifyContent:'center',
        backdropFilter:'blur(2px)',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:CARD, border:`1px solid ${BORDER}`, borderRadius:'12px',
          padding:'0', maxWidth:'620px', width:'92%', maxHeight:'85vh',
          display:'flex', flexDirection:'column',
          boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
        }}>

        {/* Header */}
        <div style={{ padding:'20px 26px 14px', borderBottom:`1px solid ${BORDER}` }}>
          <div style={{ fontSize:'16px', fontWeight:'700', color:TEXT }}>
            Assign work to {person?.name || 'this person'}
          </div>
          {person?.role && (
            <div style={{ fontSize:'12px', color:MUTED, marginTop:'3px' }}>
              Role: {person.role}
            </div>
          )}
        </div>

        {/* Mode tabs — only show both tabs if there's a pick path available */}
        {roleMatched.length > 0 || safeUnassigned.length > 0 ? (
          <div style={{ display:'flex', borderBottom:`1px solid ${BORDER}`, background:SURFACE }}>
            <button onClick={() => setMode('pick')}
              style={tabStyle(mode==='pick')}>
              Pick from unassigned <span style={tabCount(mode==='pick')}>· {showAllRoles ? safeUnassigned.length : roleMatched.length}</span>
            </button>
            <button onClick={() => setMode('create')}
              style={tabStyle(mode==='create')}>
              Create new task
            </button>
          </div>
        ) : null}

        {/* Body */}
        <div style={{ padding:'18px 26px', overflowY:'auto', flex:1 }}>

          {/* ── PICK MODE ─────────────────────────────────────────────── */}
          {mode === 'pick' && (
            <>
              {/* Role filter toggle */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px', paddingBottom:'10px', borderBottom:`1px solid ${BORDER}` }}>
                <div style={{ fontSize:'12px', color:MUTED }}>
                  {showAllRoles
                    ? `Showing all unassigned tasks (${safeUnassigned.length})`
                    : `Matching ${person?.role || 'role'} (${roleMatched.length})`}
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'11px', color:TEXT, cursor:'pointer' }}>
                  <input type="checkbox" checked={showAllRoles} onChange={e => setShowAllRoles(e.target.checked)}
                    style={{ accentColor: ORANGE, cursor:'pointer' }} />
                  Show all roles
                </label>
              </div>

              {/* Task list */}
              {visibleUnassigned.length === 0 ? (
                <div style={{ padding:'30px 16px', textAlign:'center', color:MUTED, fontSize:'12px', background:SURFACE, borderRadius:'8px', border:`1px solid ${BORDER}` }}>
                  {safeUnassigned.length === 0
                    ? 'No unassigned tasks in your schedule.'
                    : `No unassigned tasks match the role "${person?.role || ''}". Toggle "Show all roles" or use "Create new task".`}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'4px', maxHeight:'380px', overflowY:'auto' }}>
                  {visibleUnassigned.map(t => {
                    const conflict = conflictMap[t.id];
                    const selected = selectedIds.has(t.id);
                    const fmt = d => new Date(d).toLocaleDateString('en-AU', { month:'short', day:'numeric' });
                    return (
                      <label key={t.id}
                        style={{
                          display:'flex', alignItems:'center', gap:'10px',
                          padding:'9px 12px', borderRadius:'7px', cursor:'pointer',
                          background: selected ? ORANGE+'18' : conflict ? STATUS_TOKENS.DANGER_SUBTLE+'33' : 'transparent',
                          border:`1px solid ${selected ? ORANGE+'66' : conflict ? STATUS_TOKENS.DANGER_BORDER+'55' : BORDER}`,
                        }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleSelect(t.id)}
                          style={{ accentColor: ORANGE, cursor:'pointer' }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:'12px', fontWeight:'600', color:TEXT, display:'flex', alignItems:'center', gap:'8px' }}>
                            <span style={{ color:MUTED, fontSize:'10px', fontWeight:'700' }}>{t.projId}</span>
                            <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.name}</span>
                          </div>
                          <div style={{ fontSize:'10px', color:MUTED, marginTop:'2px' }}>
                            {t.role && <span>{t.role} · </span>}
                            {fmt(t.s || t.start)} → {fmt(t.e || t.end)}
                            {conflict && (
                              <span style={{ color:STATUS_RED, marginLeft:'8px', fontWeight:'700' }}>
                                ⚠ Conflicts with {conflict.id} ({fmt(conflict.s || conflict.start)} → {fmt(conflict.e || conflict.end)})
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {conflictCount > 0 && (
                <div style={{ marginTop:'14px', padding:'10px 12px', borderRadius:'7px', background:STATUS_TOKENS.DANGER_SUBTLE+'33', border:`1px solid ${STATUS_RED}55`, fontSize:'11px', color:STATUS_TOKENS.DANGER_TEXT }}>
                  ⚠ {conflictCount} selected task{conflictCount===1?'':'s'} will conflict with {person?.name || 'this person'}'s existing schedule. You can still proceed — conflicts will appear as red bars on the Gantt for you to resolve later.
                </div>
              )}
            </>
          )}

          {/* ── CREATE MODE ───────────────────────────────────────────── */}
          {mode === 'create' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <div>
                <div style={{ fontSize:'11px', color:MUTED, marginBottom:'5px' }}>Project</div>
                {safeProjs.length === 0 ? (
                  <div style={{ padding:'10px 12px', borderRadius:'7px', background:SURFACE, border:`1px solid ${BORDER}`, color:MUTED, fontSize:'12px' }}>
                    No projects available. Create a project first.
                  </div>
                ) : (
                  <select value={newTask.projId}
                    onChange={e => setNewTask({ ...newTask, projId: e.target.value })}
                    style={INPUT_STYLE}>
                    {safeProjs.map(p => <option key={p.id} value={p.id}>{p.id} {p.name && p.name !== p.id ? `· ${p.name}` : ''}</option>)}
                  </select>
                )}
              </div>
              <div>
                <div style={{ fontSize:'11px', color:MUTED, marginBottom:'5px' }}>Task name</div>
                <input value={newTask.name}
                  onChange={e => setNewTask({ ...newTask, name: e.target.value })}
                  placeholder="Site survey, Permit review, Drainage design…"
                  style={INPUT_STYLE} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div>
                  <div style={{ fontSize:'11px', color:MUTED, marginBottom:'5px' }}>Start date</div>
                  <input type="date" value={newTask.start}
                    onChange={e => setNewTask({ ...newTask, start: e.target.value })}
                    style={INPUT_STYLE} />
                </div>
                <div>
                  <div style={{ fontSize:'11px', color:MUTED, marginBottom:'5px' }}>End date</div>
                  <input type="date" value={newTask.end}
                    onChange={e => setNewTask({ ...newTask, end: e.target.value })}
                    style={INPUT_STYLE} />
                </div>
              </div>
              <div style={{ fontSize:'10px', color:MUTED, fontStyle:'italic' }}>
                Role will be set to "{person?.role || '(no role)'}" — matches {person?.name || 'the selected person'}'s primary role.
              </div>
              {createError && (
                <div style={{ padding:'9px 12px', borderRadius:'7px', background:STATUS_TOKENS.DANGER_SUBTLE, border:`1px solid ${STATUS_TOKENS.DANGER_BORDER}`, color:STATUS_TOKENS.DANGER_TEXT, fontSize:'12px' }}>
                  {createError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 26px', borderTop:`1px solid ${BORDER}`, display:'flex', justifyContent:'flex-end', gap:'10px' }}>
          <button onClick={onClose}
            style={{
              padding:'8px 16px', borderRadius:'7px',
              border:`1px solid ${BORDER}`, background:'transparent',
              color:TEXT, fontSize:'12px', fontWeight:'600', cursor:'pointer',
            }}>
            Cancel
          </button>
          {mode === 'pick' && (
            <button onClick={handleConfirmPick}
              disabled={selectedIds.size === 0}
              style={{
                padding:'8px 20px', borderRadius:'7px', border:'none',
                background: selectedIds.size === 0 ? CHIP : ORANGE,
                color: selectedIds.size === 0 ? MUTED : 'white',
                fontSize:'12px', fontWeight:'700',
                cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
              }}>
              Assign {selectedIds.size > 0 ? `${selectedIds.size} task${selectedIds.size===1?'':'s'}` : 'tasks'}
            </button>
          )}
          {mode === 'create' && (
            <button onClick={handleConfirmCreate}
              style={{
                padding:'8px 20px', borderRadius:'7px', border:'none',
                background: ORANGE, color:'white',
                fontSize:'12px', fontWeight:'700', cursor:'pointer',
              }}>
              Create &amp; assign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Local styling primitives ────────────────────────────────────────────────
const INPUT_STYLE = {
  width:'100%', padding:'8px 10px', borderRadius:'7px',
  border:`1px solid ${BORDER}`, background:INSET, color:TEXT,
  fontSize:'12px', outline:'none', boxSizing:'border-box',
};

function tabStyle(active) {
  return {
    padding:'12px 18px', border:'none', background:'none', cursor:'pointer',
    fontSize:'13px', fontWeight: active ? '700' : '500',
    color: active ? ORANGE : MUTED,
    borderBottom: active ? `2px solid ${ORANGE}` : '2px solid transparent',
    marginBottom: '-1px',
  };
}
function tabCount(active) {
  return { fontSize:'11px', color: active ? ORANGE : MUTED, fontWeight:'500', opacity: 0.7, marginLeft: '4px' };
}