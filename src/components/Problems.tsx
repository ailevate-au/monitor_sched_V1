import { useState, useEffect } from "react";
import {
  TriangleAlert,
  Clock,
  Link2,
  CloudRain,
  CheckCircle2,
  ArrowRight,
  X,
  ChevronDown,
  ChevronUp,
  CalendarDays,
} from "lucide-react";
import {
  Problem,
  ProblemAction,
  ProblemsResponse,
  parseProblemsResponse,
} from "../types";
import { KpiCard } from "./Dashboard";
import { AppNavigate } from "../types/masters";

const C = {
  navy: "#0F1F3D",
  blue: "#1A5FA8",
  blueLight: "#E6F0FB",
  green: "#1D9E75",
  greenBg: "#ECFDF5",
  greenDark: "#2D6A0A",
  amber: "#B87316",
  amberBg: "#FEF3C7",
  red: "#E04A4A",
  redDark: "#9B2C2C",
  redBg: "#FEF2F2",
  gray: "#64748B",
  grayLight: "#E2E8F0",
  text: "#1E293B",
  white: "#FFFFFF",
};

const EMPTY: ProblemsResponse = {
  problems: [],
  summary: { total: 0, critical: 0, projectsAffected: 0, projectsTotal: 0 },
};

const CATEGORY_META: Record<
  Problem["category"],
  { label: string; icon: React.ReactNode; accent: string; bg: string; border: string }
> = {
  conflict: { label: "Double-booking", icon: <TriangleAlert size={16} />, accent: C.redDark, bg: "#FFF8F8", border: "#FECACA" },
  late:     { label: "Running late",   icon: <Clock size={16} />,          accent: C.amber,   bg: "#FFFBEB", border: "#FCD34D" },
  fragile:  { label: "Tight handover", icon: <Link2 size={16} />,          accent: C.amber,   bg: "#FFFBF2", border: "#FDE68A" },
  weather:  { label: "Weather risk",   icon: <CloudRain size={16} />,      accent: C.blue,    bg: "#F1F7FE", border: "#BFDBFE" },
};

