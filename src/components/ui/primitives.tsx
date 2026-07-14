import React, { useState } from "react";
import { AlertTriangle, Zap, CloudRain, Check, AlertCircle } from "lucide-react";
import { C } from "../../lib/theme";

// Shared UI primitives — used by most screens. Extracted from Dashboard.tsx,
// where they originally lived (screens imported their buttons from the
// dashboard, and the finance charts importing "../Dashboard" created an
// import cycle).

export const StatusBadge = ({ status }: { status: string }) => {
  const map: { [key: string]: { bg: string; color: string; label: string; icon: React.ReactNode } } = {
    conflict:   { bg: C.redBg,    color: C.redDark,  label: "Clash",        icon: <AlertTriangle size={11} /> },
    fragile:    { bg: C.amberBg,  color: C.amber,    label: "Tight handover", icon: <Zap size={11} /> },
    weather:    { bg: "#EFF6FF",  color: "#1D4ED8",  label: "Weather Risk", icon: <CloudRain size={11} /> },
    overdue:    { bg: C.redBg,    color: C.redDark,  label: "Overdue",      icon: <AlertCircle size={11} /> },
    inprogress: { bg: C.blueLight,color: C.blue,     label: "In Progress",  icon: null },
    completed:  { bg: C.greenBg,  color: C.greenDark,label: "Completed",    icon: <Check size={11} /> },
    scheduled:  { bg: C.bgSecond, color: C.gray,     label: "Scheduled",    icon: null },
    active:     { bg: C.blueLight,color: C.blue,     label: "Active",       icon: null },
    practical:  { bg: "#F0EEFF",  color: "#4A3DB0",  label: "Practical Completion", icon: null },
    pending:    { bg: C.amberBg,  color: C.amber,    label: "Pending Cert.",icon: null },
    certified:  { bg: C.greenBg,  color: C.greenDark,label: "Certified",    icon: <Check size={11} /> },
    released:   { bg: "#F0EEFF",  color: "#4A3DB0",  label: "Retention Released", icon: null },
    ok:         { bg: C.greenBg,  color: C.greenDark,label: "On Schedule",  icon: null },
  };
  const s = map[status] || map.scheduled;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      fontSize:11, fontWeight:500, padding:"2px 8px", borderRadius:8,
      background:s.bg, color:s.color, whiteSpace:"nowrap",
    }}>
      {s.icon}
      {s.label}
    </span>
  );
};

export const KpiCard = ({ label, value, sub, trend, valueColor, onClick, actionLabel }: { label: string; value: string; sub?: string; trend?: string; valueColor?: string; onClick?: () => void; actionLabel?: string }) => {
  const [hover, setHover] = useState(false);
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      onMouseEnter={() => clickable && setHover(true)}
      onMouseLeave={() => clickable && setHover(false)}
      title={clickable ? (actionLabel || "Open in the Timeline") : undefined}
      style={{
        background:C.white,
        border:`0.5px solid ${clickable && hover ? C.blue : C.grayLight}`,
        borderRadius:12,
        padding:"16px 18px",
        boxShadow: clickable && hover ? "0 2px 10px rgba(26,95,168,0.16)" : "0 1px 3px rgba(0,0,0,0.02)",
        cursor: clickable ? "pointer" : "default",
        transition:"border-color .15s, box-shadow .15s",
      }}
    >
      <div style={{ fontSize:11, color:C.gray, marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em" }}>{label}</div>
      <div style={{ fontSize:23, fontWeight:600, color:valueColor||C.text, lineHeight:1.1 }}>{value}</div>
      {sub   && <div style={{ fontSize:11, color:C.textMuted, marginTop:5 }}>{sub}</div>}
      {trend && <div style={{ fontSize:11, marginTop:5, fontWeight:600, color:trend.startsWith("+") || trend.includes("over") ? C.red : C.green }}>{trend}</div>}
      {clickable && (
        <div style={{ fontSize:11, marginTop:8, fontWeight:600, color:C.blue, display:"flex", alignItems:"center", gap:4 }}>
          {actionLabel || "View in Timeline"} <span style={{ transform: hover ? "translateX(2px)" : "none", transition:"transform .15s" }}>→</span>
        </div>
      )}
    </div>
  );
};

export const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background:C.white, border:`0.5px solid ${C.grayLight}`, borderRadius:12, padding:18, marginBottom:14, ...style }}>
    {children}
  </div>
);

export const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, width: "100%" }}>
    <span style={{ fontSize:13, fontWeight:600, color:C.navy }}>{title}</span>
    {right}
  </div>
);

export const Btn = ({ children, primary, small, danger, onClick, style, disabled, title }: { children: React.ReactNode; primary?: boolean; small?: boolean; danger?: boolean; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; style?: React.CSSProperties; disabled?: boolean; title?: string }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    display:"inline-flex", alignItems:"center", gap:5,
    padding: small ? "4px 10px" : "6px 12px",
    borderRadius:8, border:`0.5px solid ${primary ? C.blue : danger ? C.red : C.grayLight}`,
    background: primary ? C.blue : danger ? C.red : C.white,
    color: primary||danger ? C.white : C.text,
    fontSize:12, fontWeight:500, cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit",
    opacity: disabled ? 0.6 : 1,
    ...style,
  }}>
    {children}
  </button>
);
