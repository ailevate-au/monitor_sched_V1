// ── ConflictResolutionPopover ────────────────────────────────────────────────
// Shown when user clicks the Hard Conflicts KPI card.
// Computes and previews the minimum schedule adjustment to clear all conflicts.

import { useMemo } from 'react';
import { useSched } from '../context.jsx';
import { computeResolution } from '../engine/schedule.jsx';
import { fmtDate as fd } from '../engine/dates.jsx';
import { BORDER, TEXT, FAINT, SURFACE, INSET, ORANGE, STATUS_TOKENS } from '../theme.jsx';
// Step 3: the two former decorative gradients (dark header, purple button)
// were replaced with a light header + solid-orange button to match the rest
// of the light theme.

export function ConflictResolutionPopover({ tasks, simDelays, onApply, onClose }) {
  const { rawTasks, projs, people, tdepMap, base, todayDay, periods } = useSched();

  const resolution = useMemo(() => computeResolution(rawTasks, tdepMap, base, projs, simDelays, tasks), [rawTasks, tdepMap, base, projs, simDelays, tasks]);

  if (!resolution) return (
    <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:200, background:'white', borderRadius:'14px', width:'320px', boxShadow:'0 16px 48px rgba(0,0,0,0.2)', border:`1px solid ${BORDER}`, padding:'20px 16px', textAlign:'center' }}>
      <div style={{ fontSize:'24px', marginBottom:'8px' }}>✓</div>
      <div style={{ fontSize:'13px', color:FAINT }}>No conflicts — schedule is clean.</div>
      <button onClick={onClose} style={{ marginTop:'12px', padding:'6px 16px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'white', cursor:'pointer', fontSize:'12px', color:FAINT }}>Close</button>
    </div>
  );

  const { addedDelays, affectedProjects, newEnd } = resolution;
  const totalDays = Object.values(addedDelays).reduce((s, v) => s + v, 0);

  return (
    <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:200, background:'white', borderRadius:'14px', width:'340px', boxShadow:'0 16px 48px rgba(0,0,0,0.22)', border:`1px solid ${BORDER}`, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'14px 16px 12px', background:SURFACE, borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ fontSize:'13px', fontWeight:'700', marginBottom:'2px', color:TEXT }}>✦ Auto-Resolve Conflicts</div>
        <div style={{ fontSize:'11px', color:FAINT }}>Suggested adjustment to eliminate all {tasks.filter(t=>t.isC).length} conflicts</div>
      </div>

      <div style={{ padding:'14px 16px' }}>
        {/* Summary tiles */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'14px' }}>
          {[
            { l:'Days added', v:`+${totalDays}d`, c:STATUS_TOKENS.WARN },
            { l:'Projects hit', v:affectedProjects.length, c:STATUS_TOKENS.INFO_INDIGO },
            { l:'New end', v:fd(newEnd), c:STATUS_TOKENS.OK },
          ].map(s => (
            <div key={s.l} style={{ padding:'8px', borderRadius:'8px', background:SURFACE, border:`1px solid ${INSET}`, textAlign:'center' }}>
              <div style={{ fontSize:'13px', fontWeight:'800', color:s.c, fontVariantNumeric:'tabular-nums' }}>{s.v}</div>
              <div style={{ fontSize:'9px', color:FAINT, marginTop:'2px', lineHeight:'1.3' }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* What changes */}
        <div style={{ fontSize:'10px', fontWeight:'700', color:FAINT, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>What will change</div>
        {Object.entries(addedDelays).map(([taskId, days]) => {
          const rawT = rawTasks.find(t => t.id === taskId);
          const p = projs.find(x => x.id === rawT?.proj);
          return (
            <div key={taskId} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', borderRadius:'6px', background:STATUS_TOKENS.WARN_SUBTLE, border:`1px solid ${STATUS_TOKENS.WARN_SUBTLE}`, marginBottom:'5px' }}>
              <div style={{ width:'3px', height:'28px', borderRadius:'2px', background:p?.color||'#888', flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'11px', fontWeight:'600', color:TEXT }}>{rawT?.name || taskId}</div>
                <div style={{ fontSize:'10px', color:FAINT }}>{rawT?.proj} · root task pushed to clear overlap</div>
              </div>
              <span style={{ fontSize:'11px', fontWeight:'700', color:STATUS_TOKENS.WARN_BORDER, flexShrink:0 }}>+{days}d</span>
            </div>
          );
        })}

        {affectedProjects.length > 0 && (
          <div style={{ marginTop:'10px', padding:'8px 10px', borderRadius:'8px', background:STATUS_TOKENS.WARN_SUBTLE, border:`1px solid ${STATUS_TOKENS.WARN_TEXT2}`, fontSize:'11px', color:STATUS_TOKENS.WARN_BORDER, lineHeight:'1.5' }}>
            ⚠ {affectedProjects.join(', ')} end dates will shift. Notify relevant stakeholders.
          </div>
        )}

        <div style={{ display:'flex', gap:'8px', marginTop:'14px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'9px', borderRadius:'8px', border:`1px solid ${BORDER}`, background:'white', cursor:'pointer', fontSize:'12px', color:FAINT, fontWeight:'500' }}>Cancel</button>
          <button onClick={() => { onApply(resolution.resDelays); onClose(); }}
            style={{ flex:2, padding:'9px', borderRadius:'8px', border:'none', background:ORANGE, color:'white', cursor:'pointer', fontSize:'12px', fontWeight:'700' }}>
            Apply Resolution →
          </button>
        </div>
      </div>
    </div>
  );
}