export default function ScreenProblems({ onNav }: { onNav?: AppNavigate }) {
  const [data, setData]           = useState<ProblemsResponse>(EMPTY);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Record<string, string>>({});
  const [pending, setPending]     = useState<{ problem: Problem; action: ProblemAction } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Cards start expanded; user can collapse the suggested-fixes section per card
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapsed = (id: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const load = () => {
    setLoading(true);
    fetch("/api/v1/problems")
      .then(r => {
        if (!r.ok) throw new Error("Could not load problems");
        return r.json();
      })
      .then(d => { setData(parseProblemsResponse(d)); setLoading(false); setError(null); })
      .catch(e => { setError(e.message || "Failed to load problems"); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const confirmResolve = () => {
    if (!pending) return;
    setSubmitting(true);
    const { problem, action } = pending;
    fetch(`/api/v1/problems/${problem.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: action.id }),
    })
      .then(r => r.json())
      .then(res => {
        setSubmitting(false);
        setPending(null);
        if (res.success) {
          setResolvedIds(m => ({ ...m, [problem.id]: action.label }));
          if (res.problems) {
            setTimeout(() => {
              setData(parseProblemsResponse(res));
              setResolvedIds(m => { const next = { ...m }; delete next[problem.id]; return next; });
            }, 1400);
          } else {
            setTimeout(load, 1400);
          }
        } else {
          alert(res.error || "Could not resolve this problem.");
        }
      })
      .catch(() => { setSubmitting(false); setPending(null); alert("Network error while resolving."); });
  };

  const { problems, summary } = data;

  // Exact Gantt task sets behind the KPI counts (a problem can cover several
  // tasks, and the same task can surface in more than one problem — dedupe).
  const allProblemTaskIds = Array.from(new Set(problems.flatMap(p => p.taskIds || [])));
  const criticalTaskIds = Array.from(new Set(problems.filter(p => p.severity === "critical").flatMap(p => p.taskIds || [])));

  if (loading && problems.length === 0)
    return <div style={{ padding: 20, color: C.gray }}>Scanning your portfolio for issues…</div>;

  if (error)
    return (
      <div style={{ padding: 20, color: C.redDark, background: C.redBg, borderRadius: 12, border: `0.5px solid ${C.red}` }}>
        {error}
      </div>
    );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3 }}>
            {summary.total > 0
              ? `${summary.total} thing${summary.total > 1 ? "s" : ""} need${summary.total > 1 ? "" : "s"} you`
              : "Everything's on track"}
          </div>
          <div style={{ fontSize: 12.5, color: C.gray }}>
            {summary.total > 0
              ? `${summary.projectsAffected} of ${summary.projectsTotal} projects have a problem. Pick a fix for each one.`
              : "No clashes, no late jobs, nothing to worry about."}
          </div>
        </div>
      </div>

      {/* KPI strip — one clear number, plus two supporting */}
      {summary.total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 20 }}>
          <KpiCard
            label="Total Issues"
            value={`${summary.total}`}
            valueColor={summary.total > 0 ? C.red : C.greenDark}
            sub="Everything that needs you"
            onClick={onNav && summary.total > 0
              ? () => onNav("gantt", undefined, allProblemTaskIds.length > 0 ? { ganttTaskIds: allProblemTaskIds } : { ganttStatus: "problems" })
              : undefined}
            actionLabel="See on Timeline"
          />
          <KpiCard
            label="Urgent"
            value={`${summary.critical}`}
            valueColor={summary.critical > 0 ? C.redDark : C.greenDark}
            sub="Same person, two jobs at once"
            onClick={onNav && summary.critical > 0
              ? () => onNav("gantt", undefined, criticalTaskIds.length > 0 ? { ganttTaskIds: criticalTaskIds } : { ganttStatus: "conflict" })
              : undefined}
            actionLabel="See on Timeline"
          />
          <KpiCard label="Projects Hit" value={`${summary.projectsAffected}`} valueColor={C.amber} sub={`of ${summary.projectsTotal} running`} />
        </div>
      )}

      {/* Empty state — clean portfolio. Issues are created from Projects. */}
      {problems.length === 0 && (
        <div style={{ padding: "44px 20px", textAlign: "center", background: C.white, borderRadius: 12, border: `0.5px solid ${C.grayLight}` }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Everything's on track</div>
          <div style={{ fontSize: 12.5, color: C.gray }}>No clashes, no late jobs. Nothing needs you right now.</div>
        </div>
      )}

      {/* Problem cards */}
      {problems.map(p => {
        const meta     = CATEGORY_META[p.category];
        const resolved = resolvedIds[p.id];
        const fixesCollapsed = collapsed.has(p.id);

        return (
          <div
            key={p.id}
            style={{
              border: `1px solid ${resolved ? C.green : meta.border}`,
              borderRadius: 12,
              marginBottom: 14,
              background: C.white,
              overflow: "hidden",
              transition: "border-color .2s",
            }}
          >
            {resolved ? (
              /* Resolved flash */
              <div style={{ padding: "18px 18px", background: C.greenBg, display: "flex", alignItems: "center", gap: 10 }}>
                <CheckCircle2 size={22} color={C.green} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.greenDark }}>Resolved — {p.title}</div>
                  <div style={{ fontSize: 12, color: C.greenDark }}>{resolved}</div>
                </div>
              </div>
            ) : (
              <>
                {/* Problem header */}
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${meta.border}`, background: meta.bg }}>
                  {/* Row 1: category badge + project pill */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: meta.accent, background: C.white, border: `1px solid ${meta.border}`, padding: "2px 8px", borderRadius: 20 }}>
                      {meta.icon} {meta.label.toUpperCase()}
                    </span>
                    {/* Project name — prominent pill */}
                    <span
                      style={{ fontSize: 10.5, fontWeight: 600, color: C.blue, background: C.blueLight, border: `1px solid #BFDBFE`, padding: "2px 9px", borderRadius: 20, cursor: onNav ? "pointer" : "default" }}
                      title={onNav ? "Open in Timeline" : undefined}
                      onClick={() => onNav?.("gantt")}
                    >
                      {p.projectName}
                    </span>
                  </div>
                  {/* Row 2: title */}
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>{p.title}</div>
                  {/* Row 3: what + impact */}
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55, marginBottom: 6 }}>{p.what}</div>
                  <div style={{ fontSize: 11.5, display: "flex", gap: 5 }}>
                    <span style={{ fontWeight: 700, color: meta.accent }}>Impact:</span>
                    <span style={{ color: C.text }}>{p.impact}</span>
                  </div>
                  {/* Row 4: View in Timeline link */}
                  {onNav && (
                    <button
                      type="button"
                      onClick={() => onNav("gantt")}
                      style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.blue, background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
                    >
                      <CalendarDays size={12} /> View in Timeline
                    </button>
                  )}
                </div>

                {/* Suggested fixes — collapsible */}
                <div style={{ padding: "0 16px" }}>
                  {/* Toggle header */}
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(p.id)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "none", border: "none", cursor: "pointer", padding: "12px 0",
                      borderBottom: fixesCollapsed ? "none" : `0.5px solid ${C.grayLight}`,
                    }}
                  >
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.gray, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Suggested fixes — pick one
                    </span>
                    {fixesCollapsed
                      ? <ChevronDown size={15} color={C.gray} />
                      : <ChevronUp size={15} color={C.gray} />}
                  </button>

                  {/* Action rows */}
                  {!fixesCollapsed && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
                      {p.suggestedActions.map(a => (
                        <ActionRow key={a.id} action={a} onPick={() => setPending({ problem: p, action: a })} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Confirm modal */}
      {pending && (
        <ConfirmModal
          problem={pending.problem}
          action={pending.action}
          submitting={submitting}
          onCancel={() => setPending(null)}
          onConfirm={confirmResolve}
        />
      )}
    </div>
  );
}

function ActionRow({ action, onPick }: { action: ProblemAction; onPick: () => void }) {
  const r = action.resource;
  const recommended = action.recommended;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
        border: `1px solid ${recommended ? C.green : C.grayLight}`,
        background: recommended ? C.greenBg : C.white,
      }}
    >
      {r ? (
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: recommended ? "#B7F0D8" : "#EEF2F8", color: recommended ? "#085041" : "#475569", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {r.initials}
        </div>
      ) : (
        <div style={{ width: 34, height: 34, borderRadius: 8, background: "#EEF2F8", color: C.gray, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Clock size={16} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {action.label}
          {recommended && <span style={{ fontSize: 9.5, background: C.green, color: C.white, padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>RECOMMENDED</span>}
          {r && r.same_state === false && <span style={{ fontSize: 9.5, background: C.amberBg, color: C.amber, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>Interstate · {r.state}</span>}
          {action.delayDays != null && action.delayDays !== 0 && (
            <span style={{ fontSize: 9.5, background: "#F1F5F9", color: C.gray, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
              {action.delayDays > 0 ? `+${action.delayDays}d` : `${action.delayDays}d`} shift
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.gray, marginTop: 2, lineHeight: 1.45 }}>{action.detail}</div>
        {r && r.skills && r.skills.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
            {r.skills.slice(0, 4).map(s => (
              <span key={s} style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 4, background: C.blueLight, color: C.blue, fontWeight: 600 }}>{s}</span>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onPick}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: recommended ? "8px 14px" : "6px 12px",
          fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none",
          background: recommended ? C.green : "#E2E8F0",
          color: recommended ? C.white : C.text,
          cursor: "pointer", flexShrink: 0,
        }}
      >
        Choose <ArrowRight size={13} />
      </button>
    </div>
  );
}

function ConfirmModal({
  problem, action, submitting, onCancel, onConfirm,
}: {
  problem: Problem; action: ProblemAction; submitting: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const r = action.resource;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,31,61,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99, padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 14, width: "100%", maxWidth: 440, padding: 22, boxShadow: "0 18px 50px rgba(8,16,35,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>Confirm this fix</div>
          <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: C.gray, padding: 2 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>{problem.title}</div>

        <div style={{ background: "#F8FAFC", border: `1px solid ${C.grayLight}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{action.label}</div>
          <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.5 }}>{action.detail}</div>
          {r && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${C.grayLight}`, fontSize: 11.5, color: C.text }}>
              <div><strong>{r.name}</strong> — {r.trade} · {r.rate} · {r.util}% load</div>
              {r.bio && <div style={{ color: C.gray, marginTop: 3 }}>{r.bio}</div>}
              {r.skills && r.skills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {r.skills.map(s => (
                    <span key={s} style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 4, background: C.blueLight, color: C.blue, fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} disabled={submitting}
            style={{ padding: "9px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 8, border: `1px solid ${C.grayLight}`, background: C.white, color: C.text, cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={submitting}
            style={{ padding: "9px 18px", fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: "none", background: submitting ? "#9DB6D6" : C.blue, color: C.white, cursor: submitting ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {submitting ? "Applying…" : "Confirm & resolve"}
            {!submitting && <CheckCircle2 size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
