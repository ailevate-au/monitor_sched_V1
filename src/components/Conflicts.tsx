import { useState, useEffect, useMemo } from "react";
import { TriangleAlert, RefreshCw } from "lucide-react";
import { Conflict, ConflictHubResponse, ConflictOverlapPair, FragileTaskSummary, parseConflictHubResponse } from "../types";
import { parseProgrammeDate } from "../lib/programmeDate";
import { KpiCard, StatusBadge, Btn } from "./Dashboard";

const C = {
  blue:       "#1A5FA8",
  blueMid:    "#3A8ADE",
  blueLight:  "#E6F0FB",
  green:      "#1D9E75",
  greenBg:    "#ECFDF5",
  greenDark:  "#2D6A0A",
  amber:      "#B87316",
  amberBg:    "#FEF3C7",
  red:        "#E04A4A",
  redDark:    "#9B2C2C",
  redBg:      "#FEF2F2",
  gray:       "#64748B",
  grayLight:  "#E2E8F0",
  text:       "#1E293B",
  white:      "#FFFFFF",
  purple:     "#7F77DD",
  purpleBg:   "#F3F2FF",
};

const EMPTY_HUB: ConflictHubResponse = {
  conflicts: [],
  metrics: {
    hardConflicts: 0,
    fragileBufferSlots: 0,
    resolvedThisFortnight: 0,
  },
  fragileTasks: [],
};

type RankedCandidate = Conflict["candidates"][number] & {
  score: number;
  reasonTags: string[];
};

function buildReasonTags(candidate: Conflict["candidates"][number], trade: string): string[] {
  const tags = [`Same trade · ${trade}`];
  if (candidate.same_state) tags.push("Same state");
  if (candidate.util <= 60) tags.push("Low load");
  else if (candidate.util <= 80) tags.push("Available capacity");
  else tags.push("Higher load");
  if (candidate.recommended) tags.push("Best fit");
  return tags;
}

