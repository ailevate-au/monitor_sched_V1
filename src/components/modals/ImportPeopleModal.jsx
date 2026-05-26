// ── ImportPeopleModal ────────────────────────────────────────────────────────
// Resource-tab feature: import People sheet from an xlsx into the resource pool.
// Per spec:
//   • Reads ONLY the People sheet. Schedule sheet (if present) is ignored
//     with a note.
//   • Duplicates (case-insensitive name match) skipped silently — the user
//     gets a count in the summary.
//   • Optional fields (role, rate, capacity, skills) are pass-through.

import { useState, useRef, useEffect } from 'react';
import { parsePeopleOnly } from '../../engine/xlsx.jsx';
import { CARD, BORDER, ORANGE, TEXT, MUTED } from '../../theme.jsx';

const STATUS_GREEN = '#10B981';
const STATUS_AMBER = '#F59E0B';

export function ImportPeopleModal({ existingPeople, onImport, onClose }) {
  const fileRef = useRef(null);
  const [stage, setStage] = useState('idle');   // 'idle' | 'parsing' | 'review' | 'error'
  const [error, setError] = useState('');
  // After parse: { people, ignoredSchedule, ignoredProjects }
  const [parsed, setParsed] = useState(null);

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
      const result = await parsePeopleOnly(buf);
      setParsed(result);
      setStage('review');
    } catch (err) {
      setError(err.message || 'Failed to read the file.');
      setStage('error');
    } finally {
      e.target.value = '';
    }
  };

  // Compute new-vs-existing split for the review screen
  const safeExisting = Array.isArray(existingPeople) ? existingPeople : [];
  const existingNamesLower = new Set(safeExisting.map(p => p.name.toLowerCase()));
  const splitByExisting = (parsed?.people || []).reduce((acc, p) => {
    if (existingNamesLower.has(p.name.toLowerCase())) acc.skip.push(p);
    else acc.add.push(p);
    return acc;
  }, { add: [], skip: [] });

  const handleConfirm = () => {
    if (!parsed) return;
    onImport && onImport({ people: splitByExisting.add });
    onClose && onClose();
  };

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
          padding:'0', maxWidth:'540px', width:'92%', maxHeight:'85vh',
          display:'flex', flexDirection:'column',
          boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
        }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 14px', borderBottom:`1px solid ${BORDER}` }}>
          <div style={{ fontSize:'16px', fontWeight:'700', color:TEXT }}>
            Import people from xlsx
          </div>
          <div style={{ fontSize:'12px', color:MUTED, marginTop:'3px' }}>
            Reads only the People sheet. New people are added; existing names are skipped.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:'18px 24px', overflowY:'auto', flex:1 }}>

          {/* IDLE — file picker */}
          {stage === 'idle' && (
            <div style={{
              padding:'30px 16px', textAlign:'center',
              background:'#13131A', borderRadius:'10px',
              border:`1.5px dashed ${BORDER}`,
            }}>
              <div style={{ fontSize:'13px', color:TEXT, marginBottom:'14px' }}>
                Pick an .xlsx file with a "People", "Resources", or "Team" sheet.
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
                Expected columns: Name (required), Role, Rate, Color,<br />
                Weekly Capacity (1-7), Skills (comma-separated).
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
          {stage === 'review' && parsed && (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <SummaryRow
                color={STATUS_GREEN} icon="◉"
                title={`${splitByExisting.add.length} new ${splitByExisting.add.length===1?'person':'people'} will be added`}>
                {splitByExisting.add.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginTop:'10px', maxHeight:'200px', overflowY:'auto' }}>
                    {splitByExisting.add.map(p => (
                      <div key={p.name} style={{
                        display:'flex', alignItems:'center', gap:'10px',
                        padding:'6px 10px', borderRadius:'6px', background:'#0F0F18',
                      }}>
                        <span style={{ fontSize:'12px', fontWeight:'600', color:TEXT, flex:1 }}>{p.name}</span>
                        {p.role && (
                          <span style={{ fontSize:'10px', color:MUTED, padding:'2px 6px', background:'#1A1A24', borderRadius:'4px' }}>{p.role}</span>
                        )}
                        {p.weeklyCapacity && p.weeklyCapacity !== 5 && (
                          <span style={{ fontSize:'10px', color:MUTED }}>{p.weeklyCapacity}d/wk</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SummaryRow>

              {splitByExisting.skip.length > 0 && (
                <SummaryRow
                  color={MUTED} icon="↷"
                  title={`${splitByExisting.skip.length} skipped (already in your pool)`}
                  body={splitByExisting.skip.map(p => p.name).join(', ')} />
              )}

              {parsed.ignoredSchedule && (
                <SummaryRow
                  color={STATUS_AMBER} icon="ⓘ"
                  title="Schedule sheet ignored"
                  body="This file also has a Schedule sheet. To import its tasks, use the main Import button in the toolbar." />
              )}

              {splitByExisting.add.length === 0 && splitByExisting.skip.length === 0 && (
                <SummaryRow
                  color={STATUS_AMBER} icon="!"
                  title="No valid people found"
                  body="The People sheet was empty or rows had no name. Check the file format." />
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
          {stage === 'review' && splitByExisting.add.length > 0 && (
            <button onClick={handleConfirm}
              style={{
                padding:'8px 20px', borderRadius:'7px', border:'none',
                background: ORANGE, color:'white',
                fontSize:'12px', fontWeight:'700', cursor:'pointer',
              }}>
              Add {splitByExisting.add.length} {splitByExisting.add.length===1?'person':'people'}
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
