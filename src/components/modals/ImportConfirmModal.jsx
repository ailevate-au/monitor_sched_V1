// ── ImportConfirmModal ───────────────────────────────────────────────────────
// Post-parse confirmation step. Shown after parseXlsx completes IF the result
// has any items needing user attention:
//   • implicitPeople: assignees seen on tasks but NOT in the People sheet —
//       user picks which to add to the resource database via checkboxes.
//   • autoCreatedProjs: tasks referenced project IDs not in the Projects
//       sheet — surfaced as a warning so user can clean up next import.
//   • draftWithTasksWarnings: project IDs marked 'draft' in Projects sheet
//       but with tasks — kept as draft per spec, surfaced as a note.
//   • unassignedTaskCount: count of tasks imported without an assignee.
//
// On Confirm: returns the user's selection (which implicit people to keep).
// On Cancel: import is discarded.

import { useState, useEffect, useMemo } from 'react';
import { CARD, BORDER, ORANGE, TEXT, MUTED, SURFACE, CHIP, STATUS_GREEN, STATUS_AMBER } from '../../theme.jsx';

export function ImportConfirmModal({ pending, onConfirm, onCancel }) {
  // Initialize selection: every implicit person is checked by default
  // (the common case is "yes add them all"; opt-out is the exception).
  const [selected, setSelected] = useState(() => {
    const s = {};
    for (const p of (pending?.implicitPeople || [])) s[p.name] = true;
    return s;
  });

  // ESC cancels
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel && onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const implicit = pending?.implicitPeople || [];
  const autoProjs = pending?.autoCreatedProjs || [];
  const draftWarn = pending?.draftWithTasksWarnings || [];
  const unassignedCount = pending?.unassignedTaskCount || 0;

  const checkedCount = useMemo(
    () => implicit.filter(p => selected[p.name]).length,
    [implicit, selected]
  );

  const allChecked  = implicit.length > 0 && checkedCount === implicit.length;
  const noneChecked = checkedCount === 0;

  const toggleOne = name => setSelected(prev => ({ ...prev, [name]: !prev[name] }));
  const setAll = on => {
    const s = {};
    for (const p of implicit) s[p.name] = on;
    setSelected(s);
  };

  const handleConfirm = () => {
    const acceptedNames = new Set(implicit.filter(p => selected[p.name]).map(p => p.name));
    onConfirm({ acceptedImplicitPeople: acceptedNames });
  };

  return (
    <div
      onClick={onCancel}
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
        <div style={{ padding:'22px 26px 16px', borderBottom:`1px solid ${BORDER}` }}>
          <div style={{ fontSize:'17px', fontWeight:'700', color:TEXT, marginBottom:'4px' }}>
            Review import
          </div>
          <div style={{ fontSize:'12px', color:MUTED }}>
            Confirm what to include before the import is applied.
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ padding:'18px 26px', overflowY:'auto', flex:1 }}>

          {/* Auto-created projects warning */}
          {autoProjs.length > 0 && (
            <Section
              icon="⚠"
              accent={STATUS_AMBER}
              title={`${autoProjs.length} project${autoProjs.length===1?'':'s'} auto-created from task references`}
              body="These project IDs appeared on task rows but had no entry in the Projects sheet. They've been created as active projects. To suppress this warning next time, add them to a Projects sheet in your xlsx.">
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginTop:'10px' }}>
                {autoProjs.map(p => (
                  <span key={p.id} style={{
                    fontSize:'11px', padding:'4px 9px', borderRadius:'5px',
                    background:STATUS_AMBER+'18', color:STATUS_AMBER,
                    border:`1px solid ${STATUS_AMBER}40`,
                  }}>
                    {p.id} <span style={{ opacity:0.7 }}>· {p.taskCount} task{p.taskCount===1?'':'s'}</span>
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Draft-with-tasks warning */}
          {draftWarn.length > 0 && (
            <Section
              icon="ⓘ"
              accent={MUTED}
              title={`${draftWarn.length} project${draftWarn.length===1?'':'s'} kept as draft despite having tasks`}
              body="Your Projects sheet marks these as 'draft' but the Schedule sheet has tasks for them. Per the import rules, the Projects sheet wins — they'll remain drafts. Change the status in your sheet to 'active' if that wasn't intentional.">
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginTop:'10px' }}>
                {draftWarn.map(pid => (
                  <span key={pid} style={{
                    fontSize:'11px', padding:'4px 9px', borderRadius:'5px',
                    background:CHIP, color:TEXT,
                    border:`1px solid ${BORDER}`,
                  }}>{pid}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Unassigned tasks count */}
          {unassignedCount > 0 && (
            <Section
              icon="○"
              accent={MUTED}
              title={`${unassignedCount} task${unassignedCount===1?'':'s'} imported without an assignee`}
              body="These tasks have no person assigned. They'll appear in the schedule but won't count toward any person's workload until assigned." />
          )}

          {/* Implicit people checkboxes — the main interactive section */}
          {implicit.length > 0 && (
            <Section
              icon="◉"
              accent={STATUS_GREEN}
              title={`${implicit.length} new ${implicit.length===1?'person':'people'} found on task assignments`}
              body="These names appeared on task rows but aren't in your People sheet. Add them to the resource database?">
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'12px', marginBottom:'8px', paddingBottom:'8px', borderBottom:`1px solid ${BORDER}` }}>
                <span style={{ fontSize:'11px', color:MUTED }}>
                  {checkedCount} of {implicit.length} selected
                </span>
                <div style={{ flex:1 }} />
                <button onClick={() => setAll(true)} disabled={allChecked}
                  style={btnLink(allChecked)}>Select all</button>
                <button onClick={() => setAll(false)} disabled={noneChecked}
                  style={btnLink(noneChecked)}>Clear all</button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'2px', maxHeight:'240px', overflowY:'auto' }}>
                {implicit.map(p => {
                  const on = !!selected[p.name];
                  return (
                    <label key={p.name}
                      style={{
                        display:'flex', alignItems:'center', gap:'10px',
                        padding:'7px 10px', borderRadius:'6px', cursor:'pointer',
                        background: on ? STATUS_GREEN+'15' : 'transparent',
                        border:`1px solid ${on ? STATUS_GREEN+'40' : 'transparent'}`,
                      }}>
                      <input type="checkbox" checked={on} onChange={() => toggleOne(p.name)}
                        style={{ accentColor: STATUS_GREEN, cursor:'pointer' }} />
                      <span style={{ fontSize:'12px', fontWeight:'600', color:TEXT, flex:1 }}>{p.name}</span>
                      {p.role && (
                        <span style={{ fontSize:'10px', color:MUTED, padding:'2px 6px', background:CHIP, borderRadius:'4px' }}>
                          {p.role}
                        </span>
                      )}
                      <span style={{ fontSize:'10px', color:MUTED, minWidth:'60px', textAlign:'right' }}>
                        {p.taskCount} task{p.taskCount===1?'':'s'}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div style={{ fontSize:'10px', color:MUTED, marginTop:'10px', fontStyle:'italic' }}>
                Unchecked people will be removed entirely; their task assignments
                will be cleared (those tasks will become unassigned).
              </div>
            </Section>
          )}

          {/* Empty state — should rarely fire because the modal only opens
              when there's at least one pending item, but defensive. */}
          {autoProjs.length === 0 && implicit.length === 0 && draftWarn.length === 0 && unassignedCount === 0 && (
            <div style={{ padding:'40px 16px', textAlign:'center', color:MUTED, fontSize:'13px' }}>
              Nothing to review. Click Confirm to apply the import.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 26px', borderTop:`1px solid ${BORDER}`, display:'flex', justifyContent:'flex-end', gap:'10px' }}>
          <button onClick={onCancel}
            style={{
              padding:'8px 16px', borderRadius:'7px',
              border:`1px solid ${BORDER}`, background:'transparent',
              color:TEXT, fontSize:'12px', fontWeight:'600', cursor:'pointer',
            }}>
            Cancel import
          </button>
          <button onClick={handleConfirm}
            style={{
              padding:'8px 20px', borderRadius:'7px', border:'none',
              background:ORANGE, color:'white', fontSize:'12px',
              fontWeight:'700', cursor:'pointer',
            }}>
            ✓ Confirm import
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small UI primitives (local) ──────────────────────────────────────────────
function Section({ icon, accent, title, body, children }) {
  return (
    <div style={{ marginBottom:'18px', padding:'14px 16px', background:SURFACE, borderRadius:'8px', border:`1px solid ${BORDER}` }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:'10px' }}>
        <span style={{
          width:'22px', height:'22px', flexShrink:0,
          borderRadius:'50%', background:accent+'22', color:accent,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'12px', fontWeight:'800',
        }}>{icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'13px', fontWeight:'700', color:TEXT, marginBottom:'4px' }}>{title}</div>
          {body && <div style={{ fontSize:'11px', color:MUTED, lineHeight:'1.5' }}>{body}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

const btnLink = (disabled) => ({
  padding:'4px 10px', borderRadius:'5px', border:`1px solid ${BORDER}`,
  background:'transparent', color: disabled ? MUTED : TEXT,
  fontSize:'10px', fontWeight:'600',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});