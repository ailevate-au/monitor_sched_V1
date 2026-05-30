// ── AddPersonModal ───────────────────────────────────────────────────────────
// Add a person to the resource pool manually. Only `name` is required.
// Everything else has a sensible default and can be edited later.
//
// Triggered from the PeopleTab's "+ Add Person" button (sidebar header).
// On confirm, routes through the standard `addPerson` mutation in edits.jsx
// so the action is history-logged like every other change.

import { useState, useEffect } from 'react';
import { CARD, BORDER, ORANGE, TEXT, MUTED, INSET, PANEL, STATUS_TOKENS } from '../../theme.jsx';

export function AddPersonModal({ existingPeople, onAdd, onClose }) {
  const [name,    setName]    = useState('');
  const [role,    setRole]    = useState('');
  const [rate,    setRate]    = useState('');
  const [cap,     setCap]     = useState('');   // weekly capacity, optional, default 5
  const [skills,  setSkills]  = useState('');   // comma-separated, optional
  const [error,   setError]   = useState('');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAdd = () => {
    setError('');
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    // Block duplicate names — they're de-facto unique identifiers in the engine.
    const safeExisting = Array.isArray(existingPeople) ? existingPeople : [];
    if (safeExisting.find(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`A person named "${trimmed}" already exists.`);
      return;
    }
    // Optional fields → only include when actually filled.
    const person = { name: trimmed };
    if (role.trim()) person.role = role.trim();
    if (rate.trim()) person.rate = rate.trim();
    if (cap.trim()) {
      const n = Number(cap);
      if (Number.isFinite(n) && n > 0 && n <= 7) person.weeklyCapacity = n;
      else { setError('Weekly capacity must be a number between 1 and 7.'); return; }
    }
    if (skills.trim()) {
      person.skills = skills.split(',').map(s => s.trim()).filter(Boolean);
    }
    onAdd && onAdd({ person });
    onClose && onClose();
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
          padding:'0', maxWidth:'460px', width:'92%',
          display:'flex', flexDirection:'column',
          boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
        }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 14px', borderBottom:`1px solid ${BORDER}` }}>
          <div style={{ fontSize:'16px', fontWeight:'700', color:TEXT, marginBottom:'3px' }}>
            Add person to resource pool
          </div>
          <div style={{ fontSize:'12px', color:MUTED }}>
            Only the name is required. You can fill in the rest later.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:'18px 24px', display:'flex', flexDirection:'column', gap:'12px' }}>
          <Field label="Name *" required>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Sam Rivera" autoFocus style={INPUT_STYLE} />
          </Field>
          <Field label="Role (optional)">
            <input value={role} onChange={e => setRole(e.target.value)}
              placeholder="e.g. Architect, Draftee, Site Engineer" style={INPUT_STYLE} />
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <Field label="Weekly capacity (optional, default 5)">
              <input value={cap} onChange={e => setCap(e.target.value)}
                placeholder="5" inputMode="numeric" style={INPUT_STYLE} />
            </Field>
            <Field label="Rate (optional)">
              <input value={rate} onChange={e => setRate(e.target.value)}
                placeholder="$42/hr" style={INPUT_STYLE} />
            </Field>
          </div>
          <Field label="Skills (optional, comma-separated)">
            <input value={skills} onChange={e => setSkills(e.target.value)}
              placeholder="e.g. BIM, Concrete, Permits" style={INPUT_STYLE} />
          </Field>

          {error && (
            <div style={{ padding:'9px 12px', borderRadius:'7px', background:STATUS_TOKENS.DANGER_SUBTLE, border:`1px solid ${STATUS_TOKENS.DANGER_BORDER}`, color:STATUS_TOKENS.DANGER_TEXT, fontSize:'12px' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:`1px solid ${BORDER}`, display:'flex', justifyContent:'flex-end', gap:'10px', background:PANEL, borderRadius:'0 0 12px 12px' }}>
          <button onClick={onClose}
            style={{
              padding:'8px 16px', borderRadius:'7px',
              border:`1px solid ${BORDER}`, background:'transparent',
              color:TEXT, fontSize:'12px', fontWeight:'600', cursor:'pointer',
            }}>
            Cancel
          </button>
          <button onClick={handleAdd}
            style={{
              padding:'8px 20px', borderRadius:'7px', border:'none',
              background: ORANGE, color:'white',
              fontSize:'12px', fontWeight:'700', cursor:'pointer',
            }}>
            + Add person
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Local primitives ─────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize:'11px', color:MUTED, marginBottom:'5px' }}>{label}</div>
      {children}
    </div>
  );
}

const INPUT_STYLE = {
  width:'100%', padding:'8px 10px', borderRadius:'7px',
  border:`1px solid ${BORDER}`, background:INSET, color:TEXT,
  fontSize:'12px', outline:'none', boxSizing:'border-box',
};