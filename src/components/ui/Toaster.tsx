import { useEffect, useState } from "react";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { C } from "../../lib/theme";
import { subscribeToasts, dismissToast, ToastItem } from "../../lib/toast";

const KIND = {
  info:    { bg: C.white,   border: C.grayLight, accent: C.blue,      Icon: Info },
  success: { bg: C.greenBg, border: "#BBF7D0",   accent: C.greenDark, Icon: CheckCircle2 },
  error:   { bg: C.redBg,   border: "#FECACA",   accent: C.redDark,   Icon: AlertTriangle },
} as const;

/**
 * Renders the app-wide toast stack (top-right). Mounted once at the app root;
 * driven by the module-level store in lib/toast.
 */
export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      style={{
        position: "fixed", top: 16, right: 16, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8,
        width: "min(380px, calc(100vw - 32px))", pointerEvents: "none",
      }}
    >
      {items.map((t) => {
        const k = KIND[t.kind];
        const { Icon } = k;
        return (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: "auto",
              display: "flex", alignItems: "flex-start", gap: 10,
              background: k.bg,
              border: `1px solid ${k.border}`,
              borderLeft: `3px solid ${k.accent}`,
              borderRadius: 10,
              padding: "11px 12px",
              boxShadow: "0 6px 20px rgba(8,16,35,0.12)",
            }}
          >
            <Icon size={16} color={k.accent} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              style={{ background: "none", border: "none", cursor: "pointer", color: C.gray, padding: 2, flexShrink: 0, lineHeight: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
