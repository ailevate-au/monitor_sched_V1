// ── ProjectGanttTab ──────────────────────────────────────────────────────────
// The main Gantt view — collapsible projects, role groupings, person-level bars,
// dependency arrows, today line, drag-shift, conflict highlighting.

import { useState, useMemo, useRef, useEffect } from 'react';
import { useSched } from '../../context.jsx';
import { fmtDate as fd } from '../../engine/dates.jsx';
import { normDep } from '../../engine/schedule.jsx';
import { computeStatus } from '../../engine/status.jsx';
import { DPX, HH, LW, PRH, RRH, SRH, SBH, ALL_MONS } from '../../theme.jsx';
import { ConfirmModal } from '../ConfirmModal.jsx';

export function ProjectGanttTab({ tasks: tasksProp, previewTasks, pendingShift, pendingReassigns, onCommitAll, onCancelShift, onCancelReassign, simDelays, setSimDelays, onEdit, setAddTasksProj, onToggleComplete, statusOverrides, todayMs, effectiveCompletedIds, onCompleteProject }) {
  const { rawTasks, projs, people, tdepMap, base, todayDay, periods } = useSched();

  // ── Timeline-shift + reassignment simulation ───────────────────────────────
  // When ANY change is staged, the chart renders the PREVIEW tasks (with all
  // staged changes applied). Two ghost maps capture the "before" state so we
  // can draw greyed bars on the original rows:
  //   ghostMap          — task id → old {sd, cd} for tasks that MOVED in time
  //   reassignGhostMap  — task id → old person name for tasks that changed owner
  // A given task can be in both maps simultaneously (rare but valid).
  const hasShift     = !!pendingShift;
  const hasReassigns = !!pendingReassigns && Object.keys(pendingReassigns).length > 0;
  const isSimulating = (hasShift || hasReassigns) && !!previewTasks;
  const tasks = isSimulating ? previewTasks : tasksProp;

  const ghostMap = useMemo(() => {
    if (!isSimulating) return {};
    const oldById = Object.fromEntries(tasksProp.map(t => [t.id, t]));
    const m = {};
    for (const t of previewTasks) {
      const old = oldById[t.id];
      if (old && (old.sd !== t.sd || old.cd !== t.cd)) {
        m[t.id] = { sd: old.sd, cd: old.cd };
      }
    }
    return m;
  }, [isSimulating, previewTasks, tasksProp]);

  const reassignGhostMap = useMemo(() => {
    if (!isSimulating || !hasReassigns) return {};
    // For each reassigned task: store the OLD person + the OLD {sd, cd} so we
    // can paint a ghost on that person's row at the original time slot.
    const oldById = Object.fromEntries(tasksProp.map(t => [t.id, t]));
    const m = {};
    for (const [taskId, { from }] of Object.entries(pendingReassigns)) {
      const oldT = oldById[taskId];
      if (oldT) m[taskId] = { oldPerson: from, sd: oldT.sd, cd: oldT.cd, projId: oldT.projId };
    }
    return m;
  }, [isSimulating, hasReassigns, pendingReassigns, tasksProp]);

  // ── Status-driven palette ──────────────────────────────────────────────────
  // Bar colour = task status. Brand orange (#F97316) is reserved for UI chrome
  // (active tabs, simulation bar, buttons) and never used on bars.
  //   On Track / In Progress → steel-blue (the default)
  //   Completed              → green
  //   Overdue                → amber-orange
  //   Conflict               → red
  //   Fragile / Dep-Violation → badge only (bar colour unchanged)
  // In-Progress is identical to On Track in fill but uses a BRIGHTER stroke,
  // so active work whispers "I'm running" without dominating the chart.
  const TASK_BLUE     = '#5B7B9A';
  const TASK_BLUE_HI  = '#7DA3C8';  // brighter outline for in-progress
  const STATUS_GREEN  = '#10B981';
  const STATUS_AMBER  = '#F59E0B';
  const STATUS_RED    = '#EF4444';
  const GHOST_GREY    = '#475569';
  // Aliases kept so the rest of the file (which references NEUTRAL / CONFLICT_RED) still compiles.
  const NEUTRAL       = TASK_BLUE;
  const CONFLICT_RED  = STATUS_RED;

  // Effective status of a task → bar fill colour.
  const fillForStatus = s =>
    s === 'Completed' ? STATUS_GREEN :
    s === 'Overdue'   ? STATUS_AMBER :
    s === 'Conflict'  ? STATUS_RED   :
    TASK_BLUE;
  // Stroke is normally the same as the fill, BUT in-progress overrides to the
  // brighter blue so active tasks have a subtly highlighted outline.
  const strokeForStatus = s =>
    s === 'In Progress' ? TASK_BLUE_HI : fillForStatus(s);

  // Wrapper that computes a task's effective status (respecting overrides)
  // and returns { fill, stroke } in one call. Used in the bar render path.
  const colorsFor = (t) => {
    const eff = computeStatus(t, statusOverrides, todayMs || Date.now());
    return { status: eff, fill: fillForStatus(eff), stroke: strokeForStatus(eff) };
  };

  // Legacy helper kept for callers that just want one colour per task —
  // returns the bar's fill, which already accounts for conflict/completed/overdue.
  const taskColor = t => t ? fillForStatus(computeStatus(t, statusOverrides, todayMs || Date.now())) : TASK_BLUE;
  // Group helper (rollup pill, role row): if ANY task is in conflict, red — otherwise neutral.
  const groupColor = arr => (arr && arr.some(t => t.isC)) ? STATUS_RED : TASK_BLUE;


  // ── Filter state — owned here, not in parent ──────────────────────────────
  const [filterProj,   setFilterProj]   = useState(null); // null = All
  const [filterPerson, setFilterPerson] = useState(null); // null = All
  const [zoomPeriod,   setZoomPeriod]   = useState(null);
  const [filterMenuOpen,   setFilterMenuOpen]   = useState(false);
  const [personMenuOpen,   setPersonMenuOpen]   = useState(false);
  const filterMenuRef  = useRef(null);
  const personMenuRef  = useRef(null);

  const fp = filterProj || 'All';

  const [showCompleted, setShowCompleted] = useState(true);
  const [expanded, setExpanded] = useState(() => {
    // Start with every project AND every project-role expanded.
    // Role keys are the actual role names from the people data (e.g.
    // "Architect", "Draftee") — NOT the old hardcoded ROLES list, which
    // never matched the imported data.
    const s = new Set(projs.map(p => p.id));
    const roleNames = [...new Set(people.map(per => (per.role || 'Unassigned').trim() || 'Unassigned'))];
    projs.forEach(p => roleNames.forEach(rn => s.add(`${p.id}-${rn}`)));
    return s;
  });
  const [hov, setHov]     = useState(null);
  const [mouse, setMouse] = useState({ x:0, y:0 });
  const [showDeps, setShowDeps] = useState(false);
  const [projMenuOpen, setProjMenuOpen] = useState(false);
  const [addTasksMenuOpen, setAddTasksMenuOpen] = useState(false);
  const [pendingCompleteProj, setPendingCompleteProj] = useState(null);
  const projMenuRef     = useRef(null);
  const addTasksMenuRef = useRef(null);

  // Projects whose every task is effectively completed — eligible for the
  // "Conclude" action. Uses tasksProp (the actual current data, NOT the
  // simulation preview) and the effectiveCompletedIds set passed from App.
  const completedSet = effectiveCompletedIds instanceof Set ? effectiveCompletedIds : new Set();
  const readyToConclude = useMemo(() => {
    if (!onCompleteProject) return [];
    const byProj = {};
    for (const t of tasksProp) {
      const pid = t.projId;
      if (!byProj[pid]) byProj[pid] = [];
      byProj[pid].push(t);
    }
    const ready = [];
    for (const [pid, ts] of Object.entries(byProj)) {
      if (ts.length === 0) continue;
      if (ts.every(t => t.isCompleted || completedSet.has(t.id))) {
        const proj = projs.find(p => p.id === pid);
        ready.push({ id: pid, name: proj?.name || pid });
      }
    }
    return ready;
  }, [tasksProp, completedSet, projs, onCompleteProject]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = e => {
      if (projMenuRef.current && !projMenuRef.current.contains(e.target))
        setProjMenuOpen(false);
      if (addTasksMenuRef.current && !addTasksMenuRef.current.contains(e.target))
        setAddTasksMenuOpen(false);
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target))
        setFilterMenuOpen(false);
      if (personMenuRef.current && !personMenuRef.current.contains(e.target))
        setPersonMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const outerRef  = useRef(null);
  const scrollRef = useRef(null);

  // Dynamic timeline — expands if delayed tasks push past the base 120-day window
  const maxTaskDay = useMemo(() => Math.max(120, ...tasks.map(t => t.sd + t.cd + 10)), [tasks]);
  const MONS = useMemo(() => {
    const needed = [];
    for (let i = 0; i < ALL_MONS.length - 1; i++) {
      needed.push(ALL_MONS[i]);
      if (ALL_MONS[i + 1].d > maxTaskDay) { needed.push(ALL_MONS[i + 1]); break; }
    }
    if (needed[needed.length - 1].n !== '') needed.push({ n:'', d: maxTaskDay + 30 });
    return needed;
  }, [maxTaskDay]);
  const TD = maxTaskDay;

  // ── Dynamic DPX — single project gets generous spacing, all-projects is compact ──
  const dpx = useMemo(() => {
    const viewW = (outerRef.current?.clientWidth || 1100) - LW - 40;
    if (zoomPeriod) {
      const period = periods.find(p => p.key === zoomPeriod);
      if (period) {
        const span = period.endDay - period.startDay + 1;
        return Math.min(38, Math.max(14, Math.floor(viewW * 0.92 / span)));
      }
    }
    if (filterProj) {
      const pt = tasks.filter(t => t.projId === filterProj && t.cd > 0);
      if (pt.length) {
        const span = Math.max(...pt.map(t => t.sd + t.cd)) - Math.min(...pt.map(t => t.sd));
        return Math.min(48, Math.max(20, Math.floor(viewW * 0.9 / span)));
      }
    }
    if (filterPerson) {
      const pt = tasks.filter(t => t.person === filterPerson && t.cd > 0);
      if (pt.length) {
        const span = Math.max(...pt.map(t => t.sd + t.cd)) - Math.min(...pt.map(t => t.sd));
        return Math.min(48, Math.max(20, Math.floor(viewW * 0.9 / span)));
      }
    }
    return DPX;
  }, [filterProj, filterPerson, zoomPeriod, tasks]);

  const txR = d => d * dpx;

  // ── Auto-expand the filtered project(s) when the filter changes ────────────
  // IMPORTANT: deps are ONLY [filterProj, filterPerson] — deliberately NOT dpx.
  // Previously dpx was a dep, so any layout change that recomputed dpx would
  // re-run this and force-add projects back into `expanded` — which sprang the
  // user's collapse toggles right back open. Keep this effect filter-only.
  useEffect(() => {
    if (!filterProj && !filterPerson) {
      setShowDeps(false);
      return;
    }
    setShowDeps(true);
    setExpanded(prev => {
      const next = new Set(prev);
      const targetProjs = filterProj ? [filterProj] : projs.map(p => p.id);
      const roleNames = [...new Set(people.map(per => (per.role || 'Unassigned').trim() || 'Unassigned'))];
      targetProjs.forEach(pid => {
        next.add(pid);
        roleNames.forEach(rn => next.add(`${pid}-${rn}`));
      });
      return next;
    });
  }, [filterProj, filterPerson]);

  // ── Scroll to the filtered project's start ────────────────────────────────
  // This one DOES depend on dpx (the scroll position is in dpx-scaled pixels).
  // It only scrolls — it never touches `expanded` — so re-running it on dpx
  // changes is harmless.
  useEffect(() => {
    if (!filterProj && !filterPerson) return;
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const relevantTasks = filterPerson
        ? tasks.filter(t => t.person === filterPerson && t.cd > 0)
        : filterProj
          ? tasks.filter(t => t.projId === filterProj && t.cd > 0)
          : [];
      const scrollDay = relevantTasks.length ? Math.min(...relevantTasks.map(t => t.sd)) : 0;
      scrollRef.current.scrollLeft = Math.max(0, scrollDay * dpx - 36);
    });
  }, [filterProj, filterPerson, dpx]);

  const toggle = id => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // One entry per project with role → person breakdown
  const projData = useMemo(() => {
    return projs
      .filter(p => !filterProj || p.id === filterProj)
      .map(proj => {
        const pt = tasks
          .filter(t => t.projId === proj.id)
          .filter(t => {
            if (showCompleted) return true;
            const effStatus = computeStatus(t, statusOverrides, todayMs || Date.now());
            return effStatus !== 'Completed';
          })
          .filter(t => !filterPerson || t.person === filterPerson);
        const withDur = pt.filter(t => t.cd > 0);
        const minSd = withDur.length ? Math.min(...withDur.map(t => t.sd)) : 0;
        const maxEd = withDur.length ? Math.max(...withDur.map(t => t.sd + t.cd)) : 0;

        // ── Group people by role ────────────────────────────────────────────
        // Roles are derived from the actual people in this project — each
        // person carries a `.role` string from the imported xlsx. The old
        // code grouped against a hardcoded ROLES list whose `.people` arrays
        // were never populated, so roleGroups always came back empty and no
        // role/person rows ever rendered. This builds the groups from real data.
        //
        // Find the people who actually have (visible) tasks in this project:
        const projPeopleNames = new Set(pt.map(t => t.person));

        // PLUS: when reassignments are staged, anyone receiving a task in this
        // project must appear here too — even if they had no prior tasks in
        // it. Their new task is already in `pt` (because previewTasks was
        // rewritten upstream), so projPeopleNames usually already picks them
        // up. This extra pass is just defensive in case the preview isn't
        // synthesised for some reason (e.g. wholly-new person not yet known).
        if (hasReassigns && pendingReassigns) {
          for (const [taskId, ra] of Object.entries(pendingReassigns)) {
            const t = pt.find(x => x.id === taskId);
            if (t) projPeopleNames.add(ra.to);
          }
        }

        // Look up the full person objects. If a reassignment destination is
        // not in `people` yet (brand-new to this dataset), synthesize a
        // minimal stand-in so the row can render.
        const projPeople = [...projPeopleNames].map(name => {
          const known = people.find(p => p.name === name);
          if (known) return known;
          return { name, role: 'Unassigned', init: name.slice(0,2).toUpperCase(), color: NEUTRAL, rate: '$42/hr' };
        });

        // Distinct role names, in first-seen order:
        const roleNames = [];
        for (const per of projPeople) {
          const rn = (per.role || 'Unassigned').trim() || 'Unassigned';
          if (!roleNames.includes(rn)) roleNames.push(rn);
        }

        // Build a role group per distinct role name. We synthesize the
        // {key, label, color} shape the renderer expects. Colour falls back
        // to the project colour so it always has something sensible.
        const roleGroups = roleNames.map(roleName => {
          const members = projPeople.filter(
            per => ((per.role || 'Unassigned').trim() || 'Unassigned') === roleName
          );
          if (!members.length) return null;
          const role = {
            key:   roleName,                       // used to build expand/collapse keys
            label: roleName,                       // shown in the role row header
            color: NEUTRAL, // neutralised; per-task conflict colouring still applies on bars
          };
          return {
            role,
            personRows: members.map(per => ({
              per,
              tasks: pt.filter(t => t.person === per.name).sort((a, b) => a.s - b.s),
            })),
          };
        }).filter(Boolean);

        return { proj, pt, minSd, maxEd, roleGroups };
      })
      .filter(pd => pd.pt.length > 0 || !filterPerson); // hide projects with no matching tasks when filtering by person
  }, [tasks, filterProj, filterPerson, showCompleted, statusOverrides, todayMs, hasReassigns, pendingReassigns, people, NEUTRAL]);

  // Flat row list: proj → role → person, with y positions
  const { rowList, totalH } = useMemo(() => {
    const list = [];
    let y = HH;
    for (const pd of projData) {
      list.push({ kind: 'proj', pd, y });
      y += PRH;
      if (expanded.has(pd.proj.id)) {
        for (const rg of pd.roleGroups) {
          const roleKey = `${pd.proj.id}-${rg.role.key}`;
          list.push({ kind: 'role', pd, rg, y });
          y += RRH;
          if (expanded.has(roleKey)) {
            for (const pr of rg.personRows) {
              list.push({ kind: 'person', pd, rg, pr, y });
              y += SRH;
            }
          }
        }
      }
    }
    return { rowList: list, totalH: y };
  }, [projData, expanded]);

  const ht = hov ? tasks.find(t => t.id === hov) : null;

  // Pixel positions for every visible task:
  //   • person rows  → yc at person row centre
  //   • collapsed role rows → yc at role row centre (tasks show as mini bars)
  const posMap = useMemo(() => {
    const m = {};
    for (const row of rowList) {
      if (row.kind === 'person') {
        const yc = row.y + SRH / 2;
        for (const t of row.pr.tasks) {
          m[t.id] = { xs: txR(t.sd), xe: txR(t.sd + t.cd), yc, collapsed: false };
        }
      } else if (row.kind === 'role') {
        const roleKey = `${row.pd.proj.id}-${row.rg.role.key}`;
        if (!expanded.has(roleKey)) {
          // Role is collapsed — all its tasks appear as mini bars in this row
          const yc = row.y + RRH / 2;
          for (const pr of row.rg.personRows) {
            for (const t of pr.tasks) {
              m[t.id] = { xs: txR(t.sd), xe: txR(t.sd + t.cd), yc, collapsed: true };
            }
          }
        }
      }
    }
    return m;
  }, [rowList, expanded, dpx]);

  // Dep lines — between any two tasks that both have a position in posMap
  const depLines = useMemo(() => {
    const lines = [];
    for (const pd of projData) {
      for (const t of pd.pt) {
        const toPos = posMap[t.id];
        if (!toPos) continue;
        const rawDeps = tdepMap[t.id] || [];
        for (const depRaw of rawDeps) {
          const { id: depId, type: depType } = normDep(depRaw);
          const fromPos = posMap[depId];
          if (fromPos) {
            lines.push({
              from: fromPos, to: toPos,
              taskId: t.id, depId,
              projId: t.projId,
              type: depType || 'FS',
              sameRow: Math.abs(fromPos.yc - toPos.yc) < 4,
            });
          }
        }
      }
    }
    return lines;
  }, [projData, posMap, tdepMap]);

  // Tasks connected to the hovered one
  const hovRelated = useMemo(() => {
    if (!hov) return new Set();
    const s = new Set([hov]);
    for (const l of depLines) {
      if (l.taskId === hov) s.add(l.depId);
      if (l.depId  === hov) s.add(l.taskId);
    }
    return s;
  }, [hov, depLines]);

  return (
    <div>
      {/* Confirm modal for project completion */}
      <ConfirmModal
        open={!!pendingCompleteProj}
        title="Conclude this project?"
        body={pendingCompleteProj
          ? `This will archive ${pendingCompleteProj.id}${pendingCompleteProj.name ? ' (' + pendingCompleteProj.name + ')' : ''}. The project will be removed from the Gantt chart, conflict detection, and dashboard KPIs. It can be reopened anytime from the Completed sub-tab of Project View.`
          : ''}
        confirmLabel="✓ Conclude project"
        confirmColor="#10B981"
        onConfirm={() => {
          if (pendingCompleteProj && onCompleteProject) {
            onCompleteProject(pendingCompleteProj.id, pendingCompleteProj.name);
          }
          setPendingCompleteProj(null);
        }}
        onCancel={() => setPendingCompleteProj(null)} />

      {/* Ready-to-conclude banner — same UX as in Project View */}
      {readyToConclude.length > 0 && (
        <div style={{ padding:'10px 16px', background:'#0D2B1E', borderBottom:'1px solid #065F46' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'12px', fontWeight:'600', color:'#10B981' }}>
              ✓ {readyToConclude.length} project{readyToConclude.length===1?'':'s'} ready to conclude:
            </span>
            {readyToConclude.map(p => (
              <button key={p.id}
                onClick={() => setPendingCompleteProj(p)}
                style={{
                  padding:'5px 12px', borderRadius:'6px', border:'1px solid #10B98155',
                  background:'#10B98122', color:'#10B981', fontSize:'11px', fontWeight:'700',
                  cursor:'pointer',
                }}>
                ✓ Conclude {p.id}{p.name && p.name !== p.id ? ' · ' + p.name : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Consolidated simulation bar ─────────────────────────────────────
          Lists every staged change (shifts + reassignments) with per-change
          revert. A single Confirm All commits everything in one transaction.
          Stays visible whenever any change is staged. */}
      {isSimulating && (
        <div style={{
          padding:'10px 16px', background:'#1E1B2E',
          borderBottom:'2px solid #F97316'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'14px', marginBottom: (hasShift || hasReassigns) ? '8px' : '0' }}>
            <span style={{ fontSize:'13px', fontWeight:'700', color:'#F97316' }}>
              ◷ Simulating changes
            </span>
            <span style={{ fontSize:'12px', color:'#9CA3AF' }}>
              {(hasShift ? 1 : 0) + (hasReassigns ? Object.keys(pendingReassigns).length : 0)} staged
              {' · '}grey = current, solid = proposed
            </span>
            <div style={{ flex:1 }} />
            <button onClick={onCommitAll}
              style={{ padding:'6px 16px', borderRadius:'7px', border:'none',
                background:'#F97316', color:'white', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
              ✓ Confirm all
            </button>
          </div>
          {/* Per-change rows — each with its own revert. */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
            {hasShift && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'4px 8px 4px 10px', borderRadius:'6px', background:'rgba(249,115,22,0.12)', border:'1px solid rgba(249,115,22,0.35)' }}>
                <span style={{ fontSize:'11px', color:'#FED7AA', fontWeight:'600' }}>
                  Shift {pendingShift.days > 0 ? '+' : ''}{pendingShift.days}d
                  <span style={{ color:'#9CA3AF', fontWeight:'400' }}> · {Object.keys(ghostMap).length} task{Object.keys(ghostMap).length===1?'':'s'}</span>
                </span>
                <button onClick={onCancelShift}
                  title="Revert this shift"
                  style={{ padding:'2px 6px', borderRadius:'4px', border:'none', background:'transparent', color:'#FCA5A5', fontSize:'11px', cursor:'pointer' }}>
                  ↺
                </button>
              </div>
            )}
            {hasReassigns && Object.entries(pendingReassigns).map(([taskId, ra]) => {
              const t = tasks.find(x => x.id === taskId) || tasksProp.find(x => x.id === taskId);
              const label = t ? `${t.name || taskId}` : taskId;
              return (
                <div key={taskId} style={{ display:'inline-flex', alignItems:'center', gap:'8px', padding:'4px 8px 4px 10px', borderRadius:'6px', background:'rgba(249,115,22,0.12)', border:'1px solid rgba(249,115,22,0.35)' }}>
                  <span style={{ fontSize:'11px', color:'#FED7AA', fontWeight:'600' }}>
                    {ra.from} → {ra.to}
                    <span style={{ color:'#9CA3AF', fontWeight:'400' }}> · {label}</span>
                  </span>
                  <button onClick={() => onCancelReassign && onCancelReassign(taskId)}
                    title="Revert this reassignment"
                    style={{ padding:'2px 6px', borderRadius:'4px', border:'none', background:'transparent', color:'#FCA5A5', fontSize:'11px', cursor:'pointer' }}>
                    ↺
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Toolbar — matches Figma exactly ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'0', padding:'0 16px', height:'48px', borderBottom:`1px solid #2A2A3A`, background:'#1C1C27' }}>
        {/* Details › */}
        <button style={{ display:'flex', alignItems:'center', gap:'5px', padding:'0 14px', height:'48px', border:'none', background:'none', cursor:'pointer', fontSize:'13px', fontWeight:'500', color:'#E8E8F0', borderRight:'1px solid #2A2A3A' }}>
          Details <span style={{ fontSize:'11px', color:'#6B7280' }}>›</span>
        </button>

        {/* Dependencies toggle */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0 14px', height:'48px', borderRight:'1px solid #2A2A3A', cursor:'pointer' }} onClick={() => setShowDeps(v => !v)}>
          <span style={{ fontSize:'13px', fontWeight:'500', color:'#E8E8F0' }}>Dependencies</span>
          <div style={{ width:'36px', height:'20px', borderRadius:'10px', background: showDeps ? '#F97316' : '#374151', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <div style={{ position:'absolute', top:'3px', left: showDeps ? '18px' : '3px', width:'14px', height:'14px', borderRadius:'50%', background:'white', transition:'left 0.2s' }} />
          </div>
        </div>

        {/* Show Completed toggle */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0 14px', height:'48px', borderRight:'1px solid #2A2A3A', cursor:'pointer' }} onClick={() => setShowCompleted(v => !v)}>
          <span style={{ fontSize:'13px', fontWeight:'500', color:'#E8E8F0' }}>Completed</span>
          <div style={{ width:'36px', height:'20px', borderRadius:'10px', background: showCompleted ? '#10B981' : '#374151', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <div style={{ position:'absolute', top:'3px', left: showCompleted ? '18px' : '3px', width:'14px', height:'14px', borderRadius:'50%', background:'white', transition:'left 0.2s' }} />
          </div>
        </div>

        {/* Adjust Timeline */}
        <div ref={projMenuRef} style={{ position:'relative' }}>
          <button onClick={() => setProjMenuOpen(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'0 14px', height:'48px', border:'none', background:'none', cursor:'pointer', fontSize:'13px', fontWeight:'500', color: projMenuOpen ? '#F97316' : '#E8E8F0', borderRight:'1px solid #2A2A3A' }}>
            Adjust Timeline
          </button>
          {projMenuOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50, background:'#1C1C27', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.5)', border:'1px solid #2A2A3A', minWidth:'210px', overflow:'hidden' }}>
              {projs.map((p, i) => (
                <div key={p.id}
                  onClick={() => { setProjMenuOpen(false); onEdit({ type:'project', id:p.id }); }}
                  style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 14px', cursor:'pointer', borderBottom: i < projs.length - 1 ? '1px solid #2A2A3A' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background='#2A2A3A'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:p.color, flexShrink:0 }} />
                  <span style={{ fontSize:'13px', color:'#E8E8F0', fontWeight:'500' }}>{p.id} — New Build</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Tasks dropdown */}
        <div ref={addTasksMenuRef} style={{ position:'relative' }}>
          <button onClick={() => setAddTasksMenuOpen(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'0 14px', height:'48px', border:'none', background:'none', cursor:'pointer', fontSize:'13px', fontWeight:'500', color: addTasksMenuOpen ? '#F97316' : '#E8E8F0', borderRight:'1px solid #2A2A3A' }}>
            + Add Tasks
          </button>
          {addTasksMenuOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50, background:'#1C1C27', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.5)', border:'1px solid #2A2A3A', minWidth:'210px', overflow:'hidden' }}>
              {projs.map((p, i) => (
                <div key={p.id}
                  onClick={() => { setAddTasksMenuOpen(false); setAddTasksProj(p); }}
                  style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 14px', cursor:'pointer', borderBottom: i < projs.length-1 ? '1px solid #2A2A3A' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background='#2A2A3A'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:p.color, flexShrink:0 }} />
                  <span style={{ fontSize:'13px', color:'#E8E8F0', fontWeight:'500' }}>{p.id} — {p.name.replace(' — New Build','')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {Object.keys(simDelays).length > 0 && (
          <button onClick={() => setSimDelays({})}
            style={{ display:'flex', alignItems:'center', gap:'5px', padding:'0 12px', height:'48px', border:'none', background:'none', cursor:'pointer', fontSize:'12px', color:'#F97316', fontWeight:'600', borderRight:'1px solid #2A2A3A' }}>
            ✕ Clear preview delays
          </button>
        )}

        {/* Right side */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'0' }}>
          {/* Month label */}
          <span style={{ padding:'0 14px', fontSize:'13px', color:'#6B7280', borderLeft:'1px solid #2A2A3A', height:'48px', display:'flex', alignItems:'center' }}>Month</span>

          {/* Resource filter */}
          <div ref={personMenuRef} style={{ position:'relative', borderLeft:'1px solid #2A2A3A' }}>
            <button onClick={() => setPersonMenuOpen(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0 14px', height:'48px', border:'none', background: filterPerson ? '#10B98112' : 'none', cursor:'pointer', fontSize:'13px', fontWeight:'500', color: filterPerson ? '#10B981' : '#E8E8F0', minWidth:'140px' }}>
              {filterPerson
                ? <><div style={{ width:'9px', height:'9px', borderRadius:'50%', background: people.find(p=>p.name===filterPerson)?.color || '#10B981', flexShrink:0 }} />{filterPerson}</>
                : 'All Resources'
              }
              <span style={{ marginLeft:'auto', color:'#6B7280', fontSize:'10px' }}>▾</span>
            </button>
            {personMenuOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:100, background:'#1C1C27', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.6)', border:'1px solid #2A2A3A', minWidth:'200px', maxHeight:'320px', overflowY:'auto' }}>
                <div onClick={() => { setFilterPerson(null); setPersonMenuOpen(false); }}
                  style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 14px', cursor:'pointer', borderBottom:'1px solid #2A2A3A',
                    background: !filterPerson ? '#2A2A3A' : 'transparent',
                    color: !filterPerson ? '#F97316' : '#E8E8F0',
                    fontSize:'13px', fontWeight: !filterPerson ? '600' : '400' }}
                  onMouseEnter={e => { if (filterPerson) e.currentTarget.style.background='#2A2A3A'; }}
                  onMouseLeave={e => { if (filterPerson) e.currentTarget.style.background='transparent'; }}>
                  <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:'#6B7280', flexShrink:0 }} />
                  All Resources
                </div>
                {people.map((per, i) => {
                  const perTasks = tasks.filter(t => t.person === per.name);
                  const hasConflict = perTasks.some(t => t.isC);
                  const projCount = new Set(perTasks.map(t => t.projId)).size;
                  return (
                    <div key={per.name} onClick={() => { setFilterPerson(per.name); setPersonMenuOpen(false); }}
                      style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', cursor:'pointer',
                        borderBottom: i < people.length - 1 ? '1px solid #2A2A3A22' : 'none',
                        background: filterPerson === per.name ? '#2A2A3A' : 'transparent',
                        color: filterPerson === per.name ? (per.color || '#10B981') : '#E8E8F0',
                        fontSize:'13px', fontWeight: filterPerson === per.name ? '600' : '400' }}
                      onMouseEnter={e => { if (filterPerson !== per.name) e.currentTarget.style.background='#2A2A3A'; }}
                      onMouseLeave={e => { if (filterPerson !== per.name) e.currentTarget.style.background='transparent'; }}>
                      <div style={{ width:'9px', height:'9px', borderRadius:'50%', background: per.color || '#6B7280', flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:'500', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{per.name}</div>
                        <div style={{ fontSize:'10px', color:'#6B7280', marginTop:'1px' }}>{per.role || '—'} · {projCount} project{projCount!==1?'s':''}</div>
                      </div>
                      {hasConflict && <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#EF4444', flexShrink:0 }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Project filter — custom dropdown */}
          <div ref={filterMenuRef} style={{ position:'relative', borderLeft:'1px solid #2A2A3A' }}>
            <button onClick={() => setFilterMenuOpen(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0 14px', height:'48px', border:'none', background: filterProj ? '#F9731612' : 'none', cursor:'pointer', fontSize:'13px', fontWeight:'500', color: filterProj ? '#F97316' : '#E8E8F0', minWidth:'140px' }}>
              {filterProj
                ? <><div style={{ width:'9px', height:'9px', borderRadius:'50%', background: NEUTRAL, flexShrink:0 }} />{filterProj}</>
                : 'All Projects'
              }
              <span style={{ marginLeft:'auto', color:'#6B7280', fontSize:'10px' }}>▾</span>
            </button>
            {filterMenuOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:100, background:'#1C1C27', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.6)', border:'1px solid #2A2A3A', minWidth:'180px', overflow:'hidden' }}>
                <div onClick={() => { setFilterProj(null); setFilterMenuOpen(false); }}
                  style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 14px', cursor:'pointer', borderBottom:'1px solid #2A2A3A',
                    background: !filterProj ? '#2A2A3A' : 'transparent', color: !filterProj ? '#F97316' : '#E8E8F0', fontSize:'13px', fontWeight: !filterProj ? '600' : '400' }}
                  onMouseEnter={e => { if (filterProj) e.currentTarget.style.background='#2A2A3A'; }}
                  onMouseLeave={e => { if (filterProj) e.currentTarget.style.background='transparent'; }}>
                  <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:'#6B7280', flexShrink:0 }} />
                  All Projects
                </div>
                {projs.map((p, i) => (
                  <div key={p.id} onClick={() => { setFilterProj(p.id); setFilterMenuOpen(false); }}
                    style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 14px', cursor:'pointer',
                      borderBottom: i < projs.length - 1 ? '1px solid #2A2A3A' : 'none',
                      background: filterProj === p.id ? '#2A2A3A' : 'transparent',
                      color: filterProj === p.id ? p.color : '#E8E8F0',
                      fontSize:'13px', fontWeight: filterProj === p.id ? '600' : '400' }}
                    onMouseEnter={e => { if (filterProj !== p.id) e.currentTarget.style.background='#2A2A3A'; }}
                    onMouseLeave={e => { if (filterProj !== p.id) e.currentTarget.style.background='transparent'; }}>
                    <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:p.color, flexShrink:0 }} />
                    {p.id} — {p.name.replace(' — New Build','').replace(' — ','') || 'New Build'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={outerRef} style={{ position:'relative', display:'flex', background:'#13131A' }}
        onMouseMove={e => { const r = outerRef.current?.getBoundingClientRect(); if (r) setMouse({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
        onMouseLeave={() => setHov(null)}>

        {/* ── STICKY LEFT PANEL — does not scroll ── */}
        <div style={{ width:LW, flexShrink:0, position:'relative', zIndex:5, boxShadow:'4px 0 12px rgba(0,0,0,0.4)' }}>
          <svg width={LW} height={totalH} style={{ display:'block', fontFamily:'-apple-system,system-ui,sans-serif' }}>
            {/* Header bg */}
            <rect x={0} y={0} width={LW} height={HH} fill="#0A0A0F" />
            <line x1={0} y1={HH} x2={LW} y2={HH} stroke="#2A2A3A" strokeWidth="1.5" />

            {rowList.map(row => {
              if (row.kind === 'proj') {
                const { pd, y } = row;
                const { proj, pt } = pd;
                const isExp = expanded.has(proj.id);
                const midY = y + PRH / 2;
                const hasC = pt.some(t => t.isC);
                const projColor = hasC ? CONFLICT_RED : NEUTRAL;
                return (
                  <g key={proj.id+'-lbl'} style={{ cursor:'pointer' }} onClick={() => toggle(proj.id)}>
                    <rect x={0} y={y} width={LW} height={PRH} fill={projColor+'18'} />
                    <rect x={10} y={midY-11} width={22} height={22} rx="6" fill={projColor+'30'} />
                    <text x={21} y={midY+1} textAnchor="middle" dominantBaseline="middle" fill={projColor} fontSize="14" fontWeight="800" style={{userSelect:'none'}}>{isExp?'−':'+'}</text>
                    <text x={40} y={midY-6} fill={projColor} fontSize="14" fontWeight="800">{proj.id}</text>
                    <text x={40} y={midY+9} fill="#6B7280" fontSize="10">New Build · {pt.length} tasks</text>
                    <rect x={LW-46} y={midY-11} width={36} height={22} rx="11" fill={projColor+'25'} />
                    <text x={LW-28} y={midY+1} textAnchor="middle" dominantBaseline="middle" fill={projColor} fontSize="11" fontWeight="700">{pt.length}</text>
                    {hasC && <g>
                      <circle cx={LW-8} cy={y+14} r={7} fill="#EF4444" />
                      <text x={LW-8} y={y+14} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="700">!</text>
                    </g>}
                    <line x1={0} y1={y+PRH} x2={LW} y2={y+PRH} stroke={isExp?projColor+'50':'#2A2A3A'} strokeWidth={isExp?1.5:1} />
                  </g>
                );
              }
              // ── Role sub-header row ──────────────────────────────────────
              if (row.kind === 'role') {
                const { pd: rpd, rg, y: ry } = row;
                const roleKey = `${rpd.proj.id}-${rg.role.key}`;
                const isRExp = expanded.has(roleKey);
                const rMidY = ry + RRH / 2;
                const allTasks = rg.personRows.flatMap(r2 => r2.tasks);
                const rHasC = allTasks.some(t => t.isC);
                const roleC = rHasC ? CONFLICT_RED : NEUTRAL;
                return (
                  <g key={roleKey+'-lbl'} style={{ cursor:'pointer' }} onClick={() => toggle(roleKey)}>
                    <rect x={0} y={ry} width={LW} height={RRH} fill="#1A1A24" />
                    <line x1={18} y1={ry} x2={18} y2={ry+RRH} stroke={NEUTRAL+'50'} strokeWidth="1.5" />
                    <rect x={26} y={rMidY-9} width={18} height={18} rx="5" fill={roleC+'30'} />
                    <text x={35} y={rMidY+1} textAnchor="middle" dominantBaseline="middle" fill={roleC} fontSize="12" fontWeight="800" style={{userSelect:'none'}}>{isRExp?'−':'+'}</text>
                    <text x={51} y={rMidY-5} fill={roleC} fontSize="11.5" fontWeight="700">{rg.role.label}</text>
                    <text x={51} y={rMidY+8} fill="#6B7280" fontSize="9.5">{rg.personRows.length} member{rg.personRows.length>1?'s':''} · {allTasks.length} tasks</text>
                    {rHasC && <g>
                      <circle cx={LW-8} cy={ry+12} r={7} fill="#EF4444" />
                      <text x={LW-8} y={ry+12} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="700">!</text>
                    </g>}
                    <line x1={0} y1={ry+RRH} x2={LW} y2={ry+RRH} stroke={isRExp?roleC+'40':'#2A2A3A'} strokeWidth={isRExp?1.2:0.8} />
                  </g>
                );
              }

              // ── Person leaf row ──────────────────────────────────────────────
              if (row.kind === 'person') {
                const { pd: ppd, rg: prg, pr, y: py } = row;
                const pTasks = pr.tasks;
                const pMidY = py + SRH / 2;
                const pHasC = pTasks.some(t => t.isC);
                const pHasF = pTasks.some(t => t.isF && !t.isC);
                const personC = pHasC ? CONFLICT_RED : NEUTRAL;
                return (
                  <g key={`${ppd.proj.id}-${pr.per.name}-lbl`}>
                    <rect x={0} y={py} width={LW} height={SRH} fill="#13131A" />
                    <line x1={18} y1={py} x2={18} y2={py+SRH} stroke={NEUTRAL+'50'} strokeWidth="1.5" />
                    <line x1={32} y1={py} x2={32} y2={py+SRH} stroke={NEUTRAL+'50'} strokeWidth="1.5" />
                    <line x1={32} y1={pMidY} x2={44} y2={pMidY} stroke={NEUTRAL+'50'} strokeWidth="1.5" />
                    <circle cx={56} cy={pMidY} r={13} fill={personC+'20'} />
                    <circle cx={56} cy={pMidY} r={13} fill="none" stroke={personC} strokeWidth="1.5" />
                    <text x={56} y={pMidY+1} textAnchor="middle" dominantBaseline="middle" fill={personC} fontSize="8.5" fontWeight="700">{pr.per.init}</text>
                    <text x={75} y={pMidY-7} fill="#E8E8F0" fontSize="12" fontWeight="600">{pr.per.name}</text>
                    <text x={75} y={pMidY+8} fill="#6B7280" fontSize="9.5">{pTasks.length} tasks</text>
                    <rect x={LW-40} y={pMidY-10} width={28} height={20} rx="10" fill="#2A2A3A" />
                    <text x={LW-26} y={pMidY+1} textAnchor="middle" dominantBaseline="middle" fill="#6B7280" fontSize="10" fontWeight="600">{pTasks.length}</text>
                    {pHasC && <g>
                      <circle cx={LW-8} cy={py+13} r={7} fill="#EF4444" />
                      <text x={LW-8} y={py+13} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="700">!</text>
                    </g>}
                    {pHasF && !pHasC && <g>
                      <circle cx={LW-8} cy={py+13} r={7} fill="#F59E0B" />
                      <text x={LW-8} y={py+13} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="800">~</text>
                    </g>}
                    <line x1={0} y1={py+SRH} x2={py} y2={py+SRH} stroke="#2A2A3A" strokeWidth="1" />
                    <line x1={0} y1={py+SRH} x2={LW} y2={py+SRH} stroke="#2A2A3A" strokeWidth="1" />
                  </g>
                );
              }
              return null;
            })}

            <line x1={LW-1} y1={0} x2={LW-1} y2={totalH} stroke="#2A2A3A" strokeWidth="1" />
          </svg>
        </div>

        {/* ── SCROLLABLE TIMELINE — right side only ── */}
        <div ref={scrollRef} style={{ overflowX:'auto', flex:1 }}>
          <svg width={TD*dpx} height={totalH} style={{ display:'block', fontFamily:'-apple-system,system-ui,sans-serif' }}>

            {/* Month header row — top */}
            {MONS.slice(0,-1).map((m, i) => {
              const x1 = txR(m.d), x2 = txR(MONS[i+1].d);
              return (
                <g key={m.n+'-'+i}>
                  <rect x={x1} y={0} width={x2-x1} height={HH*0.55} fill={i%2 ? '#17171F' : '#1C1C27'} />
                  <text x={(x1+x2)/2} y={HH*0.55/2+4} textAnchor="middle" fill="#9CA3AF" fontSize="12" fontWeight="500">{m.n} 2026</text>
                  <line x1={x1} y1={0} x2={x1} y2={totalH} stroke="#2A2A3A" strokeWidth={i===0?1:0.5} />
                </g>
              );
            })}

            {/* Week sub-header row — below month row */}
            {(() => {
              const rows = [];
              const weekRowY = HH * 0.55;
              const weekRowH = HH * 0.45;
              for (let i = 0; i < MONS.length - 1; i++) {
                const monStart = MONS[i].d;
                const monEnd   = MONS[i+1].d;
                const monSpan  = monEnd - monStart;
                const wSpan    = monSpan / 4;
                for (let w = 0; w < 4; w++) {
                  const wx  = txR(monStart + w * wSpan);
                  const wx2 = txR(monStart + (w+1) * wSpan);
                  rows.push(
                    <g key={`${i}-w${w}`}>
                      <rect x={wx} y={weekRowY} width={wx2-wx} height={weekRowH} fill={w%2 ? '#13131A' : '#17171F'} />
                      <text x={(wx+wx2)/2} y={weekRowY + weekRowH/2 + 4} textAnchor="middle" fill="#4B5563" fontSize="10" fontWeight="500">W{w+1}</text>
                      <line x1={wx} y1={weekRowY} x2={wx} y2={totalH} stroke="#2A2A3A" strokeWidth="0.4" opacity="0.7" />
                    </g>
                  );
                }
              }
              return rows;
            })()}

            {/* Header bottom border */}
            <line x1={0} y1={HH} x2={TD*dpx} y2={HH} stroke="#2A2A3A" strokeWidth="1" />

            {/* Weekly gridlines through chart body */}
            {Array.from({length:Math.floor(TD/7)},(_,i)=>(i+1)*7).map(d=>(
              <line key={d} x1={txR(d)} y1={HH} x2={txR(d)} y2={totalH} stroke="#2A2A3A" strokeWidth="0.4" opacity="0.5" />
            ))}

            {/* Period highlight band */}
            {zoomPeriod && (() => {
              const period = periods.find(p => p.key === zoomPeriod);
              if (!period) return null;
              const px1 = txR(period.startDay), px2 = txR(period.endDay + 1);
              return (
                <g>
                  <rect x={px1} y={0} width={px2-px1} height={totalH} fill="#F97316" opacity="0.04" />
                  <line x1={px1} y1={0} x2={px1} y2={totalH} stroke="#F97316" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3"/>
                  <line x1={px2} y1={0} x2={px2} y2={totalH} stroke="#F97316" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3"/>
                  <rect x={px1} y={2} width={px2-px1} height={20} rx="4" fill="#F97316" opacity="0.15" />
                  <text x={(px1+px2)/2} y={13} textAnchor="middle" fill="#F97316" fontSize="10" fontWeight="700" opacity="0.8">
                    {period.label}
                  </text>
                </g>
              );
            })()}

            {/* Today line */}
            <line x1={txR(todayDay)} y1={0} x2={txR(todayDay)} y2={totalH} stroke="#F97316" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8" />
            <rect x={txR(todayDay)-22} y={HH/2-10} width={44} height={19} rx="4" fill="#F97316" />
            <text x={txR(todayDay)} y={HH/2+0.5} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="700">Today</text>

            {/* Row backgrounds + bars */}
            {rowList.map(row => {
              if (row.kind === 'proj') {
                const { pd, y } = row;
                const { proj, pt, minSd, maxEd } = pd;
                const bx = txR(minSd), bw = (maxEd - minSd) * dpx;
                const midY = y + PRH / 2;
                const isExp = expanded.has(proj.id);
                // Tasks in this project that are in conflict — used to paint
                // red bands ON TOP of the neutral pill so you can see *where*
                // the trouble is, even when the project is rolled up.
                const conflictTasks = pt.filter(t => t.isC && t.cd > 0);
                const hasC = conflictTasks.length > 0;
                const pillColor = hasC ? CONFLICT_RED : NEUTRAL;
                return (
                  <g key={proj.id+'-r'}>
                    <rect x={0} y={y} width={TD*dpx} height={PRH} fill={NEUTRAL+'15'} />
                    {/* Neutral pill (shadow + body + outline) */}
                    <rect x={bx+2} y={midY-11} width={bw} height={22} rx="11" fill={NEUTRAL+'25'} />
                    <rect x={bx} y={midY-11} width={bw} height={22} rx="11" fill="none" stroke={pillColor} strokeWidth="2" />
                    {/* Red conflict bands — drawn AFTER the neutral pill body so they sit on top.
                        Each band spans the conflicting task's time-range inside the pill.
                        We clip-path them to the pill's rounded shape via the same rx="11". */}
                    {conflictTasks.map(t => {
                      const cx = txR(t.sd);
                      const cw = Math.max(t.cd * dpx, 4);
                      return (
                        <rect key={t.id+'-cf'}
                          x={cx} y={midY-9} width={cw} height={18} rx="6"
                          fill={CONFLICT_RED+'66'} stroke={CONFLICT_RED} strokeWidth="1" />
                      );
                    })}
                    {bw>80 && <text x={bx+bw/2} y={midY+1} textAnchor="middle" dominantBaseline="middle" fill={pillColor} fontSize="11" fontWeight="700" style={{pointerEvents:'none',userSelect:'none'}}>
                      {proj.id} · {pt.filter(t=>t.cd>0).length} tasks{hasC ? ` · ${conflictTasks.length} conflict${conflictTasks.length>1?'s':''}` : ' with duration'}
                    </text>}
                    <line x1={0} y1={y+PRH} x2={TD*dpx} y2={y+PRH} stroke={isExp?NEUTRAL+'50':'#2A2A3A'} strokeWidth={isExp?1.5:1} />
                  </g>
                );
              }
              // ── Role row — collapsed shows mini task bars, expanded is just bg ──
              if (row.kind === 'role') {
                const { rg, y: ry2 } = row;
                const roleKey = `${row.pd.proj.id}-${rg.role.key}`;
                const isRExp = expanded.has(roleKey);
                const allTasks = rg.personRows.flatMap(r2 => r2.tasks);
                const rMid = ry2 + RRH / 2;
                // Mini bar height — fits inside RRH with padding
                const mbH = 20, mbY = rMid - mbH / 2;
                return (
                  <g key={roleKey+'-r'}>
                    <rect x={0} y={ry2} width={TD*dpx} height={RRH} fill={NEUTRAL+'08'} />
                    {/* When collapsed: render every task as a small bar in this single row */}
                    {!isRExp && allTasks.filter(t => t.cd > 0).map(t => {
                      const tx2 = txR(t.sd), tw = Math.max(t.cd * dpx, 4);
                      const isHovT = hov === t.id;
                      const tc = taskColor(t);  // RED if conflict, NEUTRAL otherwise
                      return (
                        <g key={t.id} style={{ cursor:'pointer' }}
                          onMouseEnter={() => setHov(t.id)}
                          onMouseLeave={() => setHov(null)}
                          onClick={() => onEdit({ type:'task', id:t.id })}>
                          <rect x={tx2+1} y={mbY+1} width={tw} height={mbH} rx="3" fill="rgba(0,0,0,0.05)" />
                          <rect x={tx2} y={mbY} width={tw} height={mbH} rx="3"
                            fill={tc+'30'}
                            stroke={isHovT ? tc : tc+'70'}
                            strokeWidth={isHovT ? 1.5 : 1} />
                          {/* Left stripe per person for identity */}
                          <rect x={tx2+1} y={mbY+1} width={3} height={mbH-2} rx="2"
                            fill={tc} />
                          {t.isC && <circle cx={tx2+tw-5} cy={mbY+5} r={4} fill="#EF4444" />}

                          {/* Label only if wide enough */}
                          {tw > 60 && <text x={tx2+8} y={rMid+1} dominantBaseline="middle"
                            fill={tc} fontSize="8.5" fontWeight="600"
                            style={{ pointerEvents:'none', userSelect:'none' }}>
                            {t.name.length > Math.floor((tw-12)/5) ? t.name.slice(0, Math.floor((tw-12)/5))+'…' : t.name}
                          </text>}
                        </g>
                      );
                    })}
                    {/* When collapsed: milestones as diamonds */}
                    {!isRExp && allTasks.filter(t => t.cd === 0).map(t => (
                      <polygon key={t.id}
                        points={`${txR(t.sd)},${rMid-5} ${txR(t.sd)+5},${rMid} ${txR(t.sd)},${rMid+5} ${txR(t.sd)-5},${rMid}`}
                        fill={taskColor(t)} opacity="0.7" />
                    ))}
                    <line x1={0} y1={ry2+RRH} x2={TD*dpx} y2={ry2+RRH}
                      stroke={isRExp ? NEUTRAL+'40' : '#2A2A3A'}
                      strokeWidth={isRExp ? 1 : 1} />
                  </g>
                );
              }
              const { rg: prg, pd, pr, y } = row;
              const { proj } = pd;
              const { per, tasks: pTasks } = pr;
              // Bars are now coloured by status, not by person/role:
              // - red if conflict
              // - neutral grey otherwise
              // - completed / overdue / dep-violated still get their dedicated colours below
              const by0 = y + (SRH-SBH)/2;
              const midY = y + SRH/2;
              return (
                <g key={`${proj.id}-${per.name}-bars`}>
                  <rect x={0} y={y} width={TD*dpx} height={SRH} fill="#13131A" />
                  <line x1={0} y1={y+SRH} x2={TD*dpx} y2={y+SRH} stroke="#2A2A3A" strokeWidth="1" />
                  {/* Reassignment ghosts — when a task has been reassigned AWAY
                      from this row's person, paint a greyed-out bar at the
                      task's original time slot on this (old-owner's) row.
                      The actual solid bar appears on the new owner's row. */}
                  {isSimulating && hasReassigns && Object.entries(reassignGhostMap).map(([taskId, info]) => {
                    if (info.oldPerson !== per.name || info.projId !== proj.id) return null;
                    if (!info.cd) return null; // skip milestones for clarity
                    const gx = txR(info.sd), gw = Math.max(info.cd*dpx, 4);
                    return (
                      <g key={taskId+'-ra-ghost'} style={{ pointerEvents:'none' }}>
                        <rect x={gx} y={by0} width={gw} height={SBH} rx="4"
                          fill={GHOST_GREY+'22'} stroke={GHOST_GREY} strokeWidth="1.5"
                          strokeDasharray="4 3" />
                        {gw > 50 && (
                          <text x={gx+gw/2} y={midY+1} textAnchor="middle" dominantBaseline="middle"
                            fill={GHOST_GREY} fontSize="9" fontStyle="italic" fontWeight="600">
                            → {pendingReassigns[taskId]?.to || ''}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {/* Ghost bars — old positions during a staged timeline shift.
                      Drawn first so the real (new-position) bars sit on top. */}
                  {isSimulating && pTasks.map(t => {
                    const g = ghostMap[t.id];
                    if (!g) return null;
                    const gx = txR(g.sd), gw = Math.max(g.cd*dpx, g.cd?4:0);
                    if (!g.cd) return (
                      <polygon key={t.id+'-ghost'}
                        points={`${gx},${midY-5} ${gx+5},${midY} ${gx},${midY+5} ${gx-5},${midY}`}
                        fill="none" stroke={GHOST_GREY} strokeWidth="1.5" strokeDasharray="3 2"
                        style={{pointerEvents:'none'}} />
                    );
                    return (
                      <rect key={t.id+'-ghost'}
                        x={gx} y={by0} width={gw} height={SBH} rx="4"
                        fill={GHOST_GREY+'22'} stroke={GHOST_GREY} strokeWidth="1.5"
                        strokeDasharray="4 3" style={{pointerEvents:'none'}} />
                    );
                  })}
                  {/* Movement lines — thin connector from each ghost to its new
                      position, with an arrowhead pointing the direction of the
                      shift. Makes it obvious at a glance "this moved from here
                      to there." Skipped for milestones (cd=0) and when the
                      task's position somehow didn't actually change. */}
                  {isSimulating && pTasks.map(t => {
                    const g = ghostMap[t.id];
                    if (!g || !g.cd) return null;
                    const gx = txR(g.sd), gw = Math.max(g.cd*dpx, 4);
                    const nx = txR(t.sd), nw = Math.max(t.cd*dpx, 4);
                    const forward = t.sd > g.sd;
                    // Draw from the trailing edge of the source to the leading
                    // edge of the target — for forward shifts, ghost's right
                    // edge → new bar's left edge; for backward, the opposite.
                    const x1 = forward ? gx + gw : gx;
                    const x2 = forward ? nx      : nx + nw;
                    // If the bars overlap (small shift), the line would be
                    // backwards or zero-length — skip in that case.
                    if (forward ? (x2 <= x1) : (x2 >= x1)) return null;
                    const ah = forward ? -4 : 4; // arrowhead offset direction
                    return (
                      <g key={t.id+'-mv'} style={{ pointerEvents:'none' }}>
                        <line x1={x1} y1={midY} x2={x2} y2={midY}
                          stroke={'#F97316'} strokeWidth="1.5" strokeDasharray="2 3"
                          opacity="0.85" />
                        <polygon
                          points={`${x2},${midY} ${x2+ah},${midY-3.5} ${x2+ah},${midY+3.5}`}
                          fill={'#F97316'} opacity="0.95" />
                      </g>
                    );
                  })}
                  {pTasks.map(t => {
                    const x = txR(t.sd), w = Math.max(t.cd*dpx, t.cd?4:0);
                    const ih = hov===t.id;
                    const dimmed = showDeps && hov && !hovRelated.has(t.id);
                    const c = colorsFor(t);          // { status, fill, stroke }
                    const effectiveStatus = c.status;
                    const effectiveCompleted = effectiveStatus === 'Completed';

                    if (!t.cd) return (
                      <polygon key={t.id}
                        points={`${x},${midY-5} ${x+5},${midY} ${x},${midY+5} ${x-5},${midY}`}
                        fill={c.fill} opacity={dimmed?0.2:0.85}
                        style={{cursor:'pointer'}}
                        onMouseEnter={()=>setHov(t.id)} onMouseLeave={()=>setHov(null)}
                        onClick={()=>onEdit({ type:'task', id:t.id })} />
                    );

                    // ── Bar colour logic ───────────────────────────────────
                    // Status drives both fill and stroke via colorsFor(). The
                    // exceptions: dep-violations get an amber dashed treatment
                    // (the dashes signal "broken constraint"), and a completed
                    // bar still uses the green family but with a much lower
                    // fill opacity so it visually recedes — done means done.
                    const barStroke = t.isDV && !effectiveCompleted ? STATUS_AMBER : c.stroke;
                    const barFill   = effectiveCompleted ? STATUS_GREEN+'18'
                                    : t.isDV             ? STATUS_AMBER+'14'
                                    : c.fill + '28';
                    const barDash = (t.isDV && !effectiveCompleted) ? '5 3' : 'none';
                    const labelColor = c.fill;
                    const labelDecoration = effectiveCompleted ? 'line-through' : 'none';

                    // Badge position. For normal-width bars the badge sits
                    // just inside the top-left. For very thin bars there's no
                    // room inside, so the badge floats just PAST the bar's
                    // right edge into the empty timeline space — far more
                    // visible than the old tiny corner dot.
                    const tinyBar = w < 18;
                    const badgeR  = tinyBar ? 6 : 7;
                    const badgeCx = tinyBar
                      ? x + w + badgeR + 1            // floats just right of the bar
                      : Math.min(x + 8, x + w - 5);   // tucked inside a wide bar
                    const badgeCy = by0 + 8;

                    return (
                      <g key={t.id} style={{cursor:'pointer'}} opacity={effectiveCompleted ? 0.55 : dimmed ? 0.28 : 1}
                        onMouseEnter={()=>setHov(t.id)} onMouseLeave={()=>setHov(null)}
                        onClick={()=>onEdit({ type:'task', id:t.id })}>

                        <rect x={x+2} y={by0+2} width={w} height={SBH} rx="4" fill="rgba(0,0,0,0.06)" />
                        <rect x={x} y={by0} width={w} height={SBH} rx="4"
                          fill={barFill}
                          stroke={barStroke}
                          strokeWidth={ih ? 2 : 1.5}
                          strokeDasharray={barDash} />
                        <rect x={x+1.5} y={by0+1.5} width={5} height={SBH-3} rx="3" fill={barStroke} />
                        {t.delay>0 && !effectiveCompleted && w>10 && <rect x={x+w-7} y={by0} width={7} height={SBH} fill="#FCA5A5" opacity="0.75" rx="4" />}
                        {w>52 && <text x={x+12} y={by0+SBH/2} dominantBaseline="middle"
                          fill={labelColor} fontSize="10" fontWeight="600"
                          textDecoration={labelDecoration}
                          style={{pointerEvents:'none',userSelect:'none'}}>
                          {(()=>{const mc=Math.floor((w-18)/5.8);return t.name.length>mc?t.name.slice(0,mc)+'…':t.name;})()}
                        </text>}

                        {/* Badge — completed ✓ takes priority, then conflict, fragile, overdue, DV.
                            Works for tiny bars too: badgeCx floats the badge just past the bar's
                            right edge when the bar is too thin to hold it. */}
                        {effectiveCompleted && <g style={{pointerEvents:'none'}}>
                          <circle cx={badgeCx} cy={badgeCy} r={badgeR} fill="#10B981" stroke="#13131A" strokeWidth="1.5" />
                          <text x={badgeCx} y={badgeCy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={tinyBar?'8':'9'} fontWeight="800">✓</text>
                        </g>}
                        {!effectiveCompleted && t.isC && <g style={{pointerEvents:'none'}}>
                          <circle cx={badgeCx} cy={badgeCy} r={badgeR} fill="#EF4444" stroke="#13131A" strokeWidth="1.5" />
                          <text x={badgeCx} y={badgeCy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={tinyBar?'8':'8.5'} fontWeight="800">!</text>
                        </g>}
                        {!effectiveCompleted && t.isOverdue && !t.isC && <g style={{pointerEvents:'none'}}>
                          <circle cx={badgeCx} cy={badgeCy} r={badgeR} fill="#F59E0B" stroke="#13131A" strokeWidth="1.5" />
                          <text x={badgeCx} y={badgeCy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={tinyBar?'8':'9'} fontWeight="800">⚠</text>
                        </g>}
                        {!effectiveCompleted && t.isF && !t.isC && !t.isOverdue && <g style={{pointerEvents:'none'}}>
                          <circle cx={badgeCx} cy={badgeCy} r={badgeR} fill="#FBBF24" stroke="#13131A" strokeWidth="1.5" />
                          <text x={badgeCx} y={badgeCy} textAnchor="middle" dominantBaseline="middle" fill="#0F172A" fontSize={tinyBar?'10':'11'} fontWeight="800" dy="0.5">~</text>
                        </g>}
                        {!effectiveCompleted && t.isDV && !t.isC && !t.isF && !t.isOverdue && <g style={{pointerEvents:'none'}}>
                          <circle cx={badgeCx} cy={badgeCy} r={badgeR} fill="#F59E0B" stroke="#13131A" strokeWidth="1.5" />
                          <text x={badgeCx} y={badgeCy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={tinyBar?'8':'9'} fontWeight="800">⊗</text>
                        </g>}

                        {/* Hover icons — pencil (edit) + checkmark (toggle complete) */}
                        {ih && w > 52 && <g>
                          <rect x={x+w-40} y={by0+SBH-15} width={16} height={13} rx="3" fill={barStroke} opacity="0.9" style={{pointerEvents:'none'}}/>
                          <text x={x+w-32} y={by0+SBH-9} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="700" style={{pointerEvents:'none'}}>✎</text>
                          <rect x={x+w-20} y={by0+SBH-15} width={16} height={13} rx="3"
                            fill={effectiveCompleted ? '#10B981' : '#374151'} opacity="0.95"
                            style={{cursor:'pointer'}}
                            onClick={e => { e.stopPropagation(); onToggleComplete(t.id); }} />
                          <text x={x+w-12} y={by0+SBH-9} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="800"
                            style={{pointerEvents:'none'}}>✓</text>
                        </g>}
                        {/* Narrow bar — only checkmark */}
                        {ih && w > 20 && w <= 52 && <g>
                          <rect x={x+w-20} y={by0+SBH-15} width={16} height={13} rx="3"
                            fill={effectiveCompleted ? '#10B981' : '#374151'} opacity="0.95"
                            style={{cursor:'pointer'}}
                            onClick={e => { e.stopPropagation(); onToggleComplete(t.id); }} />
                          <text x={x+w-12} y={by0+SBH-9} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="800"
                            style={{pointerEvents:'none'}}>✓</text>
                        </g>}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Dep lines — elbow routing, last so they paint on top */}
            {showDeps && (
              <g style={{ pointerEvents:'none' }}>
                {depLines.map((line, i) => {
                  const { from, to, projId, taskId, depId, type: depType } = line;
                  // Line goes red if either endpoint is a conflict task; neutral otherwise
                  const srcT = tasks.find(t => t.id === depId);
                  const dstT = tasks.find(t => t.id === taskId);
                  const pc = (srcT?.isC || dstT?.isC) ? CONFLICT_RED : NEUTRAL;
                  const isHov = hov && (hovRelated.has(taskId) || hovRelated.has(depId));
                  const opacity = hov ? (isHov ? 1 : 0.07) : 0.4;
                  const sw = isHov ? 2.5 : 1.5;
                  const r = 4;
                  const isFS = depType !== 'SS';

                  // ── Scale-aware horizontal offsets ────────────────────────
                  // The routing constants below used to be fixed pixel values
                  // (16, 10) tuned at the default zoom (dpx ≈ 9). When the
                  // project filter is on, dpx jumps to 20–48 and those fixed
                  // offsets became too small relative to the spread-out bars,
                  // making lines look cramped / out of whack.
                  //
                  // SIDE  — how far a line steps sideways before routing around
                  //         a bar. Grows with zoom but is clamped so it never
                  //         gets absurd.
                  // STUB  — the short horizontal nub off a bar edge before the
                  //         first turn.
                  // These are the knobs to tweak if the look still needs work.
                  const SIDE = Math.min(40, Math.max(16, dpx * 1.4));
                  const STUB = Math.min(24, Math.max(10, dpx * 0.9));

                  // FS: exits right edge of dep, enters left edge of target
                  // SS: exits left edge of dep, enters left edge of target
                  const x1 = isFS ? from.xe : from.xs;
                  const y1 = from.yc;
                  const x4 = to.xs;
                  const y4 = to.yc;

                  const gap      = x4 - x1;
                  const rowDiff  = y4 - y1;
                  const sameRow  = Math.abs(rowDiff) < 4;
                  const goDown   = rowDiff > 0;

                  let pathD;

                  if (!isFS) {
                    // ── SS routing: left exit → left entry ────────────────────
                    // Exit left from source, loop above/below, enter left of target
                    const loopX = Math.min(x1, x4) - SIDE;
                    if (sameRow) {
                      // Same row: loop above
                      const archY = y1 - SBH * 0.9;
                      pathD = [
                        `M ${x1} ${y1}`,
                        `L ${x1 - r} ${y1}`,
                        `Q ${loopX} ${y1} ${loopX} ${y1 - r}`,
                        `L ${loopX} ${archY + r}`,
                        `Q ${loopX} ${archY} ${loopX + r} ${archY}`,
                        `L ${x4 - r} ${archY}`,
                        `Q ${x4} ${archY} ${x4} ${archY + r}`,
                        `L ${x4} ${y4}`,
                      ].join(' ');
                    } else {
                      // Different rows: go left to loopX, then down/up, then right to target
                      const xMid = loopX;
                      pathD = [
                        `M ${x1} ${y1}`,
                        `L ${xMid + r} ${y1}`,
                        `Q ${xMid} ${y1} ${xMid} ${y1 + (goDown ? r : -r)}`,
                        `L ${xMid} ${y4 + (goDown ? -r : r)}`,
                        `Q ${xMid} ${y4} ${xMid + r} ${y4}`,
                        `L ${x4} ${y4}`,
                      ].join(' ');
                    }
                  } else if (sameRow && gap > 0) {
                    // ── FS, same row, forward: arch above ─────────────────────
                    const archY = y1 - SBH * 0.9;
                    pathD = [
                      `M ${x1} ${y1}`,
                      `L ${x1} ${archY + r}`,
                      `Q ${x1} ${archY} ${x1 + r} ${archY}`,
                      `L ${x4 - r} ${archY}`,
                      `Q ${x4} ${archY} ${x4} ${archY + r}`,
                      `L ${x4} ${y4}`,
                    ].join(' ');
                  } else if (sameRow && gap <= 0) {
                    // ── FS, same row, backward: loop below ────────────────────
                    const loopY  = y1 + SBH * 0.9;
                    const loopX  = Math.min(x1, x4) - SIDE;
                    pathD = [
                      `M ${x1} ${y1}`,
                      `L ${x1 + STUB} ${y1}`,
                      `Q ${x1 + STUB + r} ${y1} ${x1 + STUB + r} ${y1 + r}`,
                      `L ${x1 + STUB + r} ${loopY - r}`,
                      `Q ${x1 + STUB + r} ${loopY} ${x1 + STUB} ${loopY}`,
                      `L ${loopX + r} ${loopY}`,
                      `Q ${loopX} ${loopY} ${loopX} ${loopY - r}`,
                      `L ${loopX} ${y4 + r}`,
                      `Q ${loopX} ${y4} ${loopX + r} ${y4}`,
                      `L ${x4} ${y4}`,
                    ].join(' ');
                  } else if (gap >= r * 2) {
                    // ── FS, forward, different rows: standard elbow ───────────
                    const xMid = x1 + Math.max(gap / 2, r + 2);
                    pathD = [
                      `M ${x1} ${y1}`,
                      `L ${xMid - r} ${y1}`,
                      `Q ${xMid} ${y1} ${xMid} ${y1 + (goDown ? r : -r)}`,
                      `L ${xMid} ${y4 + (goDown ? -r : r)}`,
                      `Q ${xMid} ${y4} ${xMid + r} ${y4}`,
                      `L ${x4} ${y4}`,
                    ].join(' ');
                  } else if (gap > -SIDE) {
                    // ── FS, different rows, slight overlap / near-aligned ─────
                    // Target is only slightly behind (or barely ahead of) the
                    // source's end — not a TRUE backward dependency. A short
                    // step-out + drop reads far cleaner than the full loop.
                    // We route just past the source's right edge, drop to the
                    // target's row, and come in from the left. `xKnee` is
                    // clamped so it never lands left of where we started.
                    const xKnee = Math.max(x1 + STUB, x4 - STUB);
                    pathD = [
                      `M ${x1} ${y1}`,
                      `L ${xKnee - r} ${y1}`,
                      `Q ${xKnee} ${y1} ${xKnee} ${y1 + (goDown ? r : -r)}`,
                      `L ${xKnee} ${y4 + (goDown ? -r : r)}`,
                      `Q ${xKnee} ${y4} ${xKnee + r} ${y4}`,
                      `L ${x4} ${y4}`,
                    ].join(' ');
                  } else {
                    // ── FS, genuine backward dependency ───────────────────────
                    // Target starts meaningfully BEHIND the source's end, on a
                    // different row. A simple elbow can't reach it without
                    // cutting backward through content, so a tidy loop is
                    // correct here — this is the case we deliberately keep.
                    const loopX  = Math.min(x1, x4) - SIDE;
                    const midY   = y1 + rowDiff / 2;
                    pathD = [
                      `M ${x1} ${y1}`,
                      `L ${x1 + STUB} ${y1}`,
                      `Q ${x1 + STUB + r} ${y1} ${x1 + STUB + r} ${y1 + (goDown ? r : -r)}`,
                      `L ${x1 + STUB + r} ${midY + (goDown ? -r : r)}`,
                      `Q ${x1 + STUB + r} ${midY} ${x1 + STUB} ${midY}`,
                      `L ${loopX + r} ${midY}`,
                      `Q ${loopX} ${midY} ${loopX} ${midY + (goDown ? r : -r)}`,
                      `L ${loopX} ${y4 + (goDown ? -r : r)}`,
                      `Q ${loopX} ${y4} ${loopX + r} ${y4}`,
                      `L ${x4} ${y4}`,
                    ].join(' ');
                  }

                  // Arrowhead always points right into target left edge
                  const ax = x4, ay = y4;
                  const arrowPts = `${ax},${ay} ${ax-7},${ay-3.5} ${ax-7},${ay+3.5}`;

                  // Type label at midpoint of path (rough midpoint)
                  const labelX = (x1 + x4) / 2;
                  const labelY = sameRow ? (y1 - SBH * 0.9) : (y1 + rowDiff / 2);

                  return (
                    <g key={i} opacity={opacity}>
                      <path d={pathD} fill="none" stroke={pc} strokeWidth={sw}
                        strokeLinecap="round" strokeLinejoin="round"
                        strokeDasharray={depType === 'SS' ? '5 3' : 'none'} />
                      <polygon points={arrowPts} fill={pc} />
                      {/* Type label — only show when hovered or always if zoomed in */}
                      {(isHov || dpx >= 20) && (
                        <g>
                          <rect x={labelX - 9} y={labelY - 7} width={18} height={13} rx="3"
                            fill={pc} opacity="0.9" />
                          <text x={labelX} y={labelY + 0.5} textAnchor="middle" dominantBaseline="middle"
                            fill="white" fontSize="8" fontWeight="800" style={{ pointerEvents:'none' }}>
                            {depType || 'FS'}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        {/* Tooltip */}
        {ht && (() => {
          const pc = ht.isC ? CONFLICT_RED : NEUTRAL;
          const htPer = people.find(p => p.name === ht.person);
          const cNames = ht.cw.map(id => { const c = tasks.find(x => x.id === id); return c ? `${c.id} (${c.person})` : id; });
          const depIds = tdepMap[ht.id] || [];
          const depNames = depIds.map(did => { const dt = tasks.find(x => x.id === did); return dt ? `${did} – ${dt.name}` : did; });
          const ttx = Math.min(mouse.x + 14, (outerRef.current?.clientWidth || 800) - 240);
          const tty = Math.max(mouse.y - 130, 52);
          const nowMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
          const ttStatus =
            ht.isCompleted          ? 'Completed'  :
            ht.isOverdue            ? 'Overdue'    :
            ht.isC                  ? 'Conflict'   :
            ht.isF                  ? 'Fragile'    :
            ht.s.getTime() <= nowMs ? 'In Progress':
                                      'On Track';
          const ttStatusColor = {
            'Completed':'#34D399','Overdue':'#FB923C','Conflict':'#F87171',
            'Fragile':'#FBBF24','In Progress':'#38BDF8','On Track':'#4ADE80'
          }[ttStatus];
          return (
            <div style={{ position:'absolute', left:ttx, top:tty, pointerEvents:'none', background:'#0F172A', color:'white', padding:'12px 14px', borderRadius:'10px', fontSize:'12px', lineHeight:'1.65', boxShadow:'0 10px 30px rgba(0,0,0,0.3)', width:'228px', zIndex:50, borderTop:`3px solid ${pc}` }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'5px' }}>
                <div style={{ fontWeight:'700', fontSize:'12px', lineHeight:'1.35', flex:1, marginRight:'8px' }}>{ht.name}</div>
                <span style={{ fontSize:'10px', fontWeight:'700', color:ttStatusColor, whiteSpace:'nowrap', background:ttStatusColor+'18', padding:'2px 7px', borderRadius:'10px', border:`1px solid ${ttStatusColor}40` }}>{ttStatus}</span>
              </div>
              <div style={{ color:'#64748B', fontSize:'10px', marginBottom:'8px' }}>{ht.projId} · {ht.id} · {ht.person}</div>
              <div style={{ display:'grid', gridTemplateColumns:'60px 1fr', gap:'3px 8px', fontSize:'11px' }}>
                <span style={{ color:'#475569' }}>Role</span>
                <span style={{ color:htPer?.color||'#888', fontWeight:'600', fontSize:'10px' }}>{htPer?.role || '—'}</span>
                <span style={{ color:'#475569' }}>Start</span><span>{fd(ht.s)}</span>
                <span style={{ color:'#475569' }}>End</span><span>{fd(ht.e)}</span>
                <span style={{ color:'#475569' }}>Duration</span>
                <span>{ht.dur} working day{ht.dur !== 1 ? 's' : ''}{ht.delay ? ` (+${ht.delay}d delay)` : ''}</span>
              </div>
              {depNames.length > 0 && (
                <div style={{ marginTop:'8px', padding:'5px 8px', background:'rgba(255,255,255,0.06)', borderRadius:'4px', border:'1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize:'9px', letterSpacing:'0.08em', textTransform:'uppercase', color:'#475569', marginBottom:'3px', fontWeight:'700' }}>Depends on</div>
                  {depNames.map((n, i) => (
                    <div key={i} style={{ fontSize:'10px', color:'#94A3B8', display:'flex', alignItems:'center', gap:'5px' }}>
                      <span style={{ color:pc }}>→</span> {n}
                    </div>
                  ))}
                </div>
              )}
              {ht.isCompleted && <div style={{ marginTop:'8px', padding:'4px 8px', background:'rgba(52,211,153,0.15)', borderRadius:'4px', color:'#34D399', fontSize:'10px', fontWeight:'700', border:'1px solid rgba(52,211,153,0.3)' }}>
                ✓ COMPLETED · Click ✓ on bar to undo
              </div>}
              {ht.isOverdue && !ht.isCompleted && <div style={{ marginTop:'8px', padding:'4px 8px', background:'rgba(251,146,60,0.15)', borderRadius:'4px', color:'#FB923C', fontSize:'10px', fontWeight:'700', border:'1px solid rgba(251,146,60,0.3)' }}>
                ⚠ OVERDUE — end date has passed
              </div>}
              {ht.isC && !ht.isOverdue && <div style={{ marginTop:'8px', padding:'4px 8px', background:'rgba(239,68,68,0.18)', borderRadius:'4px', color:'#FCA5A5', fontSize:'10px', fontWeight:'700', border:'1px solid rgba(239,68,68,0.3)' }}>
                ⚠ CONFLICT — clashes with {cNames[0] || '?'} · Click to edit
              </div>}
              {ht.isF && !ht.isC && !ht.isOverdue && <div style={{ marginTop:'8px', padding:'4px 8px', background:'rgba(245,158,11,0.15)', borderRadius:'4px', color:'#FDE68A', fontSize:'10px', fontWeight:'700', border:'1px solid rgba(245,158,11,0.3)' }}>
                ⚡ FRAGILE — ≤1 working day gap to adjacent task
              </div>}
              {ht.isDV && <div style={{ marginTop:'8px', padding:'4px 8px', background:'rgba(245,158,11,0.18)', borderRadius:'4px', color:'#FDE68A', fontSize:'10px', fontWeight:'700', border:'1px solid rgba(245,158,11,0.35)', borderStyle:'dashed' }}>
                ⊗ DEP. VIOLATION — starts before prerequisite finishes
              </div>}
              <div style={{ marginTop:'6px', fontSize:'10px', color:'#475569', fontStyle:'italic' }}>Click to open editor</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}