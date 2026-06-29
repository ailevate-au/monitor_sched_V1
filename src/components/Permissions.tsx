import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Check, Lock, RotateCcw, RefreshCw, TriangleAlert } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  PermMatrix,
  PermRole,
  PermissionsPayload,
  cellState,
  fetchPermissions,
  groupFeatures,
  resetPermissions,
  saveRolePermissions,
} from "../lib/permissions";

const C = {
  navy: "#0F1F3D",
  blue: "#1A5FA8",
  blueMid: "#3A8ADE",
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
  textMuted: "#475569",
  white: "#FFFFFF",
  bgSecond: "#EEF2F8",
};

const COL_WIDTH = 110;

function Toggle({
  checked,
  disabled,
  lockReason,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  lockReason?: string;
  onChange?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={disabled ? undefined : onChange}
      title={disabled ? lockReason : checked ? "Enabled — click to disable" : "Disabled — click to enable"}
      style={{
        width: 40,
        height: 23,
        borderRadius: 12,
        border: "none",
        position: "relative",
        padding: 0,
        background: checked ? (disabled ? "#A7C4E4" : C.blue) : disabled ? "#E2E8F0" : "#CBD5E1",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.12s ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2.5,
          left: checked ? 19 : 2.5,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: C.white,
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
          transition: "left 0.12s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8.5,
        }}
      >
        {disabled ? <Lock size={9} strokeWidth={2.5} /> : null}
      </span>
    </button>
  );
}

function OwnerCell() {
  return (
    <span
      title="Owner always has full access"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        color: C.greenDark,
        background: C.greenBg,
        border: `1px solid #BBF7D0`,
        borderRadius: 20,
        padding: "3px 9px",
      }}
    >
      <Check size={12} strokeWidth={3} /> Full
    </span>
  );
}

