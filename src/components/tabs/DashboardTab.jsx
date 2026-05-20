// ── DashboardTab ─────────────────────────────────────────────────────────────
// At-a-glance landing view. Wired cards show real data from the engine; cards
// for features that don't have data yet show a "Not connected yet" state with
// a structured TODO list of what's needed to enable them. This keeps the
// dashboard honest (no fake numbers) while preserving the layout intent.

import { useMemo } from 'react';
import { useSched } from '../../context.jsx';
import { CARD, BORDER, ORANGE, TEXT, MUTED } from '../../theme.jsx';

// ── Visual palette (status colours, matches the rest of the app) ─────────────
const STATUS_GREEN = '#10B981';
const STATUS_AMBER = '#F59E0B';
const STATUS_RED   = '#EF4444';
const TASK_BLUE    = '#5B7B9A';
const TODO_GREY    = '#6B7280';

// ── Small primitives ─────────────────────────────────────────────────────────
/** Card frame used by every dashboard tile. */
function Card({ title, subtitle, children, action, style }) {
  return (
    <div style={{
      background:CARD, borderRadius:'10px', padding:'18px 20px',
      border:`1px solid ${BORDER}`, ...style,
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

/** Big-number stat tile (for the KPI strip). */
function Stat({ icon, label, value, hint, accent }) {
  return (
    <div style={{
      background:CARD, borderRadius:'10px', padding:'16px 18px',
      border:`1px solid ${BORDER}`, minWidth:'160px', flex:1,
      display:'flex', flexDirection:'column', gap:'10px',
    }}>
      {icon && <div style={{ color:MUTED, fontSize:'14px' }}>{icon}</div>}
      <div style={{ fontSize:'28px', fontWeight:'800', color: accent || TEXT, lineHeight:'1', fontVariantNumeric:'tabular-nums' }}>{value}</div>
      <div style={{ fontSize:'12px', color:MUTED }}>{label}</div>
      {hint && <div style={{ fontSize:'10px', color: accent || MUTED, fontWeight:'600' }}>{hint}</div>}
    </div>
  );
}

/** "Not connected yet" placeholder body — used by un-wired cards.
    Renders a structured TODO list of what's needed to wire this feature. */
function NotConnected({ todos }) {
  return (
    <div style={{ padding:'4px 0 0' }}>
      <div style={{
        display:'inline-block', fontSize:'10px', fontWeight:'700',
        color:TODO_GREY, background:TODO_GREY+'18', padding:'3px 8px',
        borderRadius:'4px', letterSpacing:'0.06em', marginBottom:'14px',
      }}>NOT CONNECTED YET</div>
      <div style={{ fontSize:'11px', fontWeight:'700', color:MUTED, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>
        To wire this up:
      </div>
      <ul style={{ margin:'0', padding:'0 0 0 18px', fontSize:'12px', color:MUTED, lineHeight:'1.7' }}>
        {todos.map((t, i) => (
          <li key={i} style={{ marginBottom:'4px' }}>{t}</li>
        ))}
      </ul>
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
  const safeTasks    = tasks || [];
  const safeKpi      = kpi    || { fragile: 0, conflicts: 0 };
  const safeProjRisk = projRisk  || [];
  const safeCross    = crossRisk || [];
  const safeOnPct    = typeof onSchedulePct === 'number' ? onSchedulePct : 0;

  // Active = not completed. Defensive against odd states.
  const activeTasks = useMemo(
    () => safeTasks.filter(t => !t.isCompleted),
    [safeTasks]
  );

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
    <div style={{ padding:'20px 28px', fontFamily:'-apple-system,system-ui,sans-serif', background:'#0B0B12', minHeight:'calc(100vh - 60px)' }}>
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
      {/* ── Top stat strip (5 wired stats) ──────────────────────────────────── */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', marginBottom:'18px' }}>
        <Stat icon="◰" label="Active Projects" value={projs.length} />
        <Stat icon="☰" label="Active Tasks" value={activeTasks.length} />
        <Stat icon="◷" label="Projects On Schedule" value={`${safeOnPct}%`} accent={safeOnPct >= 75 ? STATUS_GREEN : safeOnPct >= 50 ? STATUS_AMBER : STATUS_RED} />
        <Stat
          label="Project Risk"
          value={safeProjRisk.length}
          hint={safeProjRisk.length > 0 ? `View ›` : undefined}
          accent={safeProjRisk.length > 0 ? STATUS_RED : undefined} />
        <Stat
          label="Cross Project Risk"
          value={safeCross.length}
          hint={safeCross.length > 0 ? `View ›` : undefined}
          accent={safeCross.length > 0 ? STATUS_RED : undefined} />
      </div>

      {/* ── Row 1: Resource Allocation (un-wired) + Project Health (wired) ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px', marginBottom:'18px' }}>
        <Card title="Resource Allocation (Team)" subtitle="Per-person workload distribution">
          <NotConnected todos={[
            'Define utilization buckets (under / optimal / heavy / over) with agreed thresholds',
            'Compute each person\'s working-day load over the active project window',
            'Decide normalization: total working days available vs project span vs rolling 30 days',
            'Decide how to count overlapping tasks (engine prevents them, so likely sum durations)',
            'Optionally weight by task complexity or rate if that data becomes available',
          ]} />
        </Card>

        <Card title="Project Health" subtitle="Executive summary of active projects">
          <ProjectHealthDonut counts={projectHealth} total={projs.length} />
        </Card>
      </div>

      {/* ── Row 2: Budget burn (un-wired) + Upcoming Projects (un-wired) ──── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'18px' }}>
        <Card title="Budget Burn vs Forecast" subtitle="Actual spend against budgeted forecast, per project">
          <NotConnected todos={[
            'Add budget & forecast fields to the xlsx schema (per project)',
            'Add a spend-tracking input — manual entry, csv import, or accounting integration',
            'Decide burn cadence: daily? weekly? on commit?',
            'Define absolute limit per project (hard ceiling above forecast)',
            'Decide colour rules (green under forecast / amber near / red over) and thresholds',
          ]} />
        </Card>

        <Card title="Upcoming Projects" subtitle="Projects scheduled to start in the near future">
          <NotConnected todos={[
            'Define "upcoming" — projects with start date in the next N weeks?',
            'Decide what makes a project "ready to assign" (people available? deps clear?)',
            'Wire the Assign Tasks button to the existing AddTasksModal or a new flow',
            'Add a "no team assigned yet" badge so understaffed projects surface here',
            'Optionally sort by urgency: closest start date first, or biggest gap to staffing',
          ]} />
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
              background: '#FBBF24'+'22', color: '#FBBF24', fontSize:'12px',
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