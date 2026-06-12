import React, { useState } from "react";

const C = {
  blue: "#1A5FA8",
  gray: "#64748B",
  grayLight: "#E2E8F0",
  text: "#1E293B",
  white: "#FFFFFF",
};

export function InfoTip({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="More information"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `0.5px solid ${C.blue}`,
          background: "#E6F0FB",
          color: C.blue,
          fontSize: 10,
          fontWeight: 700,
          cursor: "pointer",
          padding: 0,
          marginLeft: 4,
          verticalAlign: "middle",
          flexShrink: 0,
        }}
      >
        i
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15,31,61,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: C.white,
              borderRadius: 12,
              width: 380,
              maxWidth: "90vw",
              padding: 22,
              border: `0.5px solid ${C.grayLight}`,
              boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {body}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                borderRadius: 8,
                background: C.blue,
                color: C.white,
                border: "none",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function LabelWithInfo({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {label}
      <InfoTip title={title} body={body} />
    </span>
  );
}
