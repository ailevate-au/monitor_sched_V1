import React, { useState, useEffect } from "react";
import ScreenDashboard from "./components/Dashboard";
import ScreenProjects from "./components/Projects";
import ScreenWeather from "./components/Weather";
import ScreenGantt from "./components/Gantt";
import ScreenResources from "./components/Resources";
import ScreenConflicts from "./components/Conflicts";
import ScreenFinancial from "./components/Financial";
import ScreenClaims from "./components/Claims";
import ScreenReports from "./components/Reports";
import ScreenMasterData from "./components/MasterData";
import ScreenMyWork from "./components/MyWork";
import ScreenPermissions from "./components/Permissions";
import Login from "./components/Login";
import { useAuth } from "./lib/auth";
import { AppNavigate, MasterTabId } from "./types/masters";
import { parseConflictHubResponse } from "./types";

/** Roles that land on the mobile-first worker view; everyone else gets the full console. */
const WORKER_ROLES = new Set(["Worker", "Resource"]);

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SW";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  bg:         "#F4F7FC",
  white:      "#FFFFFF",
};

const SCREEN_TO_PATH: Record<string, string> = {
  dashboard: "/",
  projects: "/projects",
  weather: "/weather",
  gantt: "/gantt",
  resources: "/resources",
  conflicts: "/conflicts",
  financial: "/financial",
  claims: "/claims",
  reports: "/reports",
  masterdata: "/masterdata",
  permissions: "/permissions",
};

const PATH_TO_SCREEN: Record<string, string> = {
  ...Object.entries(SCREEN_TO_PATH).reduce(
    (acc, [screenId, routePath]) => {
      acc[routePath] = screenId;
      return acc;
    },
    {} as Record<string, string>
  ),
  "/dashboard": "dashboard",
};

function getScreenFromPath(pathname: string) {
  return PATH_TO_SCREEN[pathname] || "dashboard";
}

