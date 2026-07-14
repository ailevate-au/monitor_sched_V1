import React, { useState, useEffect, useRef } from "react";
import ScreenDashboard from "./components/Dashboard";
import ScreenProjects from "./components/Projects";
import ScreenWeather from "./components/Weather";
import ScreenGantt from "./components/Gantt";
import ScreenResources from "./components/Resources";
import ScreenProblems from "./components/Problems";
import ScreenFinancial from "./components/Financial";
import ScreenClaims from "./components/Claims";
import ScreenReports from "./components/Reports";
import ScreenMasterData from "./components/MasterData";
import ScreenPermissions from "./components/Permissions";
import ScreenUsers from "./components/Users";
import Login from "./components/Login";
import { useAuth } from "./lib/auth";
import { fetchPermissions } from "./lib/permissions";
import type { PermMatrix, PermRole } from "./lib/permissions";
import {
  Home,
  Folder,
  TriangleAlert,
  CloudRain,
  CalendarDays,
  HardHat,
  Wallet,
  ReceiptText,
  FileText,
  Settings,
  ShieldCheck,
  LogOut,
  Users,
} from "lucide-react";
import { AppNavigate, MasterTabId } from "./types/masters";
import { parseProblemsResponse } from "./types";
import { C } from "./lib/theme";
import { api } from "./lib/api";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SW";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


