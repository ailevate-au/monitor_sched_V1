/**
 * Permission matrix (Access) — mock, in-memory. Owner is implicitly
 * full-access and never stored. Only Coordinator / Admin / PM are
 * configurable. always_on rows are locked ON; owner_only rows locked OFF.
 * A Project Coordinator is a portfolio-ops role: sees every project (like the
 * Owner), assigns projects to PMs and manages Admin/PM accounts (User
 * Management), but has no money access (Financial / Pricing stay owner-only)
 * and leaves the hands-on system config (Master Data, Expenses) to Admin.
 */

export type PermRole = "Coordinator" | "Admin" | "PM";
export type PermType = "always_on" | "owner_only" | "configurable";

export const PERM_ROLES: PermRole[] = ["Coordinator", "Admin", "PM"];

export const PERM_FEATURES: { key: string; label: string; group: string; type: PermType }[] = [
  { key: "dashboard",   label: "Dashboard / Overview",     group: "Overview",       type: "always_on" },
  { key: "projects",    label: "Projects",                 group: "Overview",       type: "configurable" },
  { key: "conflicts",   label: "Conflicts",                group: "Overview",       type: "configurable" },
  { key: "weather",     label: "Weather",                  group: "Overview",       type: "configurable" },
  { key: "gantt",       label: "Timeline (Gantt)",         group: "Scheduling",     type: "configurable" },
  { key: "resources",   label: "Resources",                group: "Scheduling",     type: "configurable" },
  { key: "financial",   label: "Financial Dashboard",      group: "Finance",        type: "owner_only" },
  { key: "pricing",     label: "Pricing & Rates",          group: "Finance",        type: "owner_only" },
  { key: "claims",      label: "Project Expenses",         group: "Finance",        type: "configurable" },
  { key: "reports",     label: "Reports",                  group: "Finance",        type: "configurable" },
  { key: "masterdata",  label: "Settings / Master Data",   group: "Administration", type: "configurable" },
  { key: "users",       label: "User Management",          group: "Administration", type: "configurable" },
  { key: "permissions", label: "Access (Permissions)",     group: "Administration", type: "owner_only" },
];

const PERM_DEFAULTS: Record<string, Record<PermRole, boolean>> = {
  projects:   { Coordinator: true,  Admin: true,  PM: true  },
  conflicts:  { Coordinator: true,  Admin: true,  PM: true  },
  weather:    { Coordinator: true,  Admin: true,  PM: true  },
  gantt:      { Coordinator: true,  Admin: true,  PM: true  },
  resources:  { Coordinator: true,  Admin: true,  PM: true  },
  claims:     { Coordinator: false, Admin: true,  PM: true  },
  reports:    { Coordinator: true,  Admin: true,  PM: false },
  masterdata: { Coordinator: false, Admin: true,  PM: false },
  // Portfolio lead creates/manages Admin + PM accounts; Admin/PM cannot.
  users:      { Coordinator: true,  Admin: false, PM: false },
};

function buildDefaultMatrix(): Record<PermRole, Record<string, boolean>> {
  const matrix = {} as Record<PermRole, Record<string, boolean>>;
  for (const role of PERM_ROLES) {
    matrix[role] = {};
    for (const f of PERM_FEATURES) {
      if (f.type === "always_on") matrix[role][f.key] = true;
      else if (f.type === "owner_only") matrix[role][f.key] = false;
      else matrix[role][f.key] = PERM_DEFAULTS[f.key]?.[role] ?? false;
    }
  }
  return matrix;
}

let permissionMatrix = buildDefaultMatrix();

export function getMatrix() {
  return permissionMatrix;
}

export function isPermRole(role: string): role is PermRole {
  return (PERM_ROLES as string[]).includes(role);
}

/** Apply incoming toggles to one role. Locked (non-configurable) rows are ignored. */
export function applyRolePermissions(role: PermRole, incoming: Record<string, unknown>) {
  for (const f of PERM_FEATURES) {
    if (f.type !== "configurable") continue;
    if (Object.prototype.hasOwnProperty.call(incoming, f.key)) {
      permissionMatrix[role][f.key] = !!incoming[f.key];
    }
  }
  return permissionMatrix[role];
}

export function resetMatrix() {
  permissionMatrix = buildDefaultMatrix();
  return permissionMatrix;
}
