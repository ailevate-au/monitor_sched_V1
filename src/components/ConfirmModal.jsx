// ── ConfirmModal ─────────────────────────────────────────────────────────────
// Tiny reusable dialog for significant actions ("are you sure?"). Backdrop
// click and ESC both treat as cancel. Confirm button colour can be themed
// (orange default, red for destructive). Renders nothing when `open` is false.

import { useEffect } from 'react';
import { CARD, BORDER, ORANGE, TEXT, MUTED } from '../theme.jsx';

export function ConfirmModal({
  open, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  confirmColor = ORANGE,
  onConfirm, onCancel,
}) {
  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onCancel && onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position:'fixed', inset:0, zIndex:1000,
        background:'rgba(0,0,0,0.5)',
        display:'flex', alignItems:'center', justifyContent:'center',
        backdropFilter:'blur(2px)',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:CARD, border:`1px solid ${BORDER}`, borderRadius:'12px',
          padding:'24px 26px', maxWidth:'440px', width:'90%',
          boxShadow:'0 12px 40px rgba(0,0,0,0.5)',
        }}>
        <div style={{ fontSize:'16px', fontWeight:'700', color:TEXT, marginBottom:'10px' }}>{title}</div>
        <div style={{ fontSize:'13px', color:MUTED, lineHeight:'1.6', marginBottom:'22px' }}>{body}</div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
          <button onClick={onCancel}
            style={{
              padding:'8px 16px', borderRadius:'7px',
              border:`1px solid ${BORDER}`, background:'transparent',
              color:TEXT, fontSize:'12px', fontWeight:'600', cursor:'pointer',
            }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm}
            style={{
              padding:'8px 18px', borderRadius:'7px', border:'none',
              background:confirmColor, color:'white', fontSize:'12px',
              fontWeight:'700', cursor:'pointer',
            }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
