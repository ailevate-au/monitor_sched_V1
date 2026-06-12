import React from "react";
import { Task } from "../types";
import {
  AdjustmentSummary,
  AdjustmentWarning,
  CascadeMode,
  TaskMove,
} from "../lib/timelineAdjust";

const C = {
  navy: "#0F1F3D",
  blue: "#1A5FA8",
  blueMid: "#3A8ADE",
  blueLight: "#E6F0FB",
  green: "#1D9E75",
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

const MODE_INFO: { id: CascadeMode; label: string; help: string }[] = [
  { id: "full", label: "Full cascade", help: "Push every dependent in this project by the same delay." },
  { id: "partial", label: "Partial", help: "Dependents absorb spare margin first, then shift." },
  { id: "none", label: "No cascade", help: "Move only this task — dependents stay put." },
];

function taskShort(name: string): string {
  return name.split(" — ")[0] || name;
}

export default function TimelineAdjustPanel({
  anchorTask,
  candidateTasks,
  mode,
  delayDays,
  maxDelay,
  moves,
  warnings,
  summary,
  onAnchorChange,
  onModeChange,
  onDelayChange,
  onConfirm,
  onCancel,
}: {
  anchorTask: Task;
  candidateTasks: Task[];
  mode: CascadeMode;
  delayDays: number;
  maxDelay: number;
  moves: TaskMove[];
  warnings: AdjustmentWarning[];
  summary: AdjustmentSummary;
  onAnchorChange: (id: string) => void;
  onModeChange: (m: CascadeMode) => void;
  onDelayChange: (d: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const anchorMove = moves.find((m) => m.taskId === anchorTask.id);
  const staged = delayDays > 0 && moves.length > 0;
  const dangerWarnings = warnings.filter((w) => w.severity === "danger");

  return (
    <div
      style={{
        marginBottom: 16,
        borderRadius: 12,
        border: `1.5px solid ${C.purple}`,
        background: "#F7F6FF",
        boxShadow: "0 4px 16px rgba(127,119,221,0.14)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 14px",
          background: C.navy,
          color: C.white,
        }}
      >
        <span style={{ fontSize: 16 }}>⏱</span>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Stage timeline adjustment</span>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            border: "none",
            color: C.white,
            fontSize: 15,
            cursor: "pointer",
          }}
          title="Discard staged adjustment"
        >
          ✕
        </button>
      </div>

      <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Anchor + dates */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.gray, marginBottom: 4 }}>
              TASK TO DELAY
            </label>
            <select
              value={anchorTask.id}
              onChange={(e) => onAnchorChange(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 8px",
                borderRadius: 8,
                border: `0.5px solid ${C.grayLight}`,
                fontSize: 12.5,
                background: C.white,
              }}
            >
              {candidateTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {taskShort(t.name)} ({t.id}){t.project ? ` · ${t.project.split(" —")[0]}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: 12, color: C.textMuted }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.gray, marginBottom: 4 }}>SCHEDULE</div>
            {staged && anchorMove ? (
              <span>
                <span style={{ textDecoration: "line-through", color: C.gray }}>
                  {anchorMove.fromStart} → {anchorMove.fromEnd}
                </span>
                <span style={{ margin: "0 6px", color: C.purple, fontWeight: 700 }}>⇒</span>
                <span style={{ color: C.text, fontWeight: 700 }}>
                  {anchorMove.toStart} → {anchorMove.toEnd}
                </span>
              </span>
            ) : (
              <span style={{ color: C.text, fontWeight: 600 }}>
                {anchorTask.start} → {anchorTask.end}
              </span>
            )}
          </div>
        </div>

        {/* Cascade mode */}
        <div>
          <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.gray, marginBottom: 6 }}>
            CASCADE MODE
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MODE_INFO.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onModeChange(m.id)}
                  style={{
                    flex: "1 1 170px",
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${active ? C.purple : C.grayLight}`,
                    background: active ? "#EFEDFF" : C.white,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? C.purple : C.text }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.textMuted, lineHeight: 1.35, marginTop: 2 }}>
                    {m.help}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Slider */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: C.gray }}>DELAY (WORKING DAYS)</label>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.purple }}>
              +{delayDays} working day{delayDays === 1 ? "" : "s"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={maxDelay}
            step={1}
            value={delayDays}
            onChange={(e) => onDelayChange(Number(e.target.value))}
            style={{ width: "100%", accentColor: C.purple, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: C.gray }}>
            <span>0</span>
            <span>{maxDelay}</span>
          </div>
        </div>

        {/* Summary */}
        {staged && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
            <SummaryChip label="tasks shifted" value={summary.shifted} tone="neutral" />
            <SummaryChip label="new conflicts" value={summary.newlyConflict} tone="danger" />
            <SummaryChip label="now fragile" value={summary.newlyFragile} tone="warn" />
            <SummaryChip label="now overdue" value={summary.newlyOverdue} tone="warn" />
          </div>
        )}

        {/* Warnings */}
        {staged && warnings.length > 0 && (
          <div
            style={{
              borderRadius: 8,
              border: `1px solid ${dangerWarnings.length ? "#FECACA" : C.amberBg}`,
              background: dangerWarnings.length ? C.redBg : C.amberBg,
              padding: "9px 12px",
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: dangerWarnings.length ? C.redDark : C.amber,
                marginBottom: 4,
              }}
            >
              ⚠ {warnings.length} warning{warnings.length === 1 ? "" : "s"} — you can still confirm
            </div>
            {warnings.slice(0, 6).map((w, i) => (
              <div
                key={i}
                style={{ fontSize: 11.5, color: w.severity === "danger" ? C.redDark : C.text, marginBottom: 2 }}
              >
                • {w.message}
              </div>
            ))}
            {warnings.length > 6 && (
              <div style={{ fontSize: 11, color: C.textMuted }}>…and {warnings.length - 6} more</div>
            )}
          </div>
        )}

        {staged && warnings.length === 0 && (
          <div style={{ fontSize: 11.5, color: C.greenDark, fontWeight: 600 }}>
            ✓ No conflicts created by this adjustment.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: `1px solid ${C.grayLight}`,
              background: C.white,
              color: C.text,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!staged}
            title={staged ? "Apply this adjustment to the live programme" : "Drag the slider to stage a delay"}
            style={{
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 8,
              border: "none",
              background: staged ? C.purple : C.grayLight,
              color: staged ? C.white : C.gray,
              cursor: staged ? "pointer" : "not-allowed",
            }}
          >
            Confirm adjustment
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warn" | "danger";
}) {
  const palette =
    tone === "danger"
      ? { bg: C.redBg, fg: C.redDark }
      : tone === "warn"
        ? { bg: C.amberBg, fg: C.amber }
        : { bg: C.blueLight, fg: C.blue };
  const muted = value === 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 20,
        background: muted ? "#F1F5F9" : palette.bg,
        color: muted ? C.gray : palette.fg,
        fontWeight: 700,
      }}
    >
      <span style={{ fontSize: 12 }}>{value}</span>
      <span style={{ fontWeight: 500 }}>{label}</span>
    </span>
  );
}
