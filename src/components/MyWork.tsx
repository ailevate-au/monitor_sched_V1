import { useState, useEffect } from "react";
import { HardHat, Calendar, AlertTriangle } from "lucide-react";

const C = {
  navy:       "#0F1F3D",
  blue:       "#1A5FA8",
  blueMid:    "#3A8ADE",
  blueLight:  "#E6F0FB",
  green:      "#1D9E75",
  greenBg:    "#ECFDF5",
  greenDark:  "#2D6A0A",
  amber:      "#B87316",
  amberBg:    "#FEF3C7",
  red:        "#E04A4A",
  redDark:    "#9B2C2C",
  redBg:      "#FEF2F2",
  gray:       "#64748B",
  grayLight:  "#E2E8F0",
  text:       "#1E293B",
  white:      "#FFFFFF",
  bg:         "#F1F5F9",
};

interface MyWorkProps {
  onToggleRole: () => void;
}

export default function MyWork({ onToggleRole }: MyWorkProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Load team member assignments and alerts
  const loadMyData = () => {
    setLoading(true);
    fetch("/api/v1/my/schedule?assigneeId=r1")
      .then(res => res.json())
      .then(data => {
        setTasks(data);
        return fetch("/api/v1/my/notifications");
      })
      .then(res => res.json())
      .then(notifs => {
        setNotifications(notifs);
        setLoading(false);
      })
      .catch(err => {
        console.error("MyWork: Error charging data", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadMyData();
  }, []);

  const handleUpdateStatus = (taskId: string, status: string, pct: number) => {
    setUpdatingId(taskId);
    setActionMsg("Syncing status update...");

    fetch(`/api/v1/tasks/${taskId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, percent_complete: pct })
    })
      .then(res => res.json())
      .then(() => {
        setActionMsg("Status submitted successfully.");
        setUpdatingId(null);
        setTimeout(() => setActionMsg(null), 6000);
        loadMyData();
      })
      .catch(() => {
        setUpdatingId(null);
        setActionMsg("Error submitting update.");
      });
  };

  const handleReportBehind = (taskId: string) => {
    setUpdatingId(taskId);
    setActionMsg("Filing delay alert to PM dashboard...");

    fetch(`/api/v1/tasks/${taskId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportBehind: true, percent_complete: 15 })
    })
      .then(res => res.json())
      .then(() => {
        setActionMsg("Delay notice submitted. PM notified.");
        setUpdatingId(null);
        setTimeout(() => setActionMsg(null), 6000);
        loadMyData();
      })
      .catch(() => {
        setUpdatingId(null);
        setActionMsg("Error submitting delay notice.");
      });
  };

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", padding: "16px", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", gap: 16, fontFamily: "'Inter', sans-serif" }}>
      
      <div style={{ background: C.navy, color: C.white, borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
        <div>
          <div style={{ fontSize: 11, color: "#93C5FD", fontWeight: 700, letterSpacing: "0.05em" }}>SIGNED IN AS</div>
          <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><HardHat size={15} /> Ben Nguyen</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>Formwork Foreman · NSW Region</div>
        </div>
        <button 
          onClick={onToggleRole}
          style={{ background: "#2563EB", border: "none", color: C.white, padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.1s" }}
        >
          🔄 Back to PM View
        </button>
      </div>

      {/* Floating Status Update Overlay */}
      {actionMsg && (
        <div style={{ background: C.blueMid, color: C.white, borderRadius: 8, padding: "8px 12px", fontSize: 12, textAlign: "center", fontWeight: 600, boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
          ℹ️ {actionMsg}
        </div>
      )}

      {/* Active Work summary tab */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>📍 My Jobs This Week</h2>
          <span style={{ background: C.blueLight, color: C.blue, fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 700 }}>June Week 1</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 24, fontSize: 12, color: C.gray }}>Loading your schedule…</div>
        ) : tasks.length === 0 ? (
          <div style={{ background: C.white, borderRadius: 12, padding: 18, textAlign: "center", fontSize: 12, color: C.gray }}>No jobs assigned this week.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tasks.map(t => {
              const isBehind = t.status === "overdue";
              const isDone = t.status === "completed";

              return (
                <div key={t.id} style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${C.grayLight}`, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", position: "relative" }}>
                  {/* Status Indicator Bar */}
                  <div style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 4, borderRadius: "0 4px 4px 0", background: isDone ? C.green : isBehind ? C.red : C.blueMid }} />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.gray }}>{t.id} · {(t.project || "").split(" —")[0] || "Unknown"}</span>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: "2px 0 0 0" }}>{t.name}</h3>
                    </div>
                    <div>
                      {isDone ? (
                        <span style={{ background: C.greenBg, color: C.greenDark, fontSize: 10, padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>DONE</span>
                      ) : isBehind ? (
                        <span style={{ background: C.redBg, color: C.red, fontSize: 10, padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>BEHIND</span>
                      ) : (
                        <span style={{ background: C.blueLight, color: C.blue, fontSize: 10, padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>ACTIVE</span>
                      )}
                    </div>
                  </div>

                  {/* Dates & Progression info */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.gray, marginBottom: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Calendar size={12} /> {t.start} to {t.end}</span>
                    <span>{isDone ? "Complete" : isBehind ? "Behind schedule" : "In progress"}</span>
                  </div>

                  {/* Operational controls */}
                  <div style={{ borderTop: `1px solid ${C.grayLight}`, paddingTop: 10, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!isDone && (
                        <>
                          <button 
                            disabled={updatingId === t.id}
                            onClick={() => handleUpdateStatus(t.id, "inprogress", 40)}
                            style={{ padding: "6px 10px", fontSize: 11, background: C.blueLight, color: C.blue, border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                          >
                            🚀 Start Work
                          </button>
                          <button 
                            disabled={updatingId === t.id}
                            onClick={() => handleUpdateStatus(t.id, "completed", 100)}
                            style={{ padding: "6px 10px", fontSize: 11, background: C.greenBg, color: C.greenDark, border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                          >
                            ✓ Finish Task
                          </button>
                        </>
                      )}
                    </div>

                    {!isDone && !isBehind && (
                      <button 
                        disabled={updatingId === t.id}
                        onClick={() => handleReportBehind(t.id)}
                        style={{ padding: "6px 10px", fontSize: 11, background: C.redBg, color: C.red, border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}
                        title="Tell your manager this job is running behind"
                      >
                        <AlertTriangle size={12} /> Report a delay
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notifications history */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>📢 Recent Updates</h2>
        <div style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${C.grayLight}`, padding: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: "center", padding: 16, fontSize: 11.5, color: C.gray }}>No notification logs registered.</div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 6, borderBottom: `0.5px solid ${C.grayLight}` }}>
                <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>
                  {n.type === "delay" ? "🚨 DELAY REPORTED " : "📝 STATUS UPDATE "}
                  - {n.message}
                </span>
                <span style={{ fontSize: 9, color: C.gray }}>{new Date(n.timestamp).toLocaleTimeString()} · Reporter: {n.reporterName}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Constraints disclosure */}
      <div style={{ padding: 12, background: "#F8FAFC", borderRadius: 10, border: `0.5px solid ${C.grayLight}`, fontSize: 11, color: C.gray, lineHeight: 1.4 }}>
         ℹ️ <strong>What you can see</strong>: As an on-site team member, you can only view your own jobs. Pricing, the full programme, and other people's schedules are not shown here.
      </div>

    </div>
  );
}
