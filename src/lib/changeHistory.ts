import type { CascadeMode, TaskMove } from "./timelineAdjust";

/**
 * Audit log for confirmed timeline adjustments.
 *
 * The task *positions* are persisted by the existing server API (each move is a
 * POST /api/v1/tasks/:id/update), so confirmed changes are concrete platform-wide.
 * This module only stores the *log* needed to list and revert those adjustments.
 *
 * It is intentionally hidden behind {@link ChangeHistoryStore}. Today it is backed
 * by localStorage (this branch is a frontend-testing copy). To persist server-side
 * later, implement the `serverChangeHistory` adapter sketched at the bottom and swap
 * the `changeHistory` export — no call sites change.
 */

export interface ChangeSet {
  id: string;
  createdAt: string; // ISO timestamp
  anchorTaskId: string;
  anchorTaskName: string;
  mode: CascadeMode;
  delayWorkingDays: number;
  moves: TaskMove[];
  warningsAtConfirm: string[];
  reverted: boolean;
  revertedAt?: string;
}

export interface ChangeHistoryStore {
  list(): ChangeSet[];
  add(changeSet: ChangeSet): void;
  update(id: string, patch: Partial<ChangeSet>): void;
}

const STORAGE_KEY = "flowiq.timeline.changeHistory";

function readAll(): ChangeSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChangeSet[]) : [];
  } catch {
    return [];
  }
}

function writeAll(sets: ChangeSet[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
  } catch {
    /* quota / private mode — history is best-effort */
  }
}

/** localStorage-backed implementation (newest first on read). */
export const localStorageChangeHistory: ChangeHistoryStore = {
  list() {
    return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  add(changeSet) {
    const sets = readAll();
    sets.push(changeSet);
    writeAll(sets);
  },
  update(id, patch) {
    const sets = readAll().map((cs) => (cs.id === id ? { ...cs, ...patch } : cs));
    writeAll(sets);
  },
};

/** Active store used across the app. Swap this to wire history to the server. */
export const changeHistory: ChangeHistoryStore = localStorageChangeHistory;

/** Stable, dependency-free id for a new change set. */
export function makeChangeSetId(): string {
  return `ADJ-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/*
 * ───────────────────────────────────────────────────────────────────────────
 * FUTURE: server-backed persistence (one-file swap — no call-site changes)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * 1. Prisma model (prisma/schema.prisma):
 *
 *    model AdjustmentLog {
 *      id               String   @id
 *      createdAt        DateTime @default(now())
 *      anchorTaskId     String
 *      anchorTaskName   String
 *      mode             String   // "full" | "partial" | "none"
 *      delayWorkingDays Int
 *      moves            String   // JSON-encoded TaskMove[]
 *      warnings         String   // JSON-encoded string[]
 *      reverted         Boolean  @default(false)
 *      revertedAt       DateTime?
 *    }
 *
 * 2. Express routes (server.ts):
 *      GET    /api/v1/adjustments            -> AdjustmentLog[]
 *      POST   /api/v1/adjustments            -> create
 *      POST   /api/v1/adjustments/:id/revert -> set reverted = true
 *
 * 3. Adapter (replace the `changeHistory` export):
 *
 *    export const serverChangeHistory: ChangeHistoryStore = { ... fetch-backed ... };
 *    export const changeHistory = serverChangeHistory;
 *
 *    (A fetch-backed store is async; expose it via a small hook with local cache,
 *    or make the interface return Promises and await at the call sites in Gantt.)
 */
