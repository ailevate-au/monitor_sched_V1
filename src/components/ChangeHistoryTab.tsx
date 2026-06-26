import React, { useState } from "react";
import { History, Undo2, TriangleAlert } from "lucide-react";
import { Task } from "../types";
import { ChangeSet } from "../lib/changeHistory";

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
  purple: "#7F77DD",
  gray: "#64748B",
  grayLight: "#E2E8F0",
  text: "#1E293B",
  textMuted: "#475569",
  white: "#FFFFFF",
};

const MODE_LABEL: Record<ChangeSet["mode"], string> = {
  full: "Moved all following tasks",
  partial: "Used spare time first",
  none: "Moved only this task",
};

function taskShort(name: string): string {
  return name.split(" — ")[0] || name;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Tasks in this set whose live position no longer matches what the set applied. */
function staleMoves(cs: ChangeSet, currentById: Map<string, Task>): string[] {
  const stale: string[] = [];
  for (const m of cs.moves) {
    const current = currentById.get(m.taskId);
    if (!current) {
      stale.push(`${taskShort(m.name)} no longer exists`);
    } else if (current.start !== m.toStart || current.end !== m.toEnd) {
      stale.push(`${taskShort(m.name)} was changed since (now ${current.start} → ${current.end})`);
    }
  }
  return stale;
}

export default function ChangeHistoryTab({
  changeSets,
  currentTasks,
  onRevert,
}: {
  changeSets: ChangeSet[];
  currentTasks: Task[];
  onRevert: (cs: ChangeSet) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const currentById = new Map(currentTasks.map((t) => [t.id, t]));

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  if (changeSets.length === 0) {
    return (
      <div
        style={{
          border: `0.5px solid ${C.grayLight}`,
          borderRadius: 12,
          background: C.white,
          padding: "40px 20px",
          textAlign: "center",
          color: C.gray,
        }}
      >
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
          <History size={32} color={C.gray} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          No changes yet
        </div>
        <div style={{ fontSize: 12 }}>
          Move a job, change a date, or mark one delayed. Every change shows up here, and you can
          undo it.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: C.textMuted }}>
        {changeSets.filter((c) => !c.reverted).length} active ·{" "}
        {changeSets.filter((c) => c.reverted).length} undone · newest first
      </div>

      {changeSets.map((cs) => {
        const stale = cs.reverted ? [] : staleMoves(cs, currentById);
        const isConfirming = confirming === cs.id;

        return (
          <div
            key={cs.id}
            style={{
              border: `1px solid ${cs.reverted ? C.grayLight : "#DAD7F5"}`,
              borderRadius: 12,
              background: cs.reverted ? "#F8FAFC" : C.white,
              opacity: cs.reverted ? 0.7 : 1,
              overflow: "hidden",
            }}
          >
            {/* Row header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {taskShort(cs.anchorTaskName)}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 7px",
                      borderRadius: 20,
                      background: "#EFEDFF",
                      color: C.purple,
                    }}
                  >
                    {cs.summary
                      ? cs.summary
                      : `${MODE_LABEL[cs.mode]}${cs.delayWorkingDays > 0 ? ` · +${cs.delayWorkingDays} days` : ""}`}
                  </span>
                  {cs.moves.length > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "1px 7px",
                        borderRadius: 20,
                        background: C.blueLight,
                        color: C.blue,
                      }}
                    >
                      {cs.moves.length} task{cs.moves.length === 1 ? "" : "s"} moved
                    </span>
                  )}
                  {cs.reverted && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 7px",
                        borderRadius: 20,
                        background: C.grayLight,
                        color: C.gray,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <Undo2 size={10} /> Undone
                    </span>
                  )}
                  {!cs.reverted && cs.warningsAtConfirm.length > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 7px",
                        borderRadius: 20,
                        background: C.amberBg,
                        color: C.amber,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <TriangleAlert size={10} /> confirmed with {cs.warningsAtConfirm.length}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 3 }}>
                  {formatTimestamp(cs.createdAt)}
                  {cs.reverted && cs.revertedAt ? ` · reverted ${formatTimestamp(cs.revertedAt)}` : ""}
                </div>
              </div>

              {cs.moves.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(cs.id)}
                  style={{
                    padding: "5px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: `1px solid ${C.grayLight}`,
                    background: C.white,
                    color: C.textMuted,
                    cursor: "pointer",
                  }}
                >
                  {expanded[cs.id] ? "Hide ▲" : "Details ▼"}
                </button>
              )}
              {!cs.reverted && cs.moves.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirming(isConfirming ? null : cs.id)}
                  style={{
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 6,
                    border: `1px solid ${C.red}`,
                    background: isConfirming ? C.redBg : C.white,
                    color: C.redDark,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Undo2 size={12} /> Undo
                  </span>
                </button>
              )}
            </div>

            {/* Expanded moves */}
            {expanded[cs.id] && (
              <div style={{ borderTop: `1px solid ${C.grayLight}`, padding: "10px 14px" }}>
                {cs.moves.map((m) => (
                  <div key={m.taskId} style={{ fontSize: 11.5, color: C.text, marginBottom: 3 }}>
                    <strong>{taskShort(m.name)}</strong>{" "}
                    <span style={{ color: C.gray }}>({m.taskId})</span>:{" "}
                    <span style={{ textDecoration: "line-through", color: C.gray }}>
                      {m.fromStart} → {m.fromEnd}
                    </span>{" "}
                    <span style={{ color: C.purple, fontWeight: 700 }}>⇒</span>{" "}
                    <span style={{ fontWeight: 600 }}>
                      {m.toStart} → {m.toEnd}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Revert confirmation with safeguards */}
            {isConfirming && !cs.reverted && (
              <div
                style={{
                  borderTop: `1px solid #FECACA`,
                  background: C.redBg,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.redDark, marginBottom: 6 }}>
                  Undo this change?
                </div>
                <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>
                  This restores the original dates for all {cs.moves.length} task
                  {cs.moves.length === 1 ? "" : "s"} in one step. Double-bookings, tight gaps and
                  overdue flags will be recalculated and may change across the app.
                </div>

                {stale.length > 0 && (
                  <div
                    style={{
                      background: C.white,
                      border: `1px solid ${C.amber}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.amber, marginBottom: 4 }}>
                      <TriangleAlert size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                      {stale.length} task{stale.length === 1 ? " was" : "s were"} changed after this
                      adjustment
                    </div>
                    {stale.map((s, i) => (
                      <div key={i} style={{ fontSize: 11, color: C.textMuted }}>
                        • {s}
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: C.redDark, marginTop: 4, fontWeight: 600 }}>
                      Undoing will overwrite those later changes.
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    style={{
                      padding: "6px 12px",
                      fontSize: 11.5,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: `1px solid ${C.grayLight}`,
                      background: C.white,
                      color: C.text,
                      cursor: "pointer",
                    }}
                  >
                    Keep changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      onRevert(cs);
                    }}
                    style={{
                      padding: "6px 14px",
                      fontSize: 11.5,
                      fontWeight: 700,
                      borderRadius: 8,
                      border: "none",
                      background: C.red,
                      color: C.white,
                      cursor: "pointer",
                    }}
                  >
                    {stale.length > 0 ? "Undo anyway" : "Undo change"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
