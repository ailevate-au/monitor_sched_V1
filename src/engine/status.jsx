// ── Task status ──────────────────────────────────────────────────────────────
// Single source of truth for how a task's status is determined and styled.

import { STATUS_TOKENS, TASK_BLUE, TASK_BLUE_HI, TASK_BLUE_LO, TASK_BLUE_LO2, TASK_BLUE_BG, TASK_BLUE_BG2 } from '../theme.jsx';

export const ALL_STATUSES = ['On Track', 'In Progress', 'Completed', 'Overdue', 'Conflict', 'Fragile'];

/**
 * Resolve the effective status for a task. An override always wins;
 * otherwise the engine's computed flags decide.
 * @param {object} t - Task object from buildSched (has .id, .isCompleted, .isOverdue, .isC, .isF, .s)
 * @param {Map<string, string>} statusOverrides
 * @param {number} todayMs - Today at 00:00 in ms
 * @returns {string} One of ALL_STATUSES
 */
export function computeStatus(t, statusOverrides, todayMs) {
  if (statusOverrides && statusOverrides.has(t.id)) return statusOverrides.get(t.id);
  if (t.isCompleted)             return 'Completed';
  if (t.isOverdue)               return 'Overdue';
  if (t.isC)                     return 'Conflict';
  if (t.isF)                     return 'Fragile';
  if (t.s.getTime() <= todayMs)  return 'In Progress';
  return 'On Track';
}

/** Badge styles keyed by status. Each value: { bg, tx, bd } (background, text, border). */
export const STATUS_STYLES = {
  'Completed':   { bg:STATUS_TOKENS.OK_SUBTLE,     tx:STATUS_TOKENS.OK_HI,       bd:STATUS_TOKENS.OK_BORDER },
  'Overdue':     { bg:STATUS_TOKENS.DANGER_SUBTLE, tx:STATUS_TOKENS.WARN_BADGE,  bd:STATUS_TOKENS.WARN_BORDER },
  'Conflict':    { bg:STATUS_TOKENS.DANGER_SUBTLE, tx:STATUS_TOKENS.DANGER_TEXT2,bd:STATUS_TOKENS.DANGER_BORDER },
  'Fragile':     { bg:STATUS_TOKENS.WARN_SUBTLE2,  tx:STATUS_TOKENS.WARN_BADGE,  bd:STATUS_TOKENS.WARN_BORDER },
  // On Track / In Progress share the steel-blue family — only exceptional states
  // get warning colours. In Progress uses a brighter text/border to mirror the
  // brighter outline on the Gantt bar.
  'In Progress': { bg:TASK_BLUE_BG,  tx:TASK_BLUE_HI, bd:TASK_BLUE_LO },
  'On Track':    { bg:TASK_BLUE_BG2, tx:TASK_BLUE,    bd:TASK_BLUE_LO2 },
};