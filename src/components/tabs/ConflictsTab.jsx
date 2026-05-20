// ── ConflictsTab ─────────────────────────────────────────────────────────────
// Lists all current conflicts and dependency violations with the mini-Gantt.

import { useState, useMemo } from 'react';
import { useSched } from '../../context.jsx';
import { fmtDate as fd } from '../../engine/dates.jsx';
import { CARD, BORDER, ORANGE, TEXT, MUTED } from '../../theme.jsx';
import { ConflictMiniGantt } from '../ConflictMiniGantt.jsx';

export function ConflictsTab({ tasks, pendingReassigns, onStageReassign, onCancelReassign, onEdit }) {
  const { rawTasks, projs, people, tdepMap, base, todayDay, periods } = useSched();

  const [subTab, setSubTab]     = useState('conflicts');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null); // person name whose row is expanded
  // `reassigned` is now sourced from App's staging state — local fallback to {}
  // keeps the component usable in isolation if props aren't passed.
  const reassigned = pendingReassigns || {};
  const [activeTask, setActiveTask] = useState(null);

  const conflicts   = useMemo(() => tasks.filter(t => t.isC).sort((a, b) => a.s - b.s), [tasks]);
  const depViolations = useMemo(() => tasks.filter(t => t.isDV && !t.isC).sort((a, b) => a.s - b.s), [tasks]);
  // Fragile = near-miss (same person, ≤1 day gap to a neighbour) but NOT in
  // actual conflict. Sorted chronologically for easy scanning.
  const fragile = useMemo(() => tasks.filter(t => t.isF && !t.isC).sort((a, b) => a.s - b.s), [tasks]);

  // Group conflicts by person
  const byPerson = useMemo(() => {
    const map = {};
    for (const t of conflicts) {
      if (!map[t.person]) map[t.person] = [];
      map[t.person].push(t);
    }
    return map;
  }, [conflicts]);

  // Filter by search
  const personEntries = Object.entries(byPerson).filter(([name]) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Reassignment candidate scoring ─────────────────────────────────────────
  // For a candidate C being considered to take task T:
  //   - prevGap = working days between (C's task ending just before T.start) → T.start
  //   - nextGap = working days between T.end → (C's task starting just after T.end)
  //   - margin  = min(prevGap, nextGap)  — the TIGHTEST squeeze in C's schedule
  // Candidates with negative gaps (would overlap T) are disqualified.
  // Best candidate = LARGEST margin (most breathing room even on the tight side).
  // Ties go to whoever has fewer total active tasks.
  const MS_PER_DAY = 864e5;
  const wdBetween = (earlier, later) => {
    // Working-day gap; if later <= earlier, returns 0 or negative as appropriate.
    if (!earlier || !later) return Infinity;
    if (later <= earlier) return -Math.ceil((earlier - later) / MS_PER_DAY); // negative = overlap
    let g = 0;
    const c = new Date(earlier);
    while (c < later) {
      c.setDate(c.getDate() + 1);
      if (c.getDay() % 6) g++;
    }
    return g;
  };

  const scoreCandidate = (candidatePerson, task) => {
    // Pull all the candidate's active tasks (excluding the conflicted one itself,
    // though it isn't theirs yet — defensive).
    const theirTasks = tasks
      .filter(t => t.person === candidatePerson.name && t.id !== task.id && t.cd > 0)
      .sort((a, b) => a.s - b.s);
    // Find the task that ends just before our task starts:
    const prev = [...theirTasks].reverse().find(t => t.e <= task.s);
    const next = theirTasks.find(t => t.s >= task.e);
    // Anyone whose existing task overlaps the conflicted task's window is
    // disqualified — they'd just create a new conflict.
    const overlapping = theirTasks.find(t => t.s < task.e && t.e > task.s);
    if (overlapping) return { disqualified: true, margin: -Infinity, prevGap: -Infinity, nextGap: -Infinity, load: theirTasks.length };
    const prevGap = prev ? wdBetween(prev.e, task.s) : Infinity;
    const nextGap = next ? wdBetween(task.e, next.s) : Infinity;
    return {
      disqualified: false,
      prevGap, nextGap,
      margin: Math.min(prevGap, nextGap),
      load: theirTasks.length,
    };
  };

  // Returns the candidates list, ranked. Each item has {...person, score}.
  // Same-role only — reassignment is between people who can actually do the work.
  const getRankedCandidates = task => {
    const owner = people.find(p => p.name === task.person);
    if (!owner) return [];
    const candidates = people
      .filter(p => p.role === owner.role && p.name !== task.person)
      .map(p => ({ ...p, score: scoreCandidate(p, task) }));
    // Sort: disqualified last; among the rest, largest margin first; ties → fewer tasks.
    candidates.sort((a, b) => {
      if (a.score.disqualified !== b.score.disqualified) return a.score.disqualified ? 1 : -1;
      if (b.score.margin !== a.score.margin) return b.score.margin - a.score.margin;
      return a.score.load - b.score.load;
    });
    return candidates;
  };

  const handleReassign = (taskId, toPerson, fromPerson) => {
    if (onStageReassign) onStageReassign(taskId, toPerson, fromPerson);
    setActiveTask(null);
  };
  const undoReassign = taskId => {
    if (onCancelReassign) onCancelReassign(taskId);
  };

  const RED = '#EF4444';

  return (
    <div style={{ background:'#13131A', minHeight:'500px' }}>

      {/* Sub-tab bar */}
      <div style={{ display:'flex', alignItems:'center', padding:'0 20px', borderBottom:`1px solid ${BORDER}`, background:CARD }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0', flex:1 }}>
          {[{id:'conflicts',l:'Conflicts',n:conflicts.length,c:'#EF4444'},{id:'fragile',l:'Fragile',n:fragile.length,c:'#FBBF24'},{id:'gantt',l:'Gantt View'}].map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              style={{ padding:'13px 16px', border:'none', background:'none', cursor:'pointer', fontSize:'13px', fontWeight: subTab===t.id ? '600' : '400', color: subTab===t.id ? ORANGE : MUTED, borderBottom: subTab===t.id ? `2px solid ${ORANGE}` : '2px solid transparent', marginBottom:'-1px', display:'flex', alignItems:'center', gap:'7px' }}>
              {t.l}
              {typeof t.n === 'number' && t.n > 0 && (
                <span style={{ fontSize:'10px', fontWeight:'700', color: t.c, background: t.c+'22', padding:'2px 6px', borderRadius:'10px', minWidth:'18px', textAlign:'center', lineHeight:'1.1' }}>{t.n}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <button style={{ padding:'5px 12px', borderRadius:'6px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer' }}>Full Timeline</button>
          <div style={{ position:'relative' }}>
            <select style={{ appearance:'none', WebkitAppearance:'none', padding:'5px 24px 5px 10px', borderRadius:'6px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'12px', cursor:'pointer', outline:'none' }}>
              <option>All Projects</option>
              {projs.map(p => <option key={p.id}>{p.id}</option>)}
            </select>
            <span style={{ position:'absolute', right:'7px', top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:MUTED, fontSize:'9px' }}>▾</span>
          </div>
        </div>
      </div>

      {subTab === 'conflicts' && (
        <div style={{ padding:'16px 20px' }}>

          {/* ALL summary row */}
          <div style={{ display:'flex', alignItems:'center', gap:'16px', padding:'12px 16px', borderRadius:'8px', background:CARD, border:`1px solid ${BORDER}`, marginBottom:'14px' }}>
            <span style={{ fontSize:'13px', fontWeight:'700', color:TEXT }}>ALL</span>
            <span style={{ fontSize:'12px', color:MUTED }}>ALL</span>
            <span style={{ fontSize:'13px', fontWeight:'700', color:RED }}>{conflicts.length} Conflicts</span>
            <span style={{ color:RED, fontSize:'12px' }}>▲</span>
          </div>

          {/* Filter + Search row */}
          <div style={{ display:'flex', gap:'10px', marginBottom:'14px' }}>
            <button style={{ display:'flex', alignItems:'center', gap:'6px', padding:'7px 14px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:CARD, color:TEXT, fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>
              <svg width="12" height="12" fill="none" viewBox="0 0 16 16"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Filter
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1, background:CARD, border:`1px solid ${BORDER}`, borderRadius:'8px', padding:'7px 12px' }}>
              <svg width="13" height="13" fill="none" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="5" stroke={MUTED} strokeWidth="1.5"/><path d="M10.5 10.5 14 14" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                style={{ border:'none', background:'transparent', color:TEXT, fontSize:'12px', outline:'none', flex:1 }} />
            </div>
          </div>

          {/* Person rows */}
          {personEntries.length === 0 && conflicts.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px', color:MUTED, fontSize:'13px' }}>
              <div style={{ fontSize:'28px', marginBottom:'10px' }}>✓</div>
              No conflicts — schedule is clean.
            </div>
          )}

          <div style={{ display:'grid', gap:'6px' }}>
            {personEntries.map(([person, ts]) => {
              const per = people.find(p => p.name === person);
              const isOpen = expanded === person;
              const pendingTs = ts.filter(t => !reassigned[t.id]);
              const resolvedTs = ts.filter(t => reassigned[t.id]);

              return (
                <div key={person}>
                  {/* Person row — matches Figma: name, role, conflict count, triangle */}
                  <div onClick={() => setExpanded(isOpen ? null : person)}
                    style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', borderRadius: isOpen ? '8px 8px 0 0' : '8px', background:CARD, border:`1px solid ${BORDER}`, cursor:'pointer', borderBottom: isOpen ? 'none' : undefined }}>
                    <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:per.color+'30', border:`1.5px solid ${per.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'700', color:per.color, flexShrink:0 }}>{per.init}</div>
                    <span style={{ fontSize:'14px', fontWeight:'600', color:TEXT, minWidth:'80px' }}>{person}</span>
                    <span style={{ fontSize:'12px', color:MUTED }}>{per.role}</span>
                    <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'13px', fontWeight:'700', color:RED }}>{pendingTs.length} Conflict{pendingTs.length !== 1 ? 's' : ''}</span>
                      <span style={{ color:RED, fontSize:'12px', transform: isOpen ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>▲</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ background:'#17171F', border:`1px solid ${BORDER}`, borderTop:'none', borderRadius:'0 0 8px 8px', padding:'12px 16px' }}>
                      {pendingTs.map(t => {
                        const pc = projs.find(p => p.id === t.projId)?.color || '#888';
                        const cNames = t.cw.map(id => { const c = tasks.find(x => x.id === id); return c ? `${c.projId} – ${c.name}` : id; });
                        const isTaskOpen = activeTask === t.id;
                        const candidates = getRankedCandidates(t);
                        const bestCandidate = candidates.find(c => !c.score.disqualified);
                        return (
                          <div key={t.id} style={{ marginBottom:'8px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius: isTaskOpen ? '6px 6px 0 0' : '6px', background:'#1C1C27', border:`1px solid #3B1219`, borderBottom: isTaskOpen ? 'none' : undefined }}>
                              <div style={{ width:'3px', height:'36px', borderRadius:'2px', background:pc, flexShrink:0 }} />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:'12px', fontWeight:'600', color:TEXT }}>{t.name}</div>
                                <div style={{ fontSize:'11px', color:MUTED, marginTop:'2px' }}>{t.projId} · {t.id} · {fd(t.s)} → {fd(t.e)}</div>
                                {cNames.length > 0 && <div style={{ fontSize:'10px', color:'#F87171', marginTop:'3px' }}>Clashes: {cNames.join(', ')}</div>}
                              </div>
                              <button onClick={e => { e.stopPropagation(); setActiveTask(isTaskOpen ? null : t.id); }}
                                style={{ padding:'4px 12px', borderRadius:'6px', border:`1px solid #7F1D1D`, background: isTaskOpen ? '#3B1219' : 'transparent', cursor:'pointer', fontSize:'11px', color:'#F87171', fontWeight:'600', flexShrink:0 }}>
                                {isTaskOpen ? 'Cancel' : 'Reassign ▾'}
                              </button>
                            </div>
                            {isTaskOpen && (
                              <div style={{ background:'#13131A', border:`1px solid #3B1219`, borderTop:'none', borderRadius:'0 0 6px 6px', padding:'10px 12px' }}>
                                <div style={{ fontSize:'10px', fontWeight:'700', color:MUTED, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Reassign to same-role colleague <span style={{ fontWeight:'500', textTransform:'none', letterSpacing:'normal', color:'#6B7280' }}>· ranked by schedule margin</span></div>
                                {candidates.map((c, ci) => {
                                  const dq = c.score.disqualified;
                                  const isRec = !dq && bestCandidate && c.name === bestCandidate.name;
                                  const marginLabel = dq
                                    ? 'Would overlap existing task'
                                    : c.score.margin === Infinity
                                      ? 'No surrounding tasks — fully open'
                                      : `Margin: ${c.score.margin}d (prev ${c.score.prevGap === Infinity ? '∞' : c.score.prevGap+'d'}, next ${c.score.nextGap === Infinity ? '∞' : c.score.nextGap+'d'})`;
                                  return (
                                    <div key={c.name}
                                      onClick={dq ? undefined : () => handleReassign(t.id, c.name, t.person)}
                                      style={{ display:'flex', alignItems:'center', gap:'10px', padding:'7px 10px', borderRadius:'6px', cursor: dq ? 'not-allowed' : 'pointer', marginBottom:'4px', background:'#1C1C27', border: isRec ? `1px solid #10B981` : `1px solid ${BORDER}`, opacity: dq ? 0.5 : 1 }}
                                      onMouseEnter={e => { if (!dq) e.currentTarget.style.background='#2A2A3A'; }}
                                      onMouseLeave={e => e.currentTarget.style.background='#1C1C27'}>
                                      <div style={{ width:'26px', height:'26px', borderRadius:'50%', background:c.color+'30', border:`1.5px solid ${c.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'9px', fontWeight:'700', color:c.color, flexShrink:0 }}>{c.init}</div>
                                      <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:'12px', fontWeight:'600', color:TEXT, display:'flex', alignItems:'center', gap:'6px' }}>
                                          {c.name}
                                          {isRec && <span style={{ fontSize:'9px', fontWeight:'700', color:'#10B981', background:'#0D2B1E', padding:'2px 6px', borderRadius:'10px', border:'1px solid #065F46', letterSpacing:'0.04em' }}>RECOMMENDED</span>}
                                        </div>
                                        <div style={{ fontSize:'10px', color:MUTED }}>{marginLabel}</div>
                                      </div>
                                      <span style={{ fontSize:'11px', color: dq ? '#EF4444' : (c.score.margin >= 3 ? '#10B981' : '#F59E0B'), fontWeight:'600', flexShrink:0 }}>
                                        {dq ? 'Conflict' : (c.score.margin === Infinity ? 'Open' : `${c.score.margin}d`)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {resolvedTs.length > 0 && (
                        <div style={{ marginTop:'8px' }}>
                          <div style={{ fontSize:'10px', color:'#10B981', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>✓ Reassigned</div>
                          {resolvedTs.map(t => {
                            const ra = reassigned[t.id];
                            const toPer = people.find(p => p.name === ra.to);
                            return (
                              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', borderRadius:'6px', background:'#0D2B1E', border:'1px solid #065F46', marginBottom:'4px' }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:'12px', fontWeight:'600', color:TEXT }}>{t.name}</div>
                                  <div style={{ fontSize:'11px', color:MUTED, display:'flex', alignItems:'center', gap:'6px', marginTop:'2px' }}>
                                    <span style={{ textDecoration:'line-through' }}>{ra.from}</span>
                                    <span>→</span>
                                    <span style={{ color:'#10B981', fontWeight:'600' }}>{ra.to}</span>
                                  </div>
                                </div>
                                <button onClick={() => undoReassign(t.id)} style={{ padding:'3px 9px', borderRadius:'6px', border:`1px solid ${BORDER}`, background:'transparent', cursor:'pointer', fontSize:'11px', color:MUTED }}>Undo</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Dep violations section */}
            {depViolations.length > 0 && (
              <div style={{ marginTop:'8px' }}>
                <div style={{ fontSize:'11px', fontWeight:'700', color:'#F59E0B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px', display:'flex', alignItems:'center', gap:'6px' }}>
                  <span style={{ width:'18px', height:'18px', borderRadius:'50%', background:'#F59E0B', color:'#0A0A0F', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'800' }}>⊗</span>
                  Dependency Violations ({depViolations.length})
                </div>
                {depViolations.map(t => {
                  const pc = projs.find(p => p.id === t.projId)?.color || '#888';
                  return (
                    <div key={t.id} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'10px 14px', borderRadius:'8px', background:CARD, border:`1px dashed #F59E0B`, marginBottom:'5px' }}>
                      <div style={{ width:'3px', height:'36px', borderRadius:'2px', background:pc, flexShrink:0, marginTop:'2px' }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:'12px', fontWeight:'600', color:TEXT }}>{t.name}</div>
                        <div style={{ fontSize:'11px', color:MUTED, marginTop:'2px' }}>{t.projId} · starts {fd(t.s)}</div>
                        {t.dvDeps.map((id, i) => {
                          const dep = tasks.find(x => x.id === id);
                          return <div key={i} style={{ fontSize:'10px', color:'#F59E0B', marginTop:'3px' }}>⊗ Needs: {id} — {dep?.name} (ends {dep ? fd(dep.e) : '?'})</div>;
                        })}
                      </div>
                      <span style={{ fontSize:'10px', fontWeight:'700', color:'#92400E', background:'#FEF3C7', padding:'2px 8px', borderRadius:'10px', flexShrink:0, border:'1px solid #FDE68A' }}>Sequencing</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'fragile' && (
        <div style={{ padding:'16px 24px' }}>
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'12px', fontWeight:'700', color:'#FBBF24', display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'14px', lineHeight:'1' }}>~</span>
              Fragile Tasks ({fragile.length})
            </div>
            <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>
              Tasks that don't currently conflict, but have ≤1 working day of slack to the next or previous task for the same person. A small delay anywhere could tip them into a real conflict.
            </div>
          </div>
          {fragile.length === 0 ? (
            <div style={{ padding:'40px 16px', textAlign:'center', color:MUTED, fontSize:'13px', background:CARD, borderRadius:'8px', border:`1px solid ${BORDER}` }}>
              ✓ No fragile tasks — every schedule has comfortable margins.
            </div>
          ) : (
            <div style={{ background:CARD, borderRadius:'8px', border:`1px solid ${BORDER}`, overflow:'hidden' }}>
              {fragile.map((t, i) => {
                // Find which neighbour task makes this one fragile (the one
                // within 1 day of either end) so we can show "tight against X".
                const sameP = tasks
                  .filter(o => o.person === t.person && o.id !== t.id && o.cd > 0)
                  .sort((a,b) => a.s - b.s);
                const before = [...sameP].reverse().find(o => o.e <= t.s);
                const after  = sameP.find(o => o.s >= t.e);
                const beforeGapMs = before ? (t.s - before.e) : Infinity;
                const afterGapMs  = after  ? (after.s - t.e)   : Infinity;
                const tightSide = beforeGapMs <= afterGapMs ? 'before' : 'after';
                const neighbour = tightSide === 'before' ? before : after;
                const gapDays = neighbour ? Math.max(0, Math.round((tightSide === 'before' ? beforeGapMs : afterGapMs) / 864e5)) : null;
                return (
                  <div key={t.id}
                    style={{ display:'flex', alignItems:'center', gap:'14px', padding:'12px 14px', borderBottom: i < fragile.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                    {/* yellow ~ badge */}
                    <div style={{ width:'26px', height:'26px', borderRadius:'50%', background:'#FBBF24'+'22', border:'1.5px solid #FBBF24', display:'flex', alignItems:'center', justifyContent:'center', color:'#FBBF24', fontSize:'13px', fontWeight:'800', flexShrink:0, lineHeight:'1' }}>~</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:TEXT, display:'flex', alignItems:'center', gap:'8px' }}>
                        <span style={{ color:'#FBBF24' }}>{t.projId}</span>
                        <span style={{ color:MUTED, fontWeight:'400' }}>·</span>
                        <span>{t.name}</span>
                      </div>
                      <div style={{ fontSize:'11px', color:MUTED, marginTop:'2px' }}>
                        {t.person}
                        {neighbour && (
                          <>
                            <span style={{ margin:'0 6px' }}>·</span>
                            {gapDays === 0 ? 'Back-to-back' : `${gapDays}d slack`} {tightSide} <span style={{ color:'#9CA3AF' }}>{neighbour.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button onClick={() => onEdit && onEdit({ type:'task', id:t.id })}
                      style={{ padding:'6px 12px', borderRadius:'6px', border:`1px solid ${BORDER}`, background:'transparent', color:TEXT, fontSize:'11px', fontWeight:'600', cursor:'pointer', flexShrink:0 }}>
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'gantt' && (
        <ConflictMiniGantt tasks={tasks} conflicts={conflicts} depViolations={depViolations} />
      )}
    </div>
  );
}