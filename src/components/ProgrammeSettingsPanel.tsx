import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useProgrammeSettings } from "../hooks/useProgrammeSettings";
import { LabelWithInfo } from "./InfoTip";
import { C } from "../lib/theme";
import { api } from "../lib/api";


/**
 * Programme scheduling preferences. Edits are STAGED locally and only committed
 * when "Save changes" is pressed (no auto-save), so changing several knobs is one
 * write, not one per keystroke. Auto-cascade is a browser preference; the tight-
 * handover and deadline-warning knobs live server-side (the conflict engine reads
 * them), so saving PUTs them and re-runs detection.
 */
export default function ProgrammeSettingsPanel() {
  const { autoCascadeDependents, setAutoCascadeDependents } = useProgrammeSettings();

  // Staged (uncommitted) form state.
  const [autoCascade, setAutoCascade] = useState(autoCascadeDependents);
  const [tightEnabled, setTightEnabled] = useState(true);
  const [tightThreshold, setTightThreshold] = useState(3);
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);

  // The last-saved values, used to detect unsaved changes.
  const [saved, setSaved] = useState({
    autoCascade: autoCascadeDependents,
    tightEnabled: true,
    tightThreshold: 3,
    deadlineEnabled: false,
  });
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    api.get("/settings")
      .then((s) => {
        const next = {
          autoCascade: autoCascadeDependents,
          tightEnabled: s?.tightHandover?.enabled ?? true,
          tightThreshold: s?.tightHandover?.thresholdDays ?? 3,
          deadlineEnabled: s?.deadlineWarnings?.enabled ?? false,
        };
        setAutoCascade(next.autoCascade);
        setTightEnabled(next.tightEnabled);
        setTightThreshold(next.tightThreshold);
        setDeadlineEnabled(next.deadlineEnabled);
        setSaved(next);
      })
      .catch(() => {});
    // autoCascadeDependents read once on mount for the saved baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty =
    autoCascade !== saved.autoCascade ||
    tightEnabled !== saved.tightEnabled ||
    tightThreshold !== saved.tightThreshold ||
    deadlineEnabled !== saved.deadlineEnabled;

  const touch = () => setJustSaved(false);

  const handleSave = () => {
    setSaving(true);
    // Auto-cascade is a browser preference (localStorage); the rest is server-side.
    setAutoCascadeDependents(autoCascade);
    api.put("/settings", {
        tightHandover: { enabled: tightEnabled, thresholdDays: tightThreshold },
        deadlineWarnings: { enabled: deadlineEnabled },
      })
      .catch(() => {})
      .finally(() => {
        setSaved({ autoCascade, tightEnabled, tightThreshold, deadlineEnabled });
        setSaving(false);
        setJustSaved(true);
      });
  };

  const handleDiscard = () => {
    setAutoCascade(saved.autoCascade);
    setTightEnabled(saved.tightEnabled);
    setTightThreshold(saved.tightThreshold);
    setDeadlineEnabled(saved.deadlineEnabled);
    setJustSaved(false);
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
        Schedule settings
      </h3>
      <p style={{ fontSize: 12, color: C.gray, margin: "0 0 14px 0", lineHeight: 1.5 }}>
        Scheduling behaviour on the Gantt timeline and when editing tasks. Edit the options below,
        then click <strong>Save changes</strong> to apply them.
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
          checked={autoCascade}
          onChange={(e) => { setAutoCascade(e.target.checked); touch(); }}
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
            {autoCascade
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
            onChange={(e) => { setTightEnabled(e.target.checked); touch(); }}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: C.blue }}
          />
          <span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.navy }}>
              <LabelWithInfo
                label="Flag tight handovers"
                title="Tight Handover Warnings"
                body={
                  "When turned on, FlowIQ flags any task that starts with little or no gap after the task it depends on — if the first task runs even a little over, the next can't start.\n\nSet the number of working days below: a handover is flagged when the gap is under that many days. Turn the checkbox off to stop showing these warnings entirely."
                }
              />
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: C.gray, marginTop: 4, lineHeight: 1.45 }}>
              {tightEnabled
                ? "Warn when the gap before a dependent task is under the days set below."
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
            onChange={(e) => { setTightThreshold(parseInt(e.target.value, 10) || 0); touch(); }}
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

      {/* Deadline / behind-schedule warning (opt-in). */}
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
            checked={deadlineEnabled}
            onChange={(e) => { setDeadlineEnabled(e.target.checked); touch(); }}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: C.blue }}
          />
          <span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.navy }}>
              <LabelWithInfo
                label="Flag tasks behind schedule"
                title="Behind-Schedule (Deadline) Warnings"
                body={
                  "Each task has a 'Must finish by' deadline (set on the task in the Timeline). When this is turned on, FlowIQ flags any task whose end date has slipped past its deadline — it shows as 'behind schedule' on the Timeline and as a 'Running late' problem the owner can act on.\n\nLeave it off to ignore deadlines (handy to keep the demo simple)."
                }
              />
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: C.gray, marginTop: 4, lineHeight: 1.45 }}>
              {deadlineEnabled
                ? "Tasks whose end date runs past their 'Must finish by' deadline are flagged behind schedule."
                : "Behind-schedule (deadline) warnings are turned off."}
            </span>
          </span>
        </label>
      </div>

      {/* Save / discard row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            padding: "8px 16px",
            fontSize: 12.5,
            fontWeight: 700,
            borderRadius: 8,
            border: "none",
            background: dirty && !saving ? C.blue : C.grayLight,
            color: dirty && !saving ? C.white : C.gray,
            cursor: dirty && !saving ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={handleDiscard}
            style={{
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 8,
              border: `0.5px solid ${C.grayLight}`,
              background: C.white,
              color: C.gray,
              cursor: "pointer",
            }}
          >
            Discard
          </button>
        )}
        {dirty && (
          <span style={{ fontSize: 11.5, color: C.amber, fontWeight: 600 }}>Changes not applied yet</span>
        )}
        {!dirty && justSaved && (
          <span style={{ fontSize: 11.5, color: C.greenDark, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Check size={13} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
