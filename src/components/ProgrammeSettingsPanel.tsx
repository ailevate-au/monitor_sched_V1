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
    </div>
  );
}
