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
  UserX,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  Problem,
  ProblemAction,
  ProblemsResponse,
  parseProblemsResponse,
} from "../types";
import { KpiCard } from "./Dashboard";
import { AppNavigate } from "../types/masters";
import { changeHistory, makeChangeSetId } from "../lib/changeHistory";

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
  conflict: { label: "Clash", icon: <TriangleAlert size={16} />, accent: C.redDark, bg: "#FFF8F8", border: "#FECACA" },
  late:     { label: "Running late",   icon: <Clock size={16} />,          accent: C.amber,   bg: "#FFFBEB", border: "#FCD34D" },
  fragile:  { label: "Tight handover", icon: <Link2 size={16} />,          accent: C.amber,   bg: "#FFFBF2", border: "#FDE68A" },
  weather:  { label: "Weather risk",   icon: <CloudRain size={16} />,      accent: C.blue,    bg: "#F1F7FE", border: "#BFDBFE" },
  unassigned: { label: "No one assigned", icon: <UserX size={16} />,        accent: C.amber,   bg: "#FFFBF2", border: "#FDE68A" },
};

export default function ScreenProblems({ onNav }: { onNav?: AppNavigate }) {
  const { user } = useAuth();
  const isPM = user?.role === "PM";
  const [myProjectNames, setMyProjectNames] = useState<Set<string> | null>(null);
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

  // PMs only see their own projects, so they shouldn't see cross-project problems
  // that touch a project they don't own. Build the set of names they DO own.
  useEffect(() => {
    if (!isPM || !user?.email) { setMyProjectNames(null); return; }
    fetch("/api/v1/projects")
      .then(r => r.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        setMyProjectNames(new Set(rows.filter(p => p.managerEmail === user.email).map(p => p.name)));
      })
      .catch(() => {});
  }, [isPM, user?.email]);

  // After a fix is applied, write a Change History entry so the resolution is
  // auditable on the Timeline — a reassign has no date moves (logged as a plain
  // summary), a push-back moves tasks (logged with the moves + an Undo).
  const logResolutionToHistory = (
    problem: Problem,
    action: ProblemAction,
    beforeById: Map<string, { start: string; end: string }>
  ) => {
    fetch("/api/v1/dashboard/tasks")
      .then(r => r.json())
      .then((after: any[]) => {
        const list = Array.isArray(after) ? after : [];
        const moves = list
          .map((t: any) => {
            const b = beforeById.get(t.id);
            if (!b || (b.start === t.start && b.end === t.end)) return null;
            return { taskId: t.id, name: t.name, fromStart: b.start, fromEnd: b.end, toStart: t.start, toEnd: t.end };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);
        const maxPush = moves.length
          ? Math.max(0, ...moves.map(m => Math.round((+new Date(m.toStart) - +new Date(m.fromStart)) / 86400000)))
          : 0;
        const anchorId = (problem.taskIds && problem.taskIds[0]) || (moves[0]?.taskId ?? "");
        const anchorName = list.find((t: any) => anchorId && t.id === anchorId)?.name || problem.title;
        changeHistory.add({
          id: makeChangeSetId(),
          createdAt: new Date().toISOString(),
          anchorTaskId: anchorId,
          anchorTaskName: anchorName,
          mode: moves.length > 1 ? "full" : "none",
          delayWorkingDays: maxPush,
          moves,
          summary: `Resolved: ${action.label}`,
          warningsAtConfirm: [],
          reverted: false,
        });
      })
      .catch(() => {});
  };

  const confirmResolve = () => {
    if (!pending) return;
    setSubmitting(true);
    const { problem, action } = pending;

    // Snapshot task dates before the fix so we can log exactly what moved.
    fetch("/api/v1/dashboard/tasks")
      .then(r => r.json())
      .then((before: any[]) => {
        const beforeById = new Map(
          (Array.isArray(before) ? before : []).map((t: any) => [t.id, { start: t.start, end: t.end }])
        );
        return fetch(`/api/v1/problems/${problem.id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionId: action.id }),
        })
          .then(r => r.json())
          .then(res => ({ res, beforeById }));
      })
      .then(({ res, beforeById }) => {
        setSubmitting(false);
        setPending(null);
        if (!res.success) {
          alert(res.error || "Could not resolve this problem.");
          return;
        }
        logResolutionToHistory(problem, action, beforeById);
        setResolvedIds(m => ({ ...m, [problem.id]: action.label }));
        if (res.problems) {
          setTimeout(() => {
            setData(parseProblemsResponse(res));
            setResolvedIds(m => { const next = { ...m }; delete next[problem.id]; return next; });
          }, 2800);
        } else {
          setTimeout(load, 2800);
        }
      })
      .catch(() => { setSubmitting(false); setPending(null); alert("Network error while resolving."); });
  };

  // For a PM, split problems three ways by which project(s) each one touches
  // (a problem can span two projects via "A + B"):
  //   - fully theirs   → fixable cards (they manage every project involved)
  //   - partly theirs  → a read-only notice: a change of theirs clashed into a
  //     project they DON'T manage; only the owner can see + resolve it
  //   - none theirs    → hidden (not their concern)
  // The Owner sees everything as fixable cards.
  const splitProjects = (name: string) => name.split(" + ").map(n => n.trim());
  let problems = data.problems;
  let crossProblems: Problem[] = [];
  if (isPM && myProjectNames) {
    const owned: Problem[] = [];
    const cross: Problem[] = [];
    for (const p of data.problems) {
      const parts = splitProjects(p.projectName);
      const ownedCount = parts.filter(n => myProjectNames.has(n)).length;
      if (ownedCount === parts.length) owned.push(p);
      else if (ownedCount > 0) cross.push(p);
    }
    problems = owned;
    crossProblems = cross;
  }
  const summary = (isPM && myProjectNames)
    ? {
        total: problems.length,
        critical: problems.filter(p => p.severity === "critical").length,
        projectsAffected: new Set(problems.flatMap(p => splitProjects(p.projectName))).size,
        projectsTotal: myProjectNames.size,
      }
    : data.summary;

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
              : crossProblems.length > 0
              ? "Nothing here for you to fix"
              : "Everything's on track"}
          </div>
          <div style={{ fontSize: 12.5, color: C.gray }}>
            {summary.total > 0
              ? `${summary.projectsAffected} of ${summary.projectsTotal} projects have a problem. Pick a fix for each one.`
              : crossProblems.length > 0
              ? "But one of your changes affected another project — see below."
              : "No clashes, no late tasks, nothing to worry about."}
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
            sub="Same person, two tasks at once"
            onClick={onNav && summary.critical > 0
              ? () => onNav("gantt", undefined, criticalTaskIds.length > 0 ? { ganttTaskIds: criticalTaskIds } : { ganttStatus: "conflict" })
              : undefined}
            actionLabel="See on Timeline"
          />
          <KpiCard label="Projects Hit" value={`${summary.projectsAffected}`} valueColor={C.amber} sub={`of ${summary.projectsTotal} running`} />
        </div>
      )}

      {/* PM blind-spot notice — a change of theirs clashed into a project they
          don't manage. Read-only: only the owner can see the detail and fix it. */}
      {isPM && crossProblems.length > 0 && (
        <div style={{ padding: "16px 18px", background: C.amberBg, borderRadius: 12, border: `1px solid #FCD34D`, marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <TriangleAlert size={20} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.amber, marginBottom: 4 }}>
              A change of yours affected another project
            </div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55 }}>
              {crossProblems.length} problem{crossProblems.length > 1 ? "s" : ""} now {crossProblems.length > 1 ? "involve" : "involves"} a
              project you don't manage. You can't fix {crossProblems.length > 1 ? "them" : "it"} from here — the owner can see the
              details and will resolve {crossProblems.length > 1 ? "them" : "it"}.
            </div>
            {crossProblems.map(p => (
              <div key={p.id} style={{ fontSize: 11.5, color: C.text, padding: "7px 11px", background: C.white, borderRadius: 8, border: `0.5px solid #FDE68A`, marginTop: 8 }}>
                <strong>{p.title}</strong>
                <span style={{ color: C.gray }}> · {p.projectName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — only when there is genuinely nothing (no fixable, none cross-project). */}
      {problems.length === 0 && crossProblems.length === 0 && (
        <div style={{ padding: "44px 20px", textAlign: "center", background: C.white, borderRadius: 12, border: `0.5px solid ${C.grayLight}` }}>
          <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}><CheckCircle2 size={40} color={C.green} /></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Everything's on track</div>
          <div style={{ fontSize: 12.5, color: C.gray }}>No clashes, no late tasks. Nothing needs you right now.</div>
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
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.greenDark }}>Resolved: {p.title}</div>
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
                      onClick={() => onNav("gantt", undefined, (p.taskIds && p.taskIds.length > 0) ? { ganttTaskIds: p.taskIds, ganttFocusLabel: p.title } : undefined)}
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
                      Suggested fixes (pick one)
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
              <div><strong>{r.name}</strong> · {r.trade} · {r.rate} · {r.util}% load</div>
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
