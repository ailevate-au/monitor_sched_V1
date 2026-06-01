// ── Theme ────────────────────────────────────────────────────────────────────
// Colour palette, role definitions, and Gantt-chart sizing constants.
//
// SEMANTIC TOKEN SYSTEM
// ─────────────────────
// Every colour in the app routes through a *named role* below, not a raw hex.
// This is what makes a light/dark theme flip a single-file change: to switch
// themes, only the right-hand values here change — no component is touched.
//
// Tokens are grouped by role:
//   • Surfaces    — backgrounds, from deepest (app canvas) to raised (cards)
//   • Lines       — borders and dividers
//   • Text        — primary / muted / faint, plus on-accent
//   • Accent      — the brand colour (orange) and its variants
//   • Status      — semantic state colours (danger/warn/ok/info) + their
//                   subtle background + text-on-subtle variants
//   • Task        — Gantt bar colours (status-driven)
//
// The current values are the DARK theme. Step 2 of the SiteWize convergence
// swaps these for light values. Nothing else needs to change.
//
// ── STEP 2 LIGHT PALETTE (harvested from EditModal's existing light design) ──
// When we flip to light, replace the dark values below with these. This palette
// is not invented — it's lifted from EditModal.jsx, which was already built in
// the target light style, so it's a proven, coherent set.
//
//   Surfaces:  CANVAS #F1F5F9 · SURFACE #F8FAFC · PANEL #F8FAFC · CARD #FFFFFF
//              INSET #F1F5F9 · CHIP #F1F5F9
//   Lines:     BORDER #E2E8F0 · BORDER_HI #CBD5E1
//   Text:      TEXT #0F172A · MUTED #475569 · FAINT #64748B · ON_ACCENT #FFFFFF
//   Accent:    ACCENT #F97316 (unchanged) · ACCENT_HI #FB923C
//   Danger:    DANGER #EF4444 · DANGER_TEXT #B91C1C · DANGER_SUBTLE #FEF2F2 · DANGER_BORDER #FECACA
//   Warn:      WARN #F59E0B · WARN_TEXT #92400E · WARN_SUBTLE #FFF7ED · WARN_BORDER #FED7AA
//   OK:        OK #10B981 · OK_TEXT #14532D · OK_SUBTLE #F0FDF4 · OK_BORDER #86EFAC
//   Info:      INFO #38BDF8 · INFO_SUBTLE #F0F9FF · INFO_BORDER #BAE6FD
// ─────────────────────────────────────────────────────────────────────────────

// ── Surfaces (deepest → most raised) ─────────────────────────────────────────
// LIGHT THEME. On light, the "depth" ladder inverts: the app canvas is a faint
// grey, raised surfaces move toward white, and CARD (the most raised) is pure
// white. Inset wells go slightly grey again to read as recessed.
const SURFACES = {
  CANVAS:    '#F1F5F9',  // app background — faint slate grey
  SURFACE:   '#F8FAFC',  // secondary surface / tab body — near white
  PANEL:     '#F8FAFC',  // modal footers, raised panels
  CARD:      '#FFFFFF',  // cards, primary content containers — pure white
  INSET:     '#F1F5F9',  // inputs, deep wells — recessed grey
  CHIP:      '#F1F5F9',  // chips, small inset elements
};

// ── Lines ────────────────────────────────────────────────────────────────────
// LIGHT THEME — light slate borders.
const LINES = {
  BORDER:    '#E2E8F0',  // standard border / divider
  BORDER_HI: '#CBD5E1',  // slightly stronger border (hover, emphasis)
};

// ── Text ───────────────────────────────────────────────────────────────────--
// LIGHT THEME — dark slate scale. On white, muted/faint are DARKER than on the
// dark theme (they were light-grey on dark; now they're mid-slate on white).
const TEXTS = {
  TEXT:        '#0F172A',  // primary text — near-black slate
  MUTED:       '#475569',  // secondary / label text — mid slate
  FAINT:       '#64748B',  // tertiary / hint text — lighter slate
  ON_ACCENT:   '#FFFFFF',  // text on an accent/colour-filled background
};

// ── Accent (brand) ───────────────────────────────────────────────────────────
const ACCENTS = {
  ACCENT:      '#F97316',  // brand orange — primary actions, active states
  ACCENT_HI:   '#FB923C',  // brighter orange (hover)
  ACCENT_DEEP: '#C2410C',  // darker orange (rare)
};

// ── Status roles ──────────────────────────────────────────────────────────────
// LIGHT THEME. The solid colours (DANGER/WARN/OK/INFO) are unchanged — they read
// on both themes. What inverts: *_SUBTLE backgrounds go from dark washes to PALE
// washes, and *_TEXT goes from light (for dark bg) to DARK saturated (for pale
// bg). Borders move to light-mid tints. Values harvested from EditModal.
const STATUS = {
  // Danger / conflict / overdue (red)
  DANGER:        '#EF4444',
  DANGER_TEXT:   '#B91C1C',  // dark red text (reads on pale danger bg)
  DANGER_TEXT2:  '#DC2626',  // alternate dark red
  DANGER_SUBTLE: '#FEF2F2',  // pale red wash (banner/pill bg)
  DANGER_BORDER: '#FECACA',  // light red border

  // Warn / fragile / weather (amber)
  WARN:          '#F59E0B',
  WARN_BADGE:    '#D97706',  // deeper amber — fragile badge (reads on pale)
  WARN_TEXT:     '#92400E',  // dark amber text
  WARN_TEXT2:    '#B45309',  // alternate dark amber
  WARN_SUBTLE:   '#FFF7ED',  // pale amber wash
  WARN_SUBTLE2:  '#FFFBEB',  // alternate pale amber wash
  WARN_BORDER:   '#FED7AA',  // light amber border

  // OK / completed / on-track (green)
  OK:            '#10B981',
  OK_HI:         '#059669',  // deeper green (reads on pale)
  OK_HI2:        '#047857',  // even deeper green
  OK_TEXT:       '#14532D',  // dark green text
  OK_SUBTLE:     '#F0FDF4',  // pale green wash
  OK_BORDER:     '#86EFAC',  // light green border

  // Info / weather-risk / links (blue)
  INFO:          '#0EA5E9',  // sky blue (weather risk) — slightly deeper for light
  INFO_SUBTLE:   '#F0F9FF',  // pale blue wash
  INFO_BORDER:   '#BAE6FD',  // light blue border
  INFO_INDIGO:   '#6366F1',  // indigo accent (rare)
};

