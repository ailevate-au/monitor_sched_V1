import React from "react";
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
              label="Auto-shift dependent tasks"
              body={
                "When enabled, moving or extending a task automatically pushes successor tasks that are linked by dependencies (Finish-to-Start or Start-to-Start, including lag days).\n\nWhen disabled, only the task you edit moves. On drag-reschedule, you may be asked once whether to include dependents."
              }
            />
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: C.gray, marginTop: 4, lineHeight: 1.45 }}>
            {autoCascadeDependents
              ? "Successors will follow predecessors when dates change."
              : "Only the selected task moves unless you confirm shifting dependents."}
          </span>
        </span>
      </label>
    </div>
  );
}
