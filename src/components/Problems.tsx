import { useState, useEffect } from "react";
import {
  TriangleAlert,
  Clock,
  Link2,
  CloudRain,
  CheckCircle2,
  ArrowRight,
  X,
} from "lucide-react";
import {
  Problem,
  ProblemAction,
  ProblemsResponse,
  parseProblemsResponse,
} from "../types";
import { KpiCard } from "./Dashboard";

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

/** Visual treatment per problem category. */
const CATEGORY_META: Record<
  Problem["category"],
  { label: string; icon: React.ReactNode; accent: string; bg: string; border: string }
> = {
  conflict: { label: "Double-booking", icon: <TriangleAlert size={16} />, accent: C.redDark, bg: "#FFF8F8", border: "#FECACA" },
  late: { label: "Running late", icon: <Clock size={16} />, accent: C.amber, bg: "#FFFBEB", border: "#FCD34D" },
  fragile: { label: "Tight handover", icon: <Link2 size={16} />, accent: C.amber, bg: "#FFFBF2", border: "#FDE68A" },
  weather: { label: "Weather risk", icon: <CloudRain size={16} />, accent: C.blue, bg: "#F1F7FE", border: "#BFDBFE" },
};

export default function ScreenProblems({ onNav }: { onNav?: (screen: string) => void }) {
  const [data, setData] = useState<ProblemsResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Record<string, string>>({}); // id -> message
  const [pending, setPending] = useState<{ problem: Problem; action: ProblemAction } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/v1/problems")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load problems");
        return r.json();
      })
      .then((d) => {
        setData(parseProblemsResponse(d));
        setLoading(false);
        setError(null);
      })
      .catch((e) => {
        setError(e.message || "Failed to load problems");
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const confirmResolve = () => {
    if (!pending) return;
    setSubmitting(true);
    const { problem, action } = pending;
    fetch(`/api/v1/problems/${problem.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: action.id }),
    })
      .then((r) => r.json())
      .then((res) => {
        setSubmitting(false);
        setPending(null);
        if (res.success) {
          // Flash the card green, then refresh the live list after a beat.
          setResolvedIds((m) => ({ ...m, [problem.id]: action.label }));
          if (res.problems) {
            setTimeout(() => {
              setData(parseProblemsResponse(res));
              setResolvedIds((m) => {
                const next = { ...m };
                delete next[problem.id];
                return next;
              });
            }, 1400);
          } else {
            setTimeout(load, 1400);
          }
        } else {
          alert(res.error || "Could not resolve this problem.");
        }
      })
      .catch(() => {
        setSubmitting(false);
        setPending(null);
        alert("Network error while resolving.");
      });
  };

  const { problems, summary } = data;

  if (loading && problems.length === 0) {
    return <div style={{ padding: 20, color: C.gray }}>Scanning your portfolio for issues…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 20, color: C.redDark, background: C.redBg, borderRadius: 12, border: `0.5px solid ${C.red}` }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Header — plain-language summary for the owner */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3 }}>
          {summary.total > 0
            ? `${summary.total} thing${summary.total > 1 ? "s" : ""} need${summary.total > 1 ? "" : "s"} your attention`
            : "Everything is on track"}
        </div>
        <div style={{ fontSize: 12.5, color: C.gray }}>
          {summary.total > 0
            ? `Across ${summary.projectsAffected} of ${summary.projectsTotal} active projects. Each issue below has a recommended fix — pick one and confirm.`
            : "No conflicts, delays, or weather risks detected across your portfolio."}
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 20 }}>
        <KpiCard label="Open Problems" value={`${summary.total}`} valueColor={summary.total > 0 ? C.red : C.greenDark} sub="Need a decision" />
        <KpiCard label="Critical" value={`${summary.critical}`} valueColor={summary.critical > 0 ? C.redDark : C.greenDark} sub="Double-bookings" />
        <KpiCard label="Projects Affected" value={`${summary.projectsAffected}`} valueColor={C.amber} sub={`of ${summary.projectsTotal} active`} />
      </div>

      {/* Empty state */}
      {problems.length === 0 && (
        <div style={{ padding: "44px 20px", textAlign: "center", background: C.white, borderRadius: 12, border: `0.5px solid ${C.grayLight}` }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>No open problems</div>
          <div style={{ fontSize: 12.5, color: C.gray }}>Your portfolio is conflict-free and on schedule.</div>
        </div>
      )}

      {/* Problem cards */}
      {problems.map((p) => {
        const meta = CATEGORY_META[p.category];
        const resolved = resolvedIds[p.id];
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
            {/* Resolved overlay state */}
            {resolved ? (
              <div style={{ padding: "18px 18px", background: C.greenBg, display: "flex", alignItems: "center", gap: 10 }}>
                <CheckCircle2 size={22} color={C.green} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.greenDark }}>Resolved — {p.title}</div>
                  <div style={{ fontSize: 12, color: C.greenDark }}>{resolved}</div>
                </div>
              </div>
            ) : (
              <>
                {/* What's wrong */}
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${meta.border}`, background: meta.bg }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: meta.accent, background: C.white, border: `1px solid ${meta.border}`, padding: "2px 8px", borderRadius: 20 }}>
                      {meta.icon} {meta.label.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{p.title}</span>
                    <span style={{ fontSize: 11, color: C.gray, marginLeft: "auto" }}>{p.projectName}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55, marginBottom: 6 }}>{p.what}</div>
                  <div style={{ fontSize: 11.5, color: meta.accent, lineHeight: 1.5, display: "flex", gap: 5 }}>
                    <span style={{ fontWeight: 700 }}>Impact:</span> <span style={{ color: C.text }}>{p.impact}</span>
                  </div>
                </div>

                {/* Suggested fixes */}
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: C.gray, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Suggested fixes — pick one
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.suggestedActions.map((a) => (
                      <ActionRow key={a.id} action={a} onPick={() => setPending({ problem: p, action: a })} />
                    ))}
                  </div>
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

/** A single suggested-fix row. Reassign actions show the replacement's rate + bio/skills. */
function ActionRow({ action, onPick }: { action: ProblemAction; onPick: () => void }) {
  const r = action.resource;
  const recommended = action.recommended;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
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
        </div>
        <div style={{ fontSize: 11, color: C.gray, marginTop: 2, lineHeight: 1.45 }}>{action.detail}</div>
        {r && r.skills && r.skills.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
            {r.skills.slice(0, 4).map((s) => (
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
  problem,
  action,
  submitting,
  onCancel,
  onConfirm,
}: {
  problem: Problem;
  action: ProblemAction;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
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
                  {r.skills.map((s) => (
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