const SCREEN_TO_PATH: Record<string, string> = {
  dashboard: "/",
  projects: "/projects",
  weather: "/weather",
  gantt: "/gantt",
  resources: "/resources",
  problems: "/problems",
  financial: "/financial",
  claims: "/claims",
  reports: "/reports",
  masterdata: "/masterdata",
  permissions: "/permissions",
  users: "/users",
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

// Access-matrix feature key per screen — identical to the screen id except
// "problems" (the Problems hub), which the matrix still tracks under its
// original "conflicts" key.
const SCREEN_TO_FEATURE: Record<string, string> = {
  dashboard: "dashboard",
  projects: "projects",
  weather: "weather",
  gantt: "gantt",
  resources: "resources",
  problems: "conflicts",
  financial: "financial",
  claims: "claims",
  reports: "reports",
  masterdata: "masterdata",
  permissions: "permissions",
  users: "users",
};

export default function FlowIQApp() {
  const { user, isAuthenticated, logout } = useAuth();
  const [screen, setScreen] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    return getScreenFromPath(window.location.pathname);
  });
  const [masterTab, setMasterTab] = useState<MasterTabId>("cost_categories");

  // When navigating to the Gantt with a filter intent, seed its status filter.
  // The Gantt remounts on each entry, so it reads this as its initial filter.
  const [ganttFocus, setGanttFocus] = useState<string | null>(null);
  const [ganttFocusTaskIds, setGanttFocusTaskIds] = useState<string[] | null>(null);
  const [ganttFocusLabel, setGanttFocusLabel] = useState<string | null>(null);

  const navigate: AppNavigate = (nextScreen, tab, options) => {
    if (tab) setMasterTab(tab);
    if (nextScreen === "gantt") {
      setGanttFocus(options?.ganttStatus ?? null);
      setGanttFocusTaskIds(options?.ganttTaskIds ?? null);
      setGanttFocusLabel(options?.ganttFocusLabel ?? null);
    }
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

  // Role-permission matrix (Access page). Owner is implicitly full-access and
  // never needs it; every other role's sidebar + page access is gated by it.
  const [permMatrix, setPermMatrix] = useState<PermMatrix | null>(null);
  useEffect(() => {
    if (!isAuthenticated || user?.role === "Owner") {
      setPermMatrix(null);
      return;
    }
    fetchPermissions()
      .then(data => setPermMatrix(data.matrix))
      .catch(() => {});
  }, [isAuthenticated, user?.role]);

  const canAccess = (screenId: string): boolean => {
    if (user?.role === "Owner") return true;
    // Matrix hasn't loaded yet (just after login) — fail open briefly rather
    // than flashing "Access restricted" on the landing page.
    if (!permMatrix) return true;
    const featureKey = SCREEN_TO_FEATURE[screenId] ?? screenId;
    return !!permMatrix[user?.role as PermRole]?.[featureKey];
  };

  const fetchLiveBadges = () => {
    // Sync the Problems badge with the live open-problem count.
    // A PM only counts problems that involve one of THEIR projects (including a
    // cross-project clash where one side is theirs), so the badge matches what
    // the Problems page shows them — not the whole portfolio.
    if (user?.role === "PM" && user?.email) {
      Promise.all([
        api.get("/problems"),
        api.get("/projects"),
      ])
        .then(([pData, rows]) => {
          const { problems } = parseProblemsResponse(pData);
          const mine = new Set(
            (Array.isArray(rows) ? rows : [])
              .filter((p: any) => p.managerEmail === user.email)
              .map((p: any) => p.name)
          );
          const involved = problems.filter(p =>
            p.projectName.split(" + ").some(n => mine.has(n.trim()))
          );
          setConflictsCount(involved.length);
        })
        .catch(() => {});
    } else {
      api.get("/problems")
        .then(data => {
          const { summary } = parseProblemsResponse(data);
          setConflictsCount(summary.total);
        })
        .catch(() => {});
    }

    // Sync project expenses badge count — only claims still awaiting certification
    api.get("/claims")
      .then(data => {
        if (Array.isArray(data)) {
          setExpensesCount(data.filter((c: { status: string }) => c.status === "pending").length);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    // Don't poll before login — with real token checks every call would 401.
    if (!isAuthenticated) return;
    fetchLiveBadges();
    const interval = setInterval(fetchLiveBadges, 8000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.role, user?.email]);

  // Every fresh sign-in lands on Overview, for every user. The app component
  // stays mounted across logout → login, so without this the previous session's
  // screen (and URL) would carry over. We only reset on the false → true flip,
  // so a page refresh on a deep link still works.
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthenticated && !prevAuthRef.current) {
      setScreen("dashboard");
      if (typeof window !== "undefined" && window.location.pathname !== "/") {
        window.history.pushState({}, "", "/");
      }
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      setScreen(getScreenFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const ICON_SIZE = 16;
  const navItems = [
    { id:"dashboard", label:"Overview",           icon:<Home size={ICON_SIZE} />,         group:"Overview"    },
    { id:"projects",  label:"Projects",           icon:<Folder size={ICON_SIZE} />,       group:"Overview"    },
    { id:"problems",  label:"Problems",           icon:<TriangleAlert size={ICON_SIZE} />, group:"Overview",   badge: conflictsCount },
    { id:"weather",   label:"Weather",            icon:<CloudRain size={ICON_SIZE} />,    group:"Overview"    },
    { id:"gantt",     label:"Timeline",           icon:<CalendarDays size={ICON_SIZE} />, group:"Scheduling"  },
    { id:"resources", label:"Resources",          icon:<HardHat size={ICON_SIZE} />,      group:"Scheduling"  },
    { id:"financial", label:"Finance",            icon:<Wallet size={ICON_SIZE} />,       group:"Finance"     },
    { id:"claims",    label:"Progress Claims",    icon:<ReceiptText size={ICON_SIZE} />,  group:"Finance",    badge: expensesCount, badgeColor: C.amber, title: "Client payment claims to review and certify" },
    { id:"reports",   label:"Reports",            icon:<FileText size={ICON_SIZE} />,     group:"Finance"     },
    { id:"masterdata", label:"Settings",          icon:<Settings size={ICON_SIZE} />,     group:"Administration" },
    { id:"users", label:"Users", icon:<Users size={ICON_SIZE} />, group:"Administration" },
    { id:"permissions", label:"Access", icon:<ShieldCheck size={ICON_SIZE} />, group:"Administration" },
  ].filter(n => canAccess(n.id));

  const groups = ["Overview", "Scheduling", "Finance", "Administration"];

  const screenMap: { [key: string]: React.ReactNode } = {
    dashboard: <ScreenDashboard onNav={navigate} />,
    projects:  <ScreenProjects  onNav={navigate} />,
    weather:   <ScreenWeather />,
    gantt:     <ScreenGantt onNav={navigate} initialStatus={ganttFocus} initialTaskIds={ganttFocusTaskIds} initialFocusLabel={ganttFocusLabel} />,
    resources: <ScreenResources onNav={navigate} />,
    problems:  <ScreenProblems onNav={navigate} />,
    financial: <ScreenFinancial />,
    claims:    <ScreenClaims />,
    reports:   <ScreenReports />,
    masterdata: <ScreenMasterData initialTab={masterTab} />,
    permissions: <ScreenPermissions />,
    users: <ScreenUsers />,
  };

  const titles: { [key: string]: string } = {
    dashboard: "Overview",
    projects: "Projects",
    weather: "Weather",
    gantt: "Timeline",
    resources: "Resources",
    problems: "Problems",
    financial: "Finance",
    claims: "Progress Claims",
    reports: "Reports",
    masterdata: "Settings",
    permissions: "Access",
    users: "Users",
  };

  // Unauthenticated users see only the login screen (entry point to the app).
  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"'Inter', system-ui, sans-serif", fontSize:13, background:C.bg, overflow:"hidden" }}>

      {/* SIDEBAR NAVIGATION */}
      <nav style={{ width:235, background:C.white, borderRight:`0.5px solid ${C.grayLight}`, display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>
        {/* Logo */}
        <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:10, borderBottom:`0.5px solid ${C.grayLight}` }}>
          <div style={{ width:30, height:30, background:C.blue, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", color:C.white, fontSize:11, fontWeight:600, flexShrink:0 }}>FQ</div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>FlowIQ</div>
            <div style={{ fontSize:10, color:C.gray }}>Construction project control</div>
          </div>
        </div>

        {/* Categories and links */}
        {groups.map(g => (
          <div key={g} style={{ marginTop: 10 }}>
            <div style={{ padding:"5px 14px 2px", fontSize:10, fontWeight:600, color:C.gray, letterSpacing:"0.06em", textTransform:"uppercase" }}>{g}</div>
            {navItems.filter(n => n.group === g).map(n => {
              const isConflictAlert = n.id === "problems" && conflictsCount > 0 && screen !== "problems";
              return (
              <div key={n.id} onClick={() => navigate(n.id)} title={n.title} style={{
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
                <span style={{ display:"inline-flex", alignItems:"center", flexShrink:0 }}>{n.icon}</span>
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
            title="Sign out of FlowIQ"
          >
            <LogOut size={14} /> Sign out
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
          {!canAccess(screen) ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, padding:"60px 20px", color:C.gray, textAlign:"center" }}>
              <ShieldCheck size={28} />
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Access restricted</div>
              <div style={{ fontSize:12.5 }}>You don't have permission to view this page.</div>
            </div>
          ) : (
            screenMap[screen] || <div>Screen not found</div>
          )}
        </div>
      </div>
    </div>
  );
}