function rankCandidates(
  conflict: Conflict,
  allConflicts: Conflict[],
  refreshSeed: number
): RankedCandidate[] {
  const conflictedIds = new Set(allConflicts.map((c) => c.resourceId));
  return [...conflict.candidates]
    .filter((candidate) => !conflictedIds.has(candidate.id))
    .map((candidate) => {
      const utilScore = Math.max(0, 100 - candidate.util);
      const stateBonus = candidate.same_state ? 25 : 0;
      const recommendedBonus = candidate.recommended ? 15 : 0;
      const jitter = ((refreshSeed * 17 + candidate.id.charCodeAt(1)) % 7) - 3;
      const score = utilScore + stateBonus + recommendedBonus + jitter;
      return {
        ...candidate,
        score,
        reasonTags: buildReasonTags(candidate, conflict.trade),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function AiRecommendationCard({
  conflict,
  allConflicts,
  refreshSeed,
  onRefresh,
  onAssign,
}: {
  conflict: Conflict;
  allConflicts: Conflict[];
  refreshSeed: number;
  onRefresh: () => void;
  onAssign: (candidateId: string) => void;
}) {
  const ranked = useMemo(
    () => rankCandidates(conflict, allConflicts, refreshSeed).slice(0, 3),
    [conflict, allConflicts, refreshSeed]
  );
  const topPick = ranked[0];

  return (
    <div
      style={{
        marginBottom: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${C.purple}44`,
        background: C.purpleBg,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.purple }}>AI Recommendation</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 6,
            border: `1px solid ${C.purple}55`,
            background: C.white,
            color: C.purple,
            cursor: "pointer",
          }}
        >
          ↻ Refresh recommendation
        </button>
      </div>

      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55, marginBottom: 10 }}>
        <strong>Why {conflict.resource} cannot be used:</strong>{" "}
        {conflict.reasonSummary || conflict.desc}
        {typeof conflict.utilPercent === "number" && (
          <span style={{ color: C.gray }}> · Current load {conflict.utilPercent}%</span>
        )}
      </div>

      {conflict.overlapPairs && conflict.overlapPairs.length > 0 && (
        <div style={{ fontSize: 11.5, color: C.redDark, background: C.redBg, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          {conflict.overlapPairs.map((pair, idx) => (
            <div key={idx} style={{ marginBottom: idx < conflict.overlapPairs!.length - 1 ? 4 : 0 }}>
              • {pair.taskA} ({pair.datesA}) ↔ {pair.taskB} ({pair.datesB})
            </div>
          ))}
        </div>
      )}

      {topPick ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.gray, marginBottom: 6 }}>Suggested replacement</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${C.green}`,
              background: C.greenBg,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#B5D4F4",
                color: "#0C447C",
                fontSize: 10,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {topPick.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{topPick.name}</div>
              <div style={{ fontSize: 10.5, color: C.gray }}>
                {topPick.rate} · Load {topPick.util}%
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {topPick.reasonTags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 9.5,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: C.white,
                      color: C.blue,
                      fontWeight: 600,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <Btn primary small onClick={() => onAssign(topPick.id)}>
              Apply suggestion
            </Btn>
          </div>

          {ranked.length > 1 && (
            <div style={{ fontSize: 10.5, color: C.gray }}>
              Alternatives: {ranked.slice(1).map((c) => c.name).join(", ")}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 11.5, color: C.gray }}>
          No suitable replacement found for {conflict.trade}. Consider subcontracting or rescheduling one of the overlapping tasks.
        </div>
      )}
    </div>
  );
}

export default function ScreenConflicts({ onNav }: { onNav?: (screen: string) => void }) {
  const [hub, setHub] = useState<ConflictHubResponse>(EMPTY_HUB);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const applyHub = (payload: ConflictHubResponse) => {
    setHub(payload);
    setLoading(false);
    setError(null);
  };

  const fetchConflicts = () => {
    setLoading(true);
    fetch("/api/v1/conflicts")
      .then(res => {
        if (!res.ok) throw new Error("Could not load conflict hub data");
        return res.json();
      })
      .then(data => applyHub(parseConflictHubResponse(data)))
      .catch(err => {
        console.error("Conflicts: Error fetching conflicts:", err);
        setError(err.message || "Failed to load conflict hub");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchConflicts();
  }, []);

  const handleAssignCandidate = (conflictId: string, candidateId: string) => {
    fetch(`/api/v1/conflicts/${conflictId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetResourceId: candidateId })
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.success) {
          if (resData.hub) {
            applyHub(parseConflictHubResponse(resData.hub));
          } else {
            fetchConflicts();
          }
          setActionMessage(resData.message || "Manpower reassigned successfully.");
        } else {
          alert(resData.error || "Could not reassign");
        }
      })
      .catch(err => console.error("Error resolving conflict:", err));
  };

  const { conflicts, metrics, fragileTasks } = hub;

  if (loading && conflicts.length === 0 && fragileTasks.length === 0) {
    return <div style={{ padding: 20, color: C.gray }}>Checking schedule conflicts...</div>;
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
      {actionMessage && (
        <div style={{ marginBottom: 14, padding: "11px 14px", background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 10, color: C.greenDark, fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <span>✓</span> {actionMessage}
        </div>
      )}

      {/* Page header — one sentence explaining what to do here */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>
            {conflicts.length > 0
              ? `${metrics.hardConflicts} person${metrics.hardConflicts > 1 ? "s are" : " is"} assigned to overlapping tasks`
              : "No active conflicts"}
          </div>
          <div style={{ fontSize: 12, color: C.gray }}>
            {conflicts.length > 0
              ? "Pick a free replacement below — the change saves immediately."
              : "All resources are scheduled without overlaps."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 11.5, color: C.gray, background: "#F8FAFC", border: `0.5px solid ${C.grayLight}`, borderRadius: 8, padding: "6px 12px" }}>
            Want to move dates instead?{" "}
            {onNav
              ? <button type="button" onClick={() => onNav("gantt")} style={{ background: "none", border: "none", color: C.blue, fontWeight: 600, fontSize: 11.5, cursor: "pointer", padding: 0 }}>Open Timeline →</button>
              : <span style={{ color: C.blue, fontWeight: 600 }}>Open Timeline</span>
            }
          </div>
          {metrics.resolvedThisFortnight > 0 && (
            <div style={{ fontSize: 11, color: C.greenDark, background: C.greenBg, border: `0.5px solid ${C.green}`, borderRadius: 8, padding: "6px 10px", fontWeight: 600 }}>
              ✓ {metrics.resolvedThisFortnight} resolved this fortnight
            </div>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
        <KpiCard label="Active Conflicts" value={`${metrics.hardConflicts}`} valueColor={metrics.hardConflicts > 0 ? C.red : C.greenDark} sub="Same person, overlapping tasks" />
        <KpiCard label="Fragile Buffers" value={`${metrics.fragileBufferSlots}`} valueColor={C.amber} sub="≤ 1 working day gap" />
        <KpiCard label="Resolved (14 days)" value={`${metrics.resolvedThisFortnight}`} valueColor={C.greenDark} sub="Reassignments completed" />
      </div>

      {/* No conflicts state */}
      {conflicts.length === 0 && fragileTasks.length === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center", background: C.white, borderRadius: 12, border: `0.5px solid ${C.grayLight}` }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>Programme is conflict-free</div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 20 }}>No double-bookings detected. Head back to the Timeline to keep scheduling.</div>
          {onNav && (
            <button type="button" onClick={() => onNav("gantt")}
              style={{ padding: "10px 24px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: C.blue, color: C.white, cursor: "pointer" }}>
              📅 Back to Timeline
            </button>
          )}
        </div>
      )}

      {/* Conflict cards — one per conflicted person */}
      {conflicts.map(c => {
        const conflictedIds = new Set(conflicts.map(x => x.resourceId));
        const available = c.candidates.filter(cd => !conflictedIds.has(cd.id));
        const ranked = [...available].sort((a, b) => {
          const scoreA = (100 - a.util) + (a.same_state ? 25 : 0) + (a.recommended ? 15 : 0);
          const scoreB = (100 - b.util) + (b.same_state ? 25 : 0) + (b.recommended ? 15 : 0);
          return scoreB - scoreA;
        });
        const topPick = ranked[0];

        return (
          <div key={c.id} style={{ border: `1px solid #FECACA`, borderRadius: 12, marginBottom: 14, background: C.white, overflow: "hidden" }}>

            {/* Who is conflicted + what tasks overlap */}
            <div style={{ padding: "14px 16px", borderBottom: `1px solid #FEE2E2`, background: "#FFF8F8" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.redBg, color: C.redDark, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {c.resource.split(" ").map(w => w[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.redDark }}>{c.resource}</div>
                  <div style={{ fontSize: 11, color: C.gray }}>{c.trade} · {c.rate}</div>
                </div>
              </div>
              {c.overlapPairs && c.overlapPairs.length > 0 && (
                <div style={{ fontSize: 11.5, color: C.text, background: C.redBg, borderRadius: 8, padding: "8px 10px", lineHeight: 1.6 }}>
                  {c.overlapPairs.map((pair, i) => (
                    <div key={i}>⚠ <strong>{pair.taskA}</strong> ({pair.datesA}) overlaps with <strong>{pair.taskB}</strong> ({pair.datesB})</div>
                  ))}
                </div>
              )}
            </div>

            {/* Replacement list */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                Free {c.trade}s you can assign instead:
              </div>

              {ranked.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", background: "#F8FAFC", borderRadius: 10, border: `0.5px solid ${C.grayLight}` }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>😕</div>
                  <div style={{ fontSize: 12, color: C.gray }}>No other {c.trade} available for these dates.</div>
                  <div style={{ fontSize: 11.5, color: C.gray, marginTop: 4 }}>
                    Try rescheduling one of the overlapping tasks in the Timeline instead.
                    {onNav && <> <button type="button" onClick={() => onNav("gantt")} style={{ background: "none", border: "none", color: C.blue, fontWeight: 600, cursor: "pointer", fontSize: 11.5, padding: 0 }}>Open Timeline →</button></>}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ranked.map((cd, i) => (
                    <div key={cd.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${i === 0 && cd.recommended ? C.green : C.grayLight}`,
                      background: i === 0 && cd.recommended ? C.greenBg : C.white,
                    }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: i === 0 && cd.recommended ? "#B7F0D8" : "#EEF2F8", color: i === 0 && cd.recommended ? "#085041" : "#475569", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {cd.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                          {cd.name}
                          {i === 0 && cd.recommended && <span style={{ fontSize: 10, background: C.green, color: C.white, padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>Best fit</span>}
                          {!cd.same_state && <span style={{ fontSize: 10, background: C.amberBg, color: C.amber, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>Interstate · {cd.state}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
                          {cd.rate} · {cd.util}% current load
                        </div>
                      </div>
                      <button type="button" onClick={() => handleAssignCandidate(c.id, cd.id)}
                        style={{
                          padding: i === 0 && cd.recommended ? "8px 16px" : "6px 12px",
                          fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none",
                          background: i === 0 && cd.recommended ? C.green : "#E2E8F0",
                          color: i === 0 && cd.recommended ? C.white : C.text,
                          cursor: "pointer", flexShrink: 0,
                          transition: "all 0.1s",
                        }}>
                        {i === 0 && cd.recommended ? "Assign now →" : "Assign →"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Fragile buffer section */}
      {fragileTasks.length > 0 && (
        <div style={{ marginTop: conflicts.length > 0 ? 8 : 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
            ⚡ Fragile buffers — tasks with less than 1 day gap
          </div>
          {fragileTasks.map((task, i) => (
            <div key={i}><FragileTaskCard task={task} /></div>
          ))}
        </div>
      )}
    </div>
  );
}

function FragileTaskCard({ task }: { task: FragileTaskSummary }) {
  return (
    <div style={{ border:`0.5px solid ${C.amber}`, borderRadius:12, padding:"12px 14px", marginBottom:10, background:C.amberBg }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
        <StatusBadge status="fragile" />
        <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{task.name}</span>
        <span style={{ fontSize:11, color:C.gray }}>{task.resource} · {task.trade}</span>
      </div>
      <div style={{ fontSize:11.5, color:C.gray, lineHeight:1.5 }}>{task.desc}</div>
    </div>
  );
}
