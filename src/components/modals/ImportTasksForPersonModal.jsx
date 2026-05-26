// ── ImportTasksForPersonModal ────────────────────────────────────────────────
// Resource-tab feature: import Schedule sheet tasks, scoped to a person.
// Per spec:
//   • Tasks with blank Assigned → auto-assigned to the currently-selected
//     person.
//   • Tasks with an explicit Assigned name → kept as-is. The user opts in
//     via a checkbox to import those (default off — the button was clicked
//     from a specific person's tab, so the cautious default is "this person
//     only").
//   • Every task must have a Project column. Referenced-but-missing projects
//     get auto-created (with a warning) — same behavior as the main import.

import { useState, useRef, useEffect, useMemo } from 'react';
import { parseTasksOnly } from '../../engine/xlsx.jsx';
import { CARD, BORDER, ORANGE, TEXT, MUTED } from '../../theme.jsx';

const STATUS_GREEN = '#10B981';
const STATUS_AMBER = '#F59E0B';

export function ImportTasksForPersonModal({ person, existingProjs, onImport, onClose }) {
  const fileRef = useRef(null);
  const [stage, setStage] = useState('idle');   // 'idle' | 'parsing' | 'review' | 'error'
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState(null);   // { rawTasks, peopleByName, unassignedCount, projectIds }
  // User decision: include tasks already assigned to OTHER people? Default off.
  const [includeOthers, setIncludeOthers] = useState(false);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStage('parsing');
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const result = await parseTasksOnly(buf);
      setParsed(result);
      setStage('review');
    } catch (err) {
      setError(err.message || 'Failed to read the file.');
      setStage('error');
    } finally {
      e.target.value = '';
    }
  };

  // Compute final breakdown of what would actually be imported.
  const breakdown = useMemo(() => {
    if (!parsed) return null;
    const safeProjs = Array.isArray(existingProjs) ? existingProjs : [];
    const knownProjIds = new Set(safeProjs.map(p => p.id));
    // Auto-assign blanks → selected person. Group everything else by explicit name.
    const forSelf  = [];
    const forOthers = {};  // name → array of tasks
    for (const t of parsed.rawTasks) {
      if (!t.person) {
        forSelf.push({ ...t, person: person?.name || '' });
      } else if (person && t.person.toLowerCase() === person.name.toLowerCase()) {
        forSelf.push(t);
      } else {
        if (!forOthers[t.person]) forOthers[t.person] = [];
        forOthers[t.person].push(t);
      }
    }
    const autoCreatedProjIds = (parsed.projectIds || []).filter(pid => !knownProjIds.has(pid));
    return {
      forSelf,
      forOthers,
      autoCreatedProjIds,
      othersTaskCount: Object.values(forOthers).reduce((s, arr) => s + arr.length, 0),
    };
  }, [parsed, existingProjs, person]);

  const handleConfirm = () => {
    if (!breakdown) return;
    let tasksToImport = [...breakdown.forSelf];
    if (includeOthers) {
      for (const arr of Object.values(breakdown.forOthers)) tasksToImport.push(...arr);
    }
    onImport && onImport({ tasks: tasksToImport });
    onClose && onClose();
  };

  const finalImportCount = breakdown
    ? breakdown.forSelf.length + (includeOthers ? breakdown.othersTaskCount : 0)
    : 0;

  return (
    <div onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:1000,
        background:'rgba(0,0,0,0.55)',
        display:'flex', alignItems:'center', justifyContent:'center',
        backdropFilter:'blur(2px)',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background:CARD, border:`1px solid ${BORDER}`, borderRadius:'12px',
          padding:'0', maxWidth:'600px', width:'92%', maxHeight:'85vh',
          display:'flex', flexDirection:'column',
          boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
        }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 14px', borderBottom:`1px solid ${BORDER}` }}>
          <div style={{ fontSize:'16px', fontWeight:'700', color:TEXT }}>
            Import tasks for {person?.name || 'this person'}
          </div>
          <div style={{ fontSize:'12px', color:MUTED, marginTop:'3px' }}>
            Rows with no assignee will go to {person?.name || 'them'}. Rows assigned to other people stay on those people (you can opt in below).
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:'18px 24px', overflowY:'auto', flex:1 }}>

          {/* IDLE */}
          {stage === 'idle' && (
            <div style={{
              padding:'30px 16px', textAlign:'center',
              background:'#13131A', borderRadius:'10px',
              border:`1.5px dashed ${BORDER}`,
            }}>
              <div style={{ fontSize:'13px', color:TEXT, marginBottom:'14px' }}>
                Pick an .xlsx file with a Schedule sheet.
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls"
                onChange={handleFile} style={{ display:'none' }} />
              <button onClick={() => fileRef.current?.click()}
                style={{
                  padding:'9px 22px', borderRadius:'8px', border:'none',
                  background: ORANGE, color:'white', fontSize:'12px', fontWeight:'700',
                  cursor:'pointer',
                }}>
                Choose file
              </button>
              <div style={{ fontSize:'10px', color:MUTED, marginTop:'12px', lineHeight:'1.5' }}>
                Required columns: Project, Task ID, Task Name, Start, End.<br />
                Optional: Assigned, Role, Rate, Dependencies.
              </div>
            </div>
          )}

          {/* PARSING */}
          {stage === 'parsing' && (
            <div style={{ padding:'40px 16px', textAlign:'center', color:MUTED, fontSize:'13px' }}>
              Reading file…
            </div>
          )}

          {/* ERROR */}
          {stage === 'error' && (
            <div style={{ padding:'14px 16px', borderRadius:'8px', background:'#3B1219', border:'1px solid #7F1D1D' }}>
              <div style={{ fontSize:'12px', fontWeight:'700', color:'#FCA5A5', marginBottom:'4px' }}>
                Could not read the file
              </div>
              <div style={{ fontSize:'11px', color:'#FCA5A5' }}>{error}</div>
              <button onClick={() => { setStage('idle'); setError(''); }}
                style={{
                  marginTop:'12px', padding:'6px 14px', borderRadius:'6px',
                  border:`1px solid #7F1D1D`, background:'transparent',
                  color:'#FCA5A5', fontSize:'11px', fontWeight:'600', cursor:'pointer',
                }}>
                Try again
              </button>
            </div>
          )}

          {/* REVIEW */}
          {stage === 'review' && parsed && breakdown && (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              {/* For self */}
              <SummaryRow
                color={STATUS_GREEN} icon="◉"
                title={`${breakdown.forSelf.length} task${breakdown.forSelf.length===1?'':'s'} for ${person?.name || 'this person'}`}
                body={
                  breakdown.forSelf.length === 0
                    ? `No tasks found that would go to ${person?.name || 'this person'}. Either all rows have a different assignee, or the file is missing the Assigned column.`
                    : `Includes ${parsed.unassignedCount} row${parsed.unassignedCount===1?'':'s'} with no assignee (auto-assigned) + any rows explicitly naming ${person?.name || 'this person'}.`
                } />

              {/* For others — opt-in */}
              {Object.keys(breakdown.forOthers).length > 0 && (
                <div style={{ padding:'12px 14px', background:'#13131A', borderRadius:'8px', border:`1px solid ${BORDER}` }}>
                  <label style={{ display:'flex', alignItems:'flex-start', gap:'10px', cursor:'pointer' }}>
                    <input type="checkbox" checked={includeOthers}
                      onChange={e => setIncludeOthers(e.target.checked)}
                      style={{ accentColor: ORANGE, cursor:'pointer', marginTop:'2px' }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'12px', fontWeight:'700', color:TEXT, marginBottom:'4px' }}>
                        Also import {breakdown.othersTaskCount} task{breakdown.othersTaskCount===1?'':'s'} for other people
                      </div>
                      <div style={{ fontSize:'11px', color:MUTED, lineHeight:'1.5' }}>
                        The file has tasks assigned to people other than {person?.name || 'the selected person'}. Off by default.
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginTop:'8px' }}>
                        {Object.entries(breakdown.forOthers).map(([name, ts]) => (
                          <span key={name} style={{
                            fontSize:'10px', padding:'3px 8px', borderRadius:'4px',
                            background:'#1A1A24', color:MUTED,
                            border:`1px solid ${BORDER}`,
                          }}>
                            {name} · {ts.length}
                          </span>
                        ))}
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {/* Auto-created projects warning */}
              {breakdown.autoCreatedProjIds.length > 0 && (
                <SummaryRow
                  color={STATUS_AMBER} icon="⚠"
                  title={`${breakdown.autoCreatedProjIds.length} project${breakdown.autoCreatedProjIds.length===1?'':'s'} will be auto-created`}
                  body="These project IDs aren't in your data yet. They'll be created as active projects.">
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginTop:'10px' }}>
                    {breakdown.autoCreatedProjIds.map(pid => (
                      <span key={pid} style={{
                        fontSize:'11px', padding:'3px 9px', borderRadius:'5px',
                        background:STATUS_AMBER+'18', color:STATUS_AMBER,
                        border:`1px solid ${STATUS_AMBER}40`,
                      }}>{pid}</span>
                    ))}
                  </div>
                </SummaryRow>
              )}

              {/* Nothing-to-import edge case */}
              {finalImportCount === 0 && (
                <SummaryRow
                  color={STATUS_AMBER} icon="!"
                  title="Nothing will be imported"
                  body={
                    breakdown.forSelf.length === 0 && breakdown.othersTaskCount > 0
                      ? `Toggle "Also import tasks for other people" to bring in the ${breakdown.othersTaskCount} task${breakdown.othersTaskCount===1?'':'s'} the file contains.`
                      : 'The file had no tasks that match the import criteria.'
                  } />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:`1px solid ${BORDER}`, display:'flex', justifyContent:'flex-end', gap:'10px', background:'#13131A', borderRadius:'0 0 12px 12px' }}>
          <button onClick={onClose}
            style={{
              padding:'8px 16px', borderRadius:'7px',
              border:`1px solid ${BORDER}`, background:'transparent',
              color:TEXT, fontSize:'12px', fontWeight:'600', cursor:'pointer',
            }}>
            Cancel
          </button>
          {stage === 'review' && finalImportCount > 0 && (
            <button onClick={handleConfirm}
              style={{
                padding:'8px 20px', borderRadius:'7px', border:'none',
                background: ORANGE, color:'white',
                fontSize:'12px', fontWeight:'700', cursor:'pointer',
              }}>
              Import {finalImportCount} task{finalImportCount===1?'':'s'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Local primitive ─────────────────────────────────────────────────────────
function SummaryRow({ color, icon, title, body, children }) {
  return (
    <div style={{ padding:'12px 14px', background:'#13131A', borderRadius:'8px', border:`1px solid ${BORDER}` }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:'10px' }}>
        <span style={{
          width:'22px', height:'22px', flexShrink:0,
          borderRadius:'50%', background:color+'22', color,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'11px', fontWeight:'800',
        }}>{icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'12px', fontWeight:'700', color:TEXT, marginBottom:'4px' }}>{title}</div>
          {body && <div style={{ fontSize:'11px', color:MUTED, lineHeight:'1.5' }}>{body}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}
