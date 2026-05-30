// ── DashboardTab ─────────────────────────────────────────────────────────────
// At-a-glance landing view. Wired cards show real data from the engine; cards
// for features that don't have data yet show a "Not connected yet" state with
// a structured TODO list of what's needed to enable them. This keeps the
// dashboard honest (no fake numbers) while preserving the layout intent.

import { useMemo, useState } from 'react';
import { useSched } from '../../context.jsx';
import { CARD, BORDER, ORANGE, TEXT, MUTED, CANVAS, CHIP, TASK_BLUE, STATUS_GREEN, STATUS_AMBER, STATUS_RED, STATUS_TOKENS, SHADOW_SM } from '../../theme.jsx';

// ── Visual palette (status colours, matches the rest of the app) ─────────────
// status + task colours now sourced from theme tokens

// ── Small primitives ─────────────────────────────────────────────────────────
/** Card frame used by every dashboard tile. */
function Card({ title, subtitle, children, action, style }) {
  return (
    <div style={{
      background:CARD, borderRadius:'10px', padding:'18px 20px',
      border:`1px solid ${BORDER}`, boxShadow:SHADOW_SM, ...style,
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: subtitle ? '2px' : '14px' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:'600', color:TEXT }}>{title}</div>
          {subtitle && <div style={{ fontSize:'11px', color:MUTED, marginTop:'2px' }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {subtitle && <div style={{ marginTop:'12px' }} />}
      {children}
    </div>
  );
}

/** Demo wrapper — shows a "DEMO" tag and a one-line "not computed yet" note,
    then renders fake-but-realistic-looking content underneath. */
function DemoOverlay({ note, children }) {
  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
        <span style={{
          display:'inline-block', fontSize:'10px', fontWeight:'700',
          color:STATUS_TOKENS.WARN_BADGE, background:STATUS_TOKENS.WARN_BADGE+'18',
          padding:'3px 8px', borderRadius:'4px', letterSpacing:'0.08em',
          border:'1px solid '+STATUS_TOKENS.WARN_BADGE+'40',
        }}>DEMO</span>
        <span style={{ fontSize:'11px', color:MUTED, fontStyle:'italic' }}>
          {note || 'Values not computed yet — preview only.'}
        </span>
      </div>
      <div style={{ opacity:0.85 }}>{children}</div>
    </div>
  );
}

// ── Project Health donut ─────────────────────────────────────────────────────
// Pure-SVG donut chart. Total = projs.length. Segments come from the supplied
// breakdown {onTrack, atRisk, conflict}. Empty middle shows the total count.
function ProjectHealthDonut({ counts, total }) {
  const r = 64, sw = 18, cx = 96, cy = 96;
  const circumference = 2 * Math.PI * r;
  // Compute arc lengths
  const segs = [
    { key:'onTrack',  val: counts.onTrack,  color: STATUS_GREEN, label:'On Track' },
    { key:'atRisk',   val: counts.atRisk,   color: STATUS_AMBER, label:'At Risk (Fragile)' },
    { key:'conflict', val: counts.conflict, color: STATUS_RED,   label:'Conflict' },
  ];
  let offset = 0;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'24px' }}>
      <svg width="192" height="192" viewBox="0 0 192 192">
        {/* Background ring (so empty/zero state still draws nicely) */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={BORDER} strokeWidth={sw} />
        {total > 0 && segs.map(s => {
          if (!s.val) return null;
          const len = (s.val / total) * circumference;
          const dash = `${len} ${circumference - len}`;
          const el = (
            <circle key={s.key}
              cx={cx} cy={cy} r={r} fill="none"
              stroke={s.color} strokeWidth={sw}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += len;
          return el;
        })}
        {/* Centre count */}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fill={TEXT} fontSize="28" fontWeight="800" fontFamily="-apple-system,system-ui,sans-serif">
          {total}
        </text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px', fontSize:'12px' }}>
        {segs.map(s => {
          const pct = total > 0 ? Math.round((s.val / total) * 100) : 0;
          return (
            <div key={s.key} style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:'180px' }}>
              <span style={{ width:'9px', height:'9px', borderRadius:'50%', background:s.color, flexShrink:0 }} />
              <span style={{ color:TEXT, flex:1 }}>{s.label}</span>
              <span style={{ color:MUTED, fontVariantNumeric:'tabular-nums' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function DashboardTab({ tasks, kpi, projRisk, crossRisk, onSchedulePct, onGoToTab, onImport, isEmpty }) {
  // useSched returns null when there's no data; guard so we still render.
  const ctx = useSched();
  const projs = ctx?.projs || [];
  const people = ctx?.people || [];
  const todayDay = ctx?.todayDay ?? 0;
  const safeTasks    = tasks || [];
  const safeKpi      = kpi    || { fragile: 0, conflicts: 0 };
  const safeProjRisk = projRisk  || [];
  const safeCross    = crossRisk || [];
  const safeOnPct    = typeof onSchedulePct === 'number' ? onSchedulePct : 0;

  // ── Resource utilization window (30 / 60 / 90 working days) ───────────────
  // Per the spec, the same data is shown three ways at the user's choice.
  // Default 60. Stored in component-local state so changing it doesn't
  // affect anything else in the app.
  const [utilWindow, setUtilWindow] = useState(60);
  // Under-utilization threshold (spec FR-1.05/BR-1.04, default 20%).
  // Surfaced here as a constant for now; a settings affordance can wire to it later.
  const UNDER_UTIL_THRESHOLD = 20;

  // ── Resource Allocation: per-person utilization over rolling window ───────
  // Formula (per the locked spec):
  //   util = (tasked working days in window) / (window × weeklyCapacity / 5)
  // - "tasked working days in window" = sum of overlap between each task's
  //   [sd, sd+cd) range and [todayDay, todayDay + window)
  // - weeklyCapacity defaults to 5 if not set on the person
  // - Completed tasks are excluded (they don't consume future capacity).
  // Buckets:
  //   under     < UNDER_UTIL_THRESHOLD (default 20)
  //   optimal   20..70
  //   heavy     70..90
  //   at-cap    90..100
  // Over-allocation (>100%) is structurally impossible in this engine — it
  // surfaces as a conflict on the schedule, not as a utilization number.
  const resourceUtil = useMemo(() => {
    if (!people.length) return [];
    const windowEnd = todayDay + utilWindow;
    const result = [];
    for (const per of people) {
      const cap = typeof per.weeklyCapacity === 'number' && per.weeklyCapacity > 0
        ? per.weeklyCapacity : 5;
      let workingDays = 0;
      for (const t of safeTasks) {
        if (t.person !== per.name) continue;
        if (t.isCompleted) continue;
        if (t.isMilestone) continue;  // milestones are zero-work events, don't consume capacity
        if (!t.cd || t.cd === 0) continue;
        // Clip the task's range to the window
        const taskStart = t.sd;
        const taskEnd = t.sd + t.cd;  // exclusive
        const overlapStart = Math.max(taskStart, todayDay);
        const overlapEnd   = Math.min(taskEnd, windowEnd);
        if (overlapEnd > overlapStart) {
          workingDays += (overlapEnd - overlapStart);
        }
      }
      const denominator = utilWindow * (cap / 5);
      const pct = denominator > 0 ? Math.round((workingDays / denominator) * 100) : 0;
      // Cap display at 100 — see comment above.
      const displayPct = Math.min(pct, 100);
      const bucket =
        displayPct < UNDER_UTIL_THRESHOLD ? 'under' :
        displayPct < 70                   ? 'optimal' :
        displayPct < 90                   ? 'heavy' :
                                            'at-cap';
      result.push({
        name: per.name,
        role: per.role || '',
        init: per.init || '',
        color: per.color,
        weeklyCapacity: cap,
        workingDays,
        pct: displayPct,
        bucket,
      });
    }
    // Sort by utilization descending so the busiest people surface first
    result.sort((a, b) => b.pct - a.pct);
    return result;
  }, [people, safeTasks, todayDay, utilWindow]);

  // Project Health breakdown: each project is in EXACTLY one bucket.
  // Conflict > At Risk (fragile) > On Track. Mirrors the bar-colouring rule
  // (one status per task) at the project level.
  const projectHealth = useMemo(() => {
    const conflictSet = new Set([...safeProjRisk.map(p => p.id), ...safeCross.map(p => p.id)]);
    let conflict = conflictSet.size;
    let atRisk = 0;
    for (const p of projs) {
      if (conflictSet.has(p.id)) continue;
      const pt = safeTasks.filter(t => t.projId === p.id && !t.isCompleted);
      if (pt.some(t => t.isF || t.isDV || t.isOverdue)) atRisk++;
    }
    const onTrack = Math.max(0, projs.length - conflict - atRisk);
    return { conflict, atRisk, onTrack };
  }, [projs, safeTasks, safeProjRisk, safeCross]);

  const goConflicts = () => onGoToTab && onGoToTab('conflicts');

  return (
    <div style={{ padding:'20px 28px', fontFamily:'-apple-system,system-ui,sans-serif', background:CANVAS, minHeight:'calc(100vh - 60px)' }}>
      {/* ── No-data banner: prominent import CTA at the top of the dashboard ─ */}
      {isEmpty && (
        <div style={{
          marginBottom:'18px', padding:'24px 26px',
          background:'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0.04))',
          border:'1px solid rgba(249,115,22,0.35)', borderRadius:'12px',
          display:'flex', alignItems:'center', gap:'20px',
        }}>
          <div style={{
            width:'52px', height:'52px', borderRadius:'12px',
            background:'rgba(249,115,22,0.18)', border:'1px solid rgba(249,115,22,0.4)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            fontSize:'24px', color:ORANGE,
          }}>↥</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'15px', fontWeight:'700', color:TEXT, marginBottom:'4px' }}>No data yet — import a schedule to get started</div>
            <div style={{ fontSize:'12px', color:MUTED, lineHeight:'1.5' }}>
              Upload an .xlsx with your projects, tasks, and assignments. The dashboard, Gantt chart, conflict detection, and resource view will populate from it. Numbers below show empty states for now.
            </div>
          </div>
          {onImport && (
            <button onClick={onImport}
              style={{
                padding:'10px 22px', borderRadius:'8px', border:'none',
                background:ORANGE, color:'white', fontSize:'13px', fontWeight:'700',
                cursor:'pointer', flexShrink:0,
              }}>
              ↥ Import xlsx
            </button>
          )}
        </div>
      )}
      {/* ── Top KPI row — IDENTICAL to the row on other tabs ────────────────
          Same five tiles, same styling. Keeping them in sync means the user
          sees one consistent header strip whether they're on Dashboard or any
          other tab — no double-take when switching. */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', marginBottom:'18px' }}>
        {/* Total Projects */}
        <div style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${BORDER}`, boxShadow:SHADOW_SM, minWidth:'130px', flex:1 }}>
          <div style={{ fontSize:'11px', color:MUTED, marginBottom:'6px' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="9" y="1" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="1" y="9" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/><rect x="9" y="9" width="6" height="6" rx="1" stroke={MUTED} strokeWidth="1.4"/></svg>
          </div>
          <div style={{ fontSize:'28px', fontWeight:'800', color:TEXT, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{projs.length}</div>
          <div style={{ fontSize:'10px', color:MUTED, marginTop:'5px', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:'600' }}>Total Projects</div>
        </div>

        {/* Projects On Schedule */}
        <div style={{ background:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${BORDER}`, boxShadow:SHADOW_SM, minWidth:'130px', flex:1 }}>
          <div style={{ fontSize:'11px', color:MUTED, marginBottom:'6px' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="11" rx="1" stroke={MUTED} strokeWidth="1.4"/><path d="M2 6h12M6 1v3M10 1v3" stroke={MUTED} strokeWidth="1.4" strokeLinecap="round"/></svg>
          </div>
          <div style={{ fontSize:'28px', fontWeight:'800', color: safeOnPct >= 75 ? STATUS_GREEN : safeOnPct >= 50 ? STATUS_AMBER : STATUS_RED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{safeOnPct}<span style={{ fontSize:'16px', fontWeight:'600' }}>%</span></div>
          <div style={{ fontSize:'10px', color:MUTED, marginTop:'5px', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:'600' }}>Projects On Schedule</div>
        </div>

        {/* Project Risk */}
        <div onClick={() => safeProjRisk.length > 0 && goConflicts()}
          style={{ background:safeProjRisk.length>0?STATUS_TOKENS.DANGER_SUBTLE:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${safeProjRisk.length>0?STATUS_TOKENS.DANGER_BORDER:BORDER}`, boxShadow:SHADOW_SM, minWidth:'130px', cursor:safeProjRisk.length>0?'pointer':'default', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'10px', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.06em', color:safeProjRisk.length>0?STATUS_TOKENS.DANGER_TEXT:MUTED }}>Project Risk</span>
            {safeProjRisk.length>0 && <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 2L14 14H2L8 2Z" stroke={STATUS_TOKENS.DANGER_TEXT} strokeWidth="1.4"/><path d="M8 7v3M8 11.5v.5" stroke={STATUS_TOKENS.DANGER_TEXT} strokeWidth="1.4" strokeLinecap="round"/></svg>}
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
            <span style={{ fontSize:'28px', fontWeight:'800', color:safeProjRisk.length>0?STATUS_TOKENS.DANGER_TEXT:MUTED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{safeProjRisk.length>0?safeProjRisk.length:'—'}</span>
            {safeProjRisk.length>0 && safeProjRisk[0] && <span style={{ fontSize:'13px', color:STATUS_TOKENS.DANGER_TEXT, fontWeight:'600' }}>({safeProjRisk[0].id})</span>}
          </div>
          {safeProjRisk.length>0
            ? <div style={{ fontSize:'11px', color:STATUS_TOKENS.DANGER_TEXT2, marginTop:'6px', display:'flex', alignItems:'center', gap:'4px' }}>View <span>›</span></div>
            : <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>No issues</div>
          }
        </div>

        {/* Cross Project Risk */}
        <div onClick={() => safeCross.length > 0 && goConflicts()}
          style={{ background:safeCross.length>0?STATUS_TOKENS.DANGER_SUBTLE:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${safeCross.length>0?STATUS_TOKENS.DANGER_BORDER:BORDER}`, boxShadow:SHADOW_SM, minWidth:'130px', cursor:safeCross.length>0?'pointer':'default', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'10px', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.06em', color:safeCross.length>0?STATUS_TOKENS.DANGER_TEXT:MUTED }}>Cross Project Risk</span>
            {safeCross.length>0 && <svg width="14" height="14" fill="none" viewBox="0 0 16 16"><path d="M8 2L14 14H2L8 2Z" stroke={STATUS_TOKENS.DANGER_TEXT} strokeWidth="1.4"/><path d="M8 7v3M8 11.5v.5" stroke={STATUS_TOKENS.DANGER_TEXT} strokeWidth="1.4" strokeLinecap="round"/></svg>}
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
            <span style={{ fontSize:'28px', fontWeight:'800', color:safeCross.length>0?STATUS_TOKENS.DANGER_TEXT:MUTED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{safeCross.length>0?safeCross.length:'—'}</span>
            {safeCross.length>0 && safeCross[0] && <span style={{ fontSize:'13px', color:STATUS_TOKENS.DANGER_TEXT, fontWeight:'600' }}>({safeCross[0].id})</span>}
          </div>
          {safeCross.length>0
            ? <div style={{ fontSize:'11px', color:STATUS_TOKENS.DANGER_TEXT2, marginTop:'6px', display:'flex', alignItems:'center', gap:'4px' }}>View <span>›</span></div>
            : <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>No issues</div>
          }
        </div>

        {/* Fragile Tasks */}
        <div onClick={() => safeKpi.fragile > 0 && goConflicts()}
          style={{ background:safeKpi.fragile>0?STATUS_TOKENS.WARN_SUBTLE2:CARD, borderRadius:'10px', padding:'16px 18px', border:`1px solid ${safeKpi.fragile>0?STATUS_TOKENS.WARN_BORDER:BORDER}`, boxShadow:SHADOW_SM, minWidth:'130px', cursor:safeKpi.fragile>0?'pointer':'default', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
            <span style={{ fontSize:'10px', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.06em', color:safeKpi.fragile>0?STATUS_TOKENS.WARN_BADGE:MUTED }}>Fragile Tasks</span>
            {safeKpi.fragile>0 && <span style={{ fontSize:'14px', color:STATUS_TOKENS.WARN_BADGE, fontWeight:'800', lineHeight:'1' }}>~</span>}
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
            <span style={{ fontSize:'28px', fontWeight:'800', color:safeKpi.fragile>0?STATUS_TOKENS.WARN_BADGE:MUTED, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{safeKpi.fragile>0?safeKpi.fragile:'—'}</span>
            {safeKpi.fragile>0 && <span style={{ fontSize:'13px', color:STATUS_TOKENS.WARN_BADGE, fontWeight:'600' }}>task{safeKpi.fragile===1?'':'s'}</span>}
          </div>
          {safeKpi.fragile>0
            ? <div style={{ fontSize:'11px', color:STATUS_TOKENS.WARN_BADGE, marginTop:'6px', display:'flex', alignItems:'center', gap:'4px' }}>View <span>›</span></div>
            : <div style={{ fontSize:'11px', color:MUTED, marginTop:'4px' }}>None</div>
          }
        </div>
      </div>

      {/* ── Row 1: Resource Allocation (WIRED) + Project Health (wired) ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px', marginBottom:'18px' }}>
        <Card
          title="Resource Allocation (Team)"
          subtitle={`Workload over the next ${utilWindow} working days`}
          action={
            <div style={{ display:'flex', gap:'4px' }}>
              {[30, 60, 90].map(w => (
                <button key={w} onClick={() => setUtilWindow(w)}
                  style={{
                    padding:'4px 10px', borderRadius:'6px',
                    border:`1px solid ${utilWindow===w ? ORANGE : BORDER}`,
                    background: utilWindow===w ? ORANGE+'18' : 'transparent',
                    color: utilWindow===w ? ORANGE : MUTED,
                    fontSize:'10px', fontWeight:'700', cursor:'pointer',
                  }}>{w}d</button>
              ))}
            </div>
          }>
          {resourceUtil.length === 0 ? (
            <div style={{ padding:'30px 16px', textAlign:'center', color:MUTED, fontSize:'12px' }}>
              No people in the resource pool yet.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {resourceUtil.map(p => {
                const colorFor = b => b==='at-cap'?STATUS_RED:b==='heavy'?STATUS_AMBER:b==='optimal'?STATUS_GREEN:STATUS_AMBER;
                // Under-utilized gets AMBER per spec FR-1.05; optimal GREEN; heavy AMBER; at-cap RED.
                const c = p.bucket==='at-cap'   ? STATUS_RED   :
                          p.bucket==='heavy'    ? STATUS_AMBER :
                          p.bucket==='optimal'  ? STATUS_GREEN :
                          /* under */            STATUS_AMBER;
                const labelFor =
                  p.bucket==='at-cap'  ? 'At capacity' :
                  p.bucket==='heavy'   ? 'Heavy load'  :
                  p.bucket==='optimal' ? 'Optimal'     :
                  /* under */            `Under (<${UNDER_UTIL_THRESHOLD}%)`;
                // Display capacity inline if non-default
                const capNote = p.weeklyCapacity !== 5 ? ` · ${p.weeklyCapacity}d/wk` : '';
                return (
                  <div key={p.name} style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                    <div style={{ width:'90px', flexShrink:0 }}>
                      <div style={{ fontSize:'12px', color:TEXT, fontWeight:'500' }}>{p.name}</div>
                      {p.role && <div style={{ fontSize:'9px', color:MUTED }}>{p.role}{capNote}</div>}
                    </div>
                    <div style={{ flex:1, height:'10px', background:CHIP, borderRadius:'5px', overflow:'hidden', position:'relative' }}>
                      <div style={{ width:`${p.pct}%`, height:'100%', background:c, borderRadius:'5px', transition:'width 0.25s' }} />
                    </div>
                    <div style={{ width:'40px', textAlign:'right', fontSize:'11px', color:c, fontWeight:'700', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{p.pct}%</div>
                    <div style={{ width:'90px', textAlign:'right', fontSize:'10px', color:MUTED, flexShrink:0 }}>{labelFor}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Project Health" subtitle="Executive summary of active projects">
          <ProjectHealthDonut counts={projectHealth} total={projs.length} />
        </Card>
      </div>

      {/* ── Row 2: Budget burn (un-wired) + Upcoming Projects (un-wired) ──── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px' }}>
        <Card title="Budget Burn vs Forecast" subtitle="Actual spend against budgeted forecast, per project">
          <DemoOverlay note="Budget data not yet imported — preview only.">
            {(() => {
              const demoProjects = [
                { id:'P1', forecast: 480000, spent: 312000 },
                { id:'P2', forecast: 320000, spent: 298000 },
                { id:'P3', forecast: 210000, spent: 224000 },
              ];
              const fmt = n => '$' + (n >= 1000 ? (n/1000).toFixed(0)+'k' : n);
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                  {demoProjects.map(p => {
                    const pct = (p.spent / p.forecast) * 100;
                    const over = pct > 100;
                    const c = over ? STATUS_RED : pct > 85 ? STATUS_AMBER : STATUS_GREEN;
                    const widthPct = Math.min(pct, 130); // cap visual at 130% so over-budget bars don't escape
                    return (
                      <div key={p.id}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' }}>
                          <div style={{ fontSize:'12px', fontWeight:'600', color:TEXT }}>{p.id}</div>
                          <div style={{ fontSize:'11px', fontVariantNumeric:'tabular-nums' }}>
                            <span style={{ color:c, fontWeight:'700' }}>{fmt(p.spent)}</span>
                            <span style={{ color:MUTED }}> / {fmt(p.forecast)}</span>
                            <span style={{ color:c, marginLeft:'8px', fontWeight:'700' }}>{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div style={{ position:'relative', height:'8px', background:CHIP, borderRadius:'4px', overflow:'hidden' }}>
                          {/* 100% marker line */}
                          <div style={{ position:'absolute', left:'77%', top:0, bottom:0, width:'1px', background:MUTED, opacity:0.5, zIndex:2 }} />
                          <div style={{ width:`${(widthPct/130)*100}%`, height:'100%', background:c, borderRadius:'4px', transition:'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </DemoOverlay>
        </Card>

        <Card title="Upcoming Projects" subtitle="Projects scheduled to start in the near future">
          <DemoOverlay note="Upcoming-project surfacing not wired yet — preview only.">
            {(() => {
              const demoUpcoming = [
                { id:'P4', name:'Riverside Tower',   start:'in 8 days',  team:0, ready:false },
                { id:'P5', name:'Greenfield Office', start:'in 14 days', team:3, ready:true  },
                { id:'P6', name:'Harbour Renewal',   start:'in 21 days', team:2, ready:true  },
              ];
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {demoUpcoming.map(p => (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', background:CHIP, borderRadius:'8px', border:`1px solid ${BORDER}` }}>
                      <div style={{
                        width:'34px', height:'34px', borderRadius:'8px',
                        background:TASK_BLUE+'22', border:`1px solid ${TASK_BLUE}40`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'11px', fontWeight:'700', color:TASK_BLUE, flexShrink:0,
                      }}>{p.id}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'12px', fontWeight:'600', color:TEXT }}>{p.name}</div>
                        <div style={{ fontSize:'10px', color:MUTED, marginTop:'2px' }}>
                          Starts {p.start}
                          <span style={{ margin:'0 6px' }}>·</span>
                          {p.team > 0
                            ? <span>{p.team} member{p.team>1?'s':''} assigned</span>
                            : <span style={{ color:STATUS_AMBER, fontWeight:'600' }}>No team yet</span>}
                        </div>
                      </div>
                      <button disabled
                        style={{ padding:'6px 12px', borderRadius:'6px', border:'none',
                          background: p.ready ? ORANGE+'cc' : CARD,
                          color: p.ready ? 'white' : MUTED,
                          fontSize:'11px', fontWeight:'600', cursor:'not-allowed', flexShrink:0 }}>
                        Assign Tasks
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </DemoOverlay>
        </Card>
      </div>

      {/* ── Quick-actions row (small, since most cards above are read-only) ── */}
      {(safeProjRisk.length > 0 || safeCross.length > 0 || safeKpi.fragile > 0) && (
        <div style={{ marginTop:'18px', display:'flex', alignItems:'center', gap:'12px', padding:'14px 18px', background:CARD, borderRadius:'10px', border:`1px solid ${BORDER}` }}>
          <span style={{ fontSize:'12px', color:MUTED }}>Needs attention:</span>
          {safeProjRisk.length > 0 && (
            <button onClick={goConflicts} style={{
              padding:'6px 12px', borderRadius:'7px', border:'none',
              background: STATUS_RED+'22', color: STATUS_RED, fontSize:'12px',
              fontWeight:'600', cursor:'pointer',
            }}>
              {safeProjRisk.length} project risk{safeProjRisk.length>1?'s':''} ›
            </button>
          )}
          {safeCross.length > 0 && (
            <button onClick={goConflicts} style={{
              padding:'6px 12px', borderRadius:'7px', border:'none',
              background: STATUS_RED+'22', color: STATUS_RED, fontSize:'12px',
              fontWeight:'600', cursor:'pointer',
            }}>
              {safeCross.length} cross-project risk{safeCross.length>1?'s':''} ›
            </button>
          )}
          {safeKpi.fragile > 0 && (
            <button onClick={goConflicts} style={{
              padding:'6px 12px', borderRadius:'7px', border:'none',
              background: STATUS_TOKENS.WARN_BADGE+'22', color: STATUS_TOKENS.WARN_BADGE, fontSize:'12px',
              fontWeight:'600', cursor:'pointer',
            }}>
              {safeKpi.fragile} fragile task{safeKpi.fragile>1?'s':''} ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}