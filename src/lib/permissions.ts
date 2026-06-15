/**
 * Permission matrix (Access) client layer.
 *
 * Talks to the mock endpoints in server.ts:
 *   GET  /api/v1/permissions            → { features, roles, matrix }
 *   PUT  /api/v1/permissions/:role      → save one role's configurable toggles
 *   POST /api/v1/permissions/reset      → restore defaults
 *
 * Owner is implicitly full-access and is not part of the editable matrix.
 */

export type PermRole = "Admin" | "PM" | "Worker";
export type PermType = "always_on" | "owner_only" | "configurable";

export interface PermFeature {
  key: string;
  label: string;
  group: string;
  type: PermType;
}

export type PermMatrix = Record<PermRole, Record<string, boolean>>;

export interface PermissionsPayload {
  features: PermFeature[];
  roles: PermRole[];
  matrix: PermMatrix;
}

const BASE = "/api/v1/permissions";

export async function fetchPermissions(): Promise<PermissionsPayload> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error("Could not load permissions.");
  return (await res.json()) as PermissionsPayload;
}

/** Persist a single role's toggles. Returns the refreshed full matrix. */
export async function saveRolePermissions(
  role: PermRole,
  permissions: Record<string, boolean>
): Promise<PermMatrix> {
  const res = await fetch(`${BASE}/${role}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
  if (!res.ok) throw new Error(`Could not save ${role} permissions.`);
  const data = await res.json();
  if (!data?.success) throw new Error(`Could not save ${role} permissions.`);
  return data.matrix as PermMatrix;
}

export async function resetPermissions(): Promise<PermissionsPayload> {
  const res = await fetch(`${BASE}/reset`, { method: "POST" });
  if (!res.ok) throw new Error("Could not reset permissions.");
  return (await res.json()) as PermissionsPayload;
}

export interface CellState {
  value: boolean;
  locked: boolean;
  lockReason?: string;
}

/** Resolve a single matrix cell for an editable role into its display + lock state. */
export function cellState(feature: PermFeature, role: PermRole, matrix: PermMatrix): CellState {
  if (feature.type === "always_on") {
    return { value: true, locked: true, lockReason: "Always available to every role" };
  }
  if (feature.type === "owner_only") {
    return { value: false, locked: true, lockReason: "Owner-only feature" };
  }
  return { value: !!matrix[role]?.[feature.key], locked: false };
}

/** Group features in their declared order, preserving first-seen group ordering. */
export function groupFeatures(features: PermFeature[]): { group: string; features: PermFeature[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, PermFeature[]>();
  for (const f of features) {
    if (!byGroup.has(f.group)) {
      byGroup.set(f.group, []);
      order.push(f.group);
    }
    byGroup.get(f.group)!.push(f);
  }
  return order.map((group) => ({ group, features: byGroup.get(group)! }));
}
