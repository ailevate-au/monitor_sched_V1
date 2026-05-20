// ── Theme ────────────────────────────────────────────────────────────────────
// Colour palette, role definitions, and Gantt-chart sizing constants.

export const COLORS = {
  NAV:     '#0A0A0F',
  SURFACE: '#13131A',
  CARD:    '#1C1C27',
  BORDER:  '#2A2A3A',
  ORANGE:  '#F97316',
  TEXT:    '#E8E8F0',
  MUTED:   '#6B7280',
};

// Convenience destructure (used by components that don't want the full object)
export const { NAV, SURFACE, CARD, BORDER, ORANGE, TEXT, MUTED } = COLORS;

// ── Task / project colour scheme ─────────────────────────────────────────────
// Status drives colour. The bar IS the task's status; warning badges layer
// on top. Brand orange (#F97316) is reserved for UI accents — never used for
// task bars or status.
export const TASK_BLUE       = '#5B7B9A';  // default — on track / in progress
export const TASK_BLUE_HI    = '#7DA3C8';  // brighter stroke for in-progress
export const STATUS_GREEN    = '#10B981';  // completed
export const STATUS_AMBER    = '#F59E0B';  // overdue
export const STATUS_RED      = '#EF4444';  // conflict
export const BADGE_YELLOW    = '#FBBF24';  // fragile (badge only, never bar)
export const CONFLICT_RED    = STATUS_RED; // alias kept for callers that import it
// Legacy palettes kept so older code that indexes into them still works.
// Every entry is the neutral now — colour-coding by project/person was removed.
export const PROJ_COLORS   = [TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE];
export const PERSON_COLORS = [TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE, TASK_BLUE];

// ── Static timeline reference (Jan–Dec day offsets in a non-leap year) ──────
export const ALL_MONS = [
  { n:'Jan', d:0   }, { n:'Feb', d:31  }, { n:'Mar', d:59  }, { n:'Apr', d:90  },
  { n:'May', d:120 }, { n:'Jun', d:151 }, { n:'Jul', d:181 }, { n:'Aug', d:212 },
  { n:'Sep', d:243 }, { n:'Oct', d:273 }, { n:'Nov', d:304 }, { n:'Dec', d:334 },
  { n:'',    d:365 },
];

// ── Gantt rendering constants ───────────────────────────────────────────────
// DPX = pixels per calendar day at baseline
// RH  = task row height
// BH  = bar height
// HH  = header height
// LW  = left-label column width
export const DPX = 9, RH = 76, BH = 42, HH = 56, LW = 190;

// Project-Gantt row heights
export const PRH = 52;   // project header row
export const RRH = 44;   // role sub-header row
export const SRH = 68;   // person leaf row
export const SBH = 38;   // person bar height

// ── Roles ────────────────────────────────────────────────────────────────────
// `people` is filled dynamically by ProjectGanttTab — see roleOf().
// NOTE: `key` and `label` are required — ProjectGanttTab builds expand/collapse
// keys from `role.key` and renders the header from `role.label`. Without them,
// role keys become "P1-undefined" and the row labels render blank.
export const ROLES = [
  { id:'pm',  key:'pm',  name:'Project Mgr', label:'Project Mgr', color:'#8B5CF6', people:[] },
  { id:'eng', key:'eng', name:'Engineers',   label:'Engineers',   color:'#10B981', people:[] },
  { id:'des', key:'des', name:'Designers',   label:'Designers',   color:'#EC4899', people:[] },
];

/** Map a person name → role. Falls back to the first role if no match. */
export const roleOf = name => ROLES.find(r => r.people.includes(name)) || ROLES[0];