// ── Task / Gantt bar colours (status-driven) ─────────────────────────────────
// The bar fills (TASK_BLUE family) read on both themes, kept as-is. The pill
// BACKGROUNDS (BG/BG2) flip from dark steel to pale blue-grey for light.
export const TASK_BLUE       = '#5B7B9A';  // default — on track / in progress
export const TASK_BLUE_HI    = '#4A6B8A';  // deeper stroke for in-progress (reads on light pill)
export const TASK_BLUE_LO    = '#94A3B8';  // lighter blue border (light theme)
export const TASK_BLUE_LO2   = '#CBD5E1';  // lightest blue border
export const TASK_BLUE_BG    = '#EFF4F8';  // In Progress pill background — pale blue
export const TASK_BLUE_BG2   = '#F1F5F9';  // On Track pill background — pale grey

// ── Elevation (SiteWize-style soft shadows) ──────────────────────────────────
// On the light theme, cards get a hairline border PLUS a very subtle shadow —
// that soft lift is the difference between "flat box" and "polished card".
// Three levels: SM (resting cards), MD (raised cards / sections), LG (modals).
// Kept low-opacity and slate-tinted so they read as gentle, not heavy.
export const SHADOW_SM = '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)';
export const SHADOW_MD = '0 1px 3px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.08)';
export const SHADOW_LG = '0 8px 24px rgba(15,23,42,0.12), 0 16px 48px rgba(15,23,42,0.10)';

// ── Primary exported palette object ───────────────────────────────────────────
// COLORS keeps its original keys (NAV/SURFACE/CARD/BORDER/ORANGE/TEXT/MUTED)
// for backward compatibility — every existing import keeps working. New
// semantic tokens are added alongside.
export const COLORS = {
  // Legacy keys (unchanged names, point at semantic values)
  NAV:     SURFACES.CANVAS,
  SURFACE: SURFACES.SURFACE,
  CARD:    SURFACES.CARD,
  BORDER:  LINES.BORDER,
  ORANGE:  ACCENTS.ACCENT,
  TEXT:    TEXTS.TEXT,
  MUTED:   TEXTS.MUTED,

  // New semantic surface tokens
  CANVAS:  SURFACES.CANVAS,
  PANEL:   SURFACES.PANEL,
  INSET:   SURFACES.INSET,
  CHIP:    SURFACES.CHIP,

  // Lines
  BORDER_HI: LINES.BORDER_HI,

  // Text
  FAINT:     TEXTS.FAINT,
  ON_ACCENT: TEXTS.ON_ACCENT,

  // Accent
  ACCENT:      ACCENTS.ACCENT,
  ACCENT_HI:   ACCENTS.ACCENT_HI,
  ACCENT_DEEP: ACCENTS.ACCENT_DEEP,

  // Status (spread in)
  ...STATUS,
};

// Convenience destructure (used by components that don't want the full object).
// All existing names preserved; new ones available too.
export const {
  NAV, SURFACE, CARD, BORDER, ORANGE, TEXT, MUTED,
  CANVAS, PANEL, INSET, CHIP, BORDER_HI, FAINT, ON_ACCENT,
  ACCENT, ACCENT_HI, ACCENT_DEEP,
} = COLORS;

// Status convenience exports (kept as individual names matching old usage)
export const STATUS_GREEN    = STATUS.OK;          // completed
export const STATUS_AMBER    = STATUS.WARN;        // overdue
export const STATUS_RED      = STATUS.DANGER;      // conflict
export const BADGE_YELLOW    = STATUS.WARN_BADGE;  // fragile (badge only)
export const CONFLICT_RED    = STATUS.DANGER;      // alias kept for callers

// Full status object exported for components that want the subtle/border variants
export const STATUS_TOKENS = STATUS;

// ── Legacy palettes (colour-coding by project/person was removed) ────────────
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
export const DPX = 16, RH = 76, BH = 42, HH = 56, LW = 190;
export const PRH = 48;   // project header row
export const RRH = 40;   // role sub-header row
export const SRH = 48;   // person leaf row (shorter — was 68)
export const SBH = 28;   // person bar height (shorter — was 38)

// ── Roles ────────────────────────────────────────────────────────────────────
export const ROLES = [
  { id:'pm',  key:'pm',  name:'Project Mgr', label:'Project Mgr', color:'#8B5CF6', people:[] },
  { id:'eng', key:'eng', name:'Engineers',   label:'Engineers',   color:STATUS.OK, people:[] },
  { id:'des', key:'des', name:'Designers',   label:'Designers',   color:'#EC4899', people:[] },
];

/** Map a person name → role. Falls back to the first role if no match. */
export const roleOf = name => ROLES.find(r => r.people.includes(name)) || ROLES[0];