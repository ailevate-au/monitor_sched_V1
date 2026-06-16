import React, { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useAuth } from "../lib/auth";

const C = {
  navy: "#0F1F3D",
  blue: "#1A5FA8",
  blueMid: "#3A8ADE",
  blueLight: "#E6F0FB",
  red: "#E04A4A",
  redDark: "#9B2C2C",
  redBg: "#FEF2F2",
  gray: "#64748B",
  grayLight: "#E2E8F0",
  text: "#1E293B",
  textMuted: "#475569",
  white: "#FFFFFF",
};

export default function Login() {
  const { login, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email.trim(), password);
    // On success the AuthProvider flips isAuthenticated and the app re-renders.
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: `linear-gradient(135deg, ${C.navy} 0%, #16335f 55%, ${C.blue} 100%)`,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: C.white,
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(8,16,35,0.35)",
          overflow: "hidden",
        }}
      >
        {/* Brand header */}
        <div style={{ padding: "26px 28px 20px", textAlign: "center" }}>
          <div
            style={{
              width: 46,
              height: 46,
              margin: "0 auto 12px",
              background: C.blue,
              borderRadius: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.white,
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            FQ
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: C.navy }}>FlowIQ</div>
          <div style={{ fontSize: 12.5, color: C.gray, marginTop: 3 }}>
            Sign in to your construction control workspace
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "4px 28px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && (
            <div
              role="alert"
              style={{
                background: C.redBg,
                border: `1px solid #FECACA`,
                color: C.redDark,
                fontSize: 12.5,
                fontWeight: 500,
                borderRadius: 8,
                padding: "9px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <TriangleAlert size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="login-email" style={labelStyle}>
              EMAIL
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => {
                if (error) clearError();
                setEmail(e.target.value);
              }}
              placeholder="you@company.com.au"
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="login-password" style={labelStyle}>
              PASSWORD
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                if (error) clearError();
                setPassword(e.target.value);
              }}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              marginTop: 4,
              padding: "11px 16px",
              borderRadius: 9,
              border: "none",
              background: loading || !email || !password ? "#9DB6D6" : C.blue,
              color: C.white,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: loading || !email || !password ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background 0.15s ease",
            }}
          >
            {loading && (
              <span
                style={{
                  display: "inline-block",
                  width: 13,
                  height: 13,
                  border: "2px solid rgba(255,255,255,0.6)",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            )}
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", lineHeight: 1.5, marginTop: 2 }}>
            Demo build — credentials are accepted by the mock auth service and sign you in
            against the live programme data.
          </div>
        </form>
      </div>

      {/* keyframes for the button spinner (scoped, harmless if duplicated) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10.5,
  fontWeight: 700,
  color: C.gray,
  letterSpacing: "0.04em",
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 9,
  border: `1px solid ${C.grayLight}`,
  fontSize: 13,
  color: C.text,
  boxSizing: "border-box",
  outline: "none",
  background: "#FBFCFE",
};
