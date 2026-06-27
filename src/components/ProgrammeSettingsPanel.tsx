import React, { useEffect, useState } from "react";
import { useProgrammeSettings } from "../hooks/useProgrammeSettings";
import { LabelWithInfo } from "./InfoTip";

const C = {
  navy: "#0F1F3D",
  blue: "#1A5FA8",
  gray: "#64748B",
  grayLight: "#E2E8F0",
  white: "#FFFFFF",
};

/** Programme scheduling preferences (stored locally per browser). */
export default function ProgrammeSettingsPanel() {
  const { autoCascadeDependents, setAutoCascadeDependents } = useProgrammeSettings();

  // Tight-handover control lives server-side (the conflict engine reads it), so
  // fetch it on mount and PUT changes back. The PUT re-runs detection server-side.
  const [tightEnabled, setTightEnabled] = useState(true);
  const [tightThreshold, setTightThreshold] = useState(3);

  useEffect(() => {
    fetch("/api/v1/settings")
      .then((r) => r.json())
      .then((s) => {
        if (s?.tightHandover) {
          setTightEnabled(s.tightHandover.enabled);
          setTightThreshold(s.tightHandover.thresholdDays);
        }
      })
      .catch(() => {});
  }, []);

  const saveTightHandover = (next: { enabled?: boolean; thresholdDays?: number }) => {
    const body = {
      enabled: next.enabled ?? tightEnabled,
      thresholdDays: next.thresholdDays ?? tightThreshold,
    };
    setTightEnabled(body.enabled);
    setTightThreshold(body.thresholdDays);
    fetch("/api/v1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tightHandover: body }),
    }).catch(() => {});
  };

  return (
    <div
      style={{
        background: C.white,
        border: `0.5px solid ${C.grayLight}`,
        borderRadius: 12,
        padding: 18,
        marginBottom: 16,
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: "0 0 4px 0" }}>
        Programme settings
      </h3>
      <p style={{ fontSize: 12, color: C.gray, margin: "0 0 14px 0", lineHeight: 1.5 }}>
        Scheduling behaviour on the Gantt timeline and when editing tasks. Saved in this browser.
      </p>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          cursor: "pointer",
          padding: "10px 12px",
          borderRadius: 8,
          border: `0.5px solid ${C.grayLight}`,
          background: "#F8FAFC",
        }}
      >
        <input
          type="checkbox"
          checked={autoCascadeDependents}
          onChange={(e) => setAutoCascadeDependents(e.target.checked)}
          style={{ width: 15, height: 15, marginTop: 2, accentColor: C.blue }}
        />
        <span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.navy }}>
            <LabelWithInfo
              label="Auto-move linked tasks"
              title="Auto-Move Linked Tasks"
              body={
                "When turned on, moving or extending a task automatically moves the tasks that follow it (the ones set to start after it).\n\nWhen turned off, only the task you edit moves. When you drag a task to reschedule it, you may be asked once whether to move the following tasks too."
              }
            />
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: C.gray, marginTop: 4, lineHeight: 1.45 }}>
            {autoCascadeDependents
              ? "Following tasks move automatically when dates change."
              : "Only the selected task moves unless you choose to move the following tasks too."}
          </span>
        </span>
      </label>

      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: `0.5px solid ${C.grayLight}`,
          background: "#F8FAFC",
          marginTop: 10,
        }}
      >
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={tightEnabled}
            onChange={(e) => saveTightHandover({ enabled: e.target.checked })}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: C.blue }}
          />
          <span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.navy }}>
              <LabelWithInfo
                label="Flag tight handovers"
                title="Tight Handover Warnings"
                body={
                  "When turned on, FlowIQ flags any job that starts with little or no gap after the job it depends on — if the first job runs even a little over, the next can't start.\n\nSet the number of working days below: a handover is flagged when the gap is under that many days. Turn the checkbox off to stop showing these warnings entirely."
                }
              />
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: C.gray, marginTop: 4, lineHeight: 1.45 }}>
              {tightEnabled
                ? "Warn when the gap before a dependent job is under the days set below."
                : "Tight-handover warnings are turned off."}
            </span>
          </span>
        </label>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            paddingLeft: 25,
            opacity: tightEnabled ? 1 : 0.45,
            pointerEvents: tightEnabled ? "auto" : "none",
          }}
        >
          <span style={{ fontSize: 11.5, color: C.navy, fontWeight: 600 }}>Tight if the gap is under</span>
          <input
            type="number"
            min={0}
            max={10}
            value={tightThreshold}
            onChange={(e) => saveTightHandover({ thresholdDays: parseInt(e.target.value, 10) || 0 })}
            style={{
              width: 52,
              padding: "4px 6px",
              fontSize: 12,
              border: `0.5px solid ${C.grayLight}`,
              borderRadius: 6,
              color: C.navy,
            }}
          />
          <span style={{ fontSize: 11.5, color: C.navy, fontWeight: 600 }}>working days</span>
        </div>
      </div>
    </div>
  );
}