export default function SiteWizeApp() {
  const { user, isAuthenticated, logout } = useAuth();
  const [screen, setScreen] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    return getScreenFromPath(window.location.pathname);
  });
  const [masterTab, setMasterTab] = useState<MasterTabId>("cost_categories");
  // Seed the active view from the signed-in user's role; workers land on My Work.
  const [role, setRole] = useState<"PM" | "Resource">(() =>
    user && WORKER_ROLES.has(user.role) ? "Resource" : "PM"
  );

  const navigate: AppNavigate = (nextScreen, tab) => {
    if (tab) setMasterTab(tab);
    setScreen(nextScreen);
    if (typeof window !== "undefined") {
      const nextPath = SCREEN_TO_PATH[nextScreen] || "/";
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, "", nextPath);
      }
    }
  };
  const [conflictsCount, setConflictsCount] = useState(0);
  const [expensesCount, setExpensesCount] = useState(0);

  const fetchLiveBadges = () => {
    // Sync conflict badge count
    fetch("/api/v1/conflicts")
      .then(res => res.json())
      .then(data => {
        const hub = parseConflictHubResponse(data);
        setConflictsCount(hub.metrics.hardConflicts);
      })
      .catch(() => {});

    // Sync project expenses badge count
    fetch("/api/v1/claims")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setExpensesCount(data.length);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchLiveBadges();
    const interval = setInterval(fetchLiveBadges, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      setScreen(getScreenFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navItems = [
    { id:"dashboard", label:"Overview",           icon:"🏠", group:"Overview"    },
    { id:"projects",  label:"Projects",           icon:"📁", group:"Overview"    },
    { id:"conflicts", label:"Conflicts",          icon:"⚠️", group:"Overview",   badge: conflictsCount },
    { id:"weather",   label:"Weather",            icon:"🌧", group:"Overview"    },
    { id:"gantt",     label:"Timeline",           icon:"📅", group:"Scheduling"  },
    { id:"resources", label:"Resources",          icon:"👷", group:"Scheduling"  },
    { id:"financial", label:"Finance",            icon:"💰", group:"Finance"     },
    { id:"claims",    label:"Project Expenses",   icon:"📋", group:"Finance",    badge: expensesCount, badgeColor: C.amber },
    { id:"reports",   label:"Reports",            icon:"📄", group:"Finance"     },
    { id:"masterdata", label:"Settings",          icon:"📚", group:"Administration" },
    // Owner-only: configure the role permission matrix (Access)
    ...(user?.role === "Owner"
      ? [{ id:"permissions", label:"Access", icon:"🔐", group:"Administration" }]
      : []),
  ];

  const groups = ["Overview", "Scheduling", "Finance", "Administration"];

  const screenMap: { [key: string]: React.ReactNode } = {
    dashboard: <ScreenDashboard onNav={navigate} />,
    projects:  <ScreenProjects  onNav={navigate} />,
    weather:   <ScreenWeather />,
    gantt:     <ScreenGantt onNav={navigate} />,
    resources: <ScreenResources onNav={navigate} />,
    conflicts: <ScreenConflicts onNav={navigate} />,
    financial: <ScreenFinancial />,
    claims:    <ScreenClaims />,
    reports:   <ScreenReports />,
    masterdata: <ScreenMasterData initialTab={masterTab} />,
    permissions: <ScreenPermissions />,
  };

  const titles: { [key: string]: string } = {
    dashboard: "Overview",
    projects: "Projects",
    weather: "Weather",
    gantt: "Timeline",
    resources: "Resources",
    conflicts: "Conflicts",
    financial: "Finance",
    claims: "Project Expenses",
    reports: "Reports",
    masterdata: "Settings",
    permissions: "Access — Role Permissions",
  };

  // Unauthenticated users see only the login screen (entry point to the app).
  if (!isAuthenticated) {
    return <Login />;
  }

  // If role is Resource, render only the standalone mobile-first My Work screen (no sidebar, simple and clean)
  if (role === "Resource") {
    return (
      <div style={{ background: "#F1F5F9", minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", padding: "12px" }}>
        <div style={{ width: "100%", maxWidth: 430, background: "#FFF", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 25px rgba(15,23,42,0.08)", minHeight: "85vh" }}>
          <ScreenMyWork onToggleRole={() => setRole("PM")} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"'Inter', system-ui, sans-serif", fontSize:13, background:C.bg, overflow:"hidden" }}>

      {/* SIDEBAR NAVIGATION */}
      <nav style={{ width:235, background:C.white, borderRight:`0.5px solid ${C.grayLight}`, display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>
        {/* Logo */}
        <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:10, borderBottom:`0.5px solid ${C.grayLight}` }}>
          <div style={{ width:30, height:30, background:C.blue, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", color:C.white, fontSize:11, fontWeight:600, flexShrink:0 }}>SW</div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>SiteWize</div>
            <div style={{ fontSize:10, color:C.gray }}>Construction project control</div>
          </div>
        </div>

        {/* Categories and links */}
        {groups.map(g => (
          <div key={g} style={{ marginTop: 10 }}>
            <div style={{ padding:"5px 14px 2px", fontSize:10, fontWeight:600, color:C.gray, letterSpacing:"0.06em", textTransform:"uppercase" }}>{g}</div>
            {navItems.filter(n => n.group === g).map(n => {
              const isConflictAlert = n.id === "conflicts" && conflictsCount > 0 && screen !== "conflicts";
              return (
              <div key={n.id} onClick={() => navigate(n.id)} style={{
                display:"flex",
                alignItems:"center",
                gap:8,
                padding:"6px 12px",
                margin:"1px 8px",
                borderRadius:8,
                cursor:"pointer",
                color: screen === n.id ? C.blue : isConflictAlert ? C.redDark : C.gray,
                background: screen === n.id ? C.blueLight : isConflictAlert ? C.redBg : "transparent",
                fontWeight: screen === n.id ? 500 : isConflictAlert ? 600 : 400,
                fontSize:12,
                transition:"all .1s",
                userSelect:"none",
                border: isConflictAlert ? `1px solid #FECACA` : "1px solid transparent",
              }}>
                <span style={{ fontSize:13, flexShrink:0 }}>{n.icon}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label}</span>
                {!!n.badge && n.badge > 0 && (
                  <span style={{ background: n.badgeColor || C.red, color:C.white, fontSize:9.5, fontWeight:600, padding:"1px 5px", borderRadius:8, lineHeight:1.3 }}>
                    {n.badge}
                  </span>
                )}
              </div>
            );})}
          </div>
        ))}

        {/* User Card & Sign-out */}
        <div style={{ marginTop:"auto", padding:"10px 8px", borderTop:`0.5px solid ${C.grayLight}`, display:"flex", flexDirection:"column", gap:8, background: "#F8FAFC" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px" }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:"#B5D4F4", color:"#0C447C", fontSize:11, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {user ? initialsFromName(user.name) : "SW"}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize:11.5, fontWeight:600, color:C.text, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {user?.name || "Signed in"}
              </div>
              <div style={{ fontSize:9.5, color:C.gray, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {user?.role || "—"}{user?.state ? ` · ${user.state}` : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            style={{
              margin: "0 6px 2px",
              padding: "7px 10px",
              fontSize: 11.5,
              fontWeight: 600,
              color: C.redDark,
              background: C.white,
              border: `0.5px solid ${C.grayLight}`,
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            title="Sign out of SiteWize"
          >
            ⏻ Sign out
          </button>
        </div>
      </nav>

      {/* MAIN CONTAINER */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        {/* Top bar */}
        <div style={{ height:52, background:C.white, borderBottom:`0.5px solid ${C.grayLight}`, display:"flex", alignItems:"center", padding:"0 20px", gap:10, flexShrink:0 }}>
          <span style={{ fontSize:14, fontWeight:600, color:C.navy, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{titles[screen]}</span>
        </div>

        {/* Scrollable Context Panel */}
        <div style={{ flex:1, overflowY:"auto", padding:20 }}>
          {screenMap[screen] || <div>Screen not found</div>}
        </div>
      </div>
    </div>
  );
}