export default function ScreenPermissions() {
  const { user } = useAuth();
  const [payload, setPayload] = useState<PermissionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<PermRole | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const isOwner = user?.role === "Owner";

  const load = () => {
    setLoading(true);
    fetchPermissions()
      .then((data) => {
        setPayload(data);
        setError(null);
      })
      .catch((e) => setError(e?.message || "Could not load permissions."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOwner) load();
    else setLoading(false);
  }, [isOwner]);

  const grouped = useMemo(
    () => (payload ? groupFeatures(payload.features) : []),
    [payload]
  );

  const flashSaved = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg((m) => (m === msg ? null : m)), 6000);
  };

  const handleToggle = async (role: PermRole, featureKey: string) => {
    if (!payload) return;
    const prevMatrix = payload.matrix;
    const current = !!prevMatrix[role]?.[featureKey];
    const nextRolePerms = { ...prevMatrix[role], [featureKey]: !current };
    const nextMatrix: PermMatrix = { ...prevMatrix, [role]: nextRolePerms };

    // Optimistic update
    setPayload({ ...payload, matrix: nextMatrix });
    setSavingRole(role);
    setError(null);
    try {
      const saved = await saveRolePermissions(role, nextRolePerms);
      setPayload((p) => (p ? { ...p, matrix: saved } : p));
      flashSaved(`Saved ${role}`);
    } catch (e) {
      // Revert on failure
      setPayload((p) => (p ? { ...p, matrix: prevMatrix } : p));
      setError(e instanceof Error ? e.message : "Could not save change.");
    } finally {
      setSavingRole(null);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset all role permissions to their defaults? This cannot be undone.")) {
      return;
    }
    setSavingRole(null);
    setError(null);
    try {
      const data = await resetPermissions();
      setPayload(data);
      flashSaved("Reset to defaults");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset permissions.");
    }
  };

  if (!isOwner) {
    return (
      <div
        style={{
          maxWidth: 520,
          margin: "40px auto",
          background: C.white,
          border: `1px solid ${C.grayLight}`,
          borderRadius: 12,
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
          <ShieldCheck size={34} color={C.gray} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
          Owner access required
        </div>
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.5 }}>
          The permission matrix (Access) can only be configured by an Owner. You are signed in as{" "}
          <strong>{user?.role || "an unknown role"}</strong>.
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, color: C.gray, fontSize: 14 }}>Loading permissions…</div>;
  }

  if (error && !payload) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: C.redDark, fontSize: 13, marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <TriangleAlert size={15} /> {error}
        </div>
        <button type="button" onClick={load} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!payload) return null;

  const editableRoles = payload.roles;
  const allColumns: { key: string; label: string; sub: string; owner?: boolean }[] = [
    { key: "Owner", label: "Owner", sub: "Full access", owner: true },
    ...editableRoles.map((r) => ({ key: r, label: r, sub: "Configurable" })),
  ];

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.navy, display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={20} /> Access — Role Permissions
          </div>
          <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 3, maxWidth: 620, lineHeight: 1.5 }}>
            Choose which sidebar features each role can access. Owner always has full access and
            cannot be edited. Locked rows are fixed by policy.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, minHeight: 16, display: "inline-flex", alignItems: "center", gap: 4, color: error ? C.redDark : savingRole ? C.amber : C.greenDark }}>
            {error ? (
              <><TriangleAlert size={13} /> {error}</>
            ) : savingRole ? (
              `Saving ${savingRole}…`
            ) : statusMsg ? (
              <><Check size={13} /> {statusMsg}</>
            ) : null}
          </span>
          <button type="button" onClick={handleReset} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }} title="Restore the default permission matrix">
            <RotateCcw size={14} /> Reset to Default
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: C.textMuted, marginBottom: 14 }}>
        <LegendItem swatch={<Toggle checked onChange={() => {}} />} label="Editable" />
        <LegendItem swatch={<Toggle checked disabled lockReason="" />} label="Locked on (always available)" />
        <LegendItem swatch={<Toggle checked={false} disabled lockReason="" />} label="Locked off (Owner-only)" />
      </div>

      {/* Matrix */}
      <div style={{ border: `0.5px solid ${C.grayLight}`, borderRadius: 12, overflow: "hidden", background: C.white }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
            <thead>
              <tr style={{ background: C.bgSecond }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "11px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.textMuted,
                    position: "sticky",
                    left: 0,
                    background: C.bgSecond,
                    minWidth: 220,
                  }}
                >
                  Feature / Screen
                </th>
                {allColumns.map((col) => (
                  <th key={col.key} style={{ padding: "8px 10px", width: COL_WIDTH, textAlign: "center" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: col.owner ? C.greenDark : C.navy }}>
                      {col.label}
                    </div>
                    <div style={{ fontSize: 9.5, fontWeight: 500, color: C.gray }}>{col.sub}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ group, features }) => (
                <React.Fragment key={group}>
                  <tr>
                    <td
                      colSpan={allColumns.length + 1}
                      style={{
                        padding: "7px 16px",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: C.gray,
                        background: "#F8FAFC",
                        borderTop: `0.5px solid ${C.grayLight}`,
                      }}
                    >
                      {group}
                    </td>
                  </tr>
                  {features.map((feature) => (
                    <tr key={feature.key} style={{ borderTop: `0.5px solid #F1F5F9` }}>
                      <td
                        style={{
                          padding: "10px 16px",
                          fontSize: 12.5,
                          color: C.text,
                          position: "sticky",
                          left: 0,
                          background: C.white,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{feature.label}</span>
                        {feature.type === "always_on" && <LockTag tone="on">always on</LockTag>}
                        {feature.type === "owner_only" && <LockTag tone="off">owner only</LockTag>}
                      </td>

                      {/* Owner column — always full access */}
                      <td style={{ textAlign: "center", padding: "8px 10px" }}>
                        <OwnerCell />
                      </td>

                      {/* Editable role columns */}
                      {editableRoles.map((role) => {
                        const cs = cellState(feature, role, payload.matrix);
                        return (
                          <td key={role} style={{ textAlign: "center", padding: "8px 10px" }}>
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              <Toggle
                                checked={cs.value}
                                disabled={cs.locked}
                                lockReason={cs.lockReason}
                                onChange={() => handleToggle(role, feature.key)}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.gray, marginTop: 10 }}>
        Changes save automatically per role. Owner-only screens (Financial Dashboard, Pricing, User
        Management, Permissions) stay locked off for every other role.
      </div>
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {swatch}
      {label}
    </span>
  );
}

function LockTag({ tone, children }: { tone: "on" | "off"; children: React.ReactNode }) {
  const palette = tone === "on" ? { bg: C.greenBg, fg: C.greenDark } : { bg: C.bgSecond, fg: C.gray };
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        background: palette.bg,
        color: palette.fg,
        padding: "1px 6px",
        borderRadius: 10,
        verticalAlign: "middle",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      <Lock size={9} strokeWidth={2.5} /> {children}
    </span>
  );
}

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: `0.5px solid ${C.grayLight}`,
  background: C.white,
  color: C.text,
  cursor: "pointer",
};
