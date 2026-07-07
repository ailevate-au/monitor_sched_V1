/**
 * Shared design tokens — the single source of truth for the app's visual
 * language.
 *
 * Historically every component re-declared its own `const C = {…}` palette
 * (19 near-identical copies that had already started to drift — e.g. `textMuted`
 * was #475569 in most files but #64748B in Dashboard). Import from here instead,
 * so a colour change is one edit rather than nineteen.
 *
 * Adoption is incremental: new and edited components should import `C` (and,
 * over time, TYPE / RADIUS) from this file rather than redefining the values.
 */

// ── Colour palette ───────────────────────────────────────────────────
// Superset of every component's historical palette. `textMuted` is unified to
// #475569 (the value used by the majority of screens; slightly higher contrast
// than Dashboard's old #64748B).
export const C = {
  navy:      "#0F1F3D",
  blue:      "#1A5FA8",
  blueMid:   "#3A8ADE",
  blueLight: "#E6F0FB",
  green:     "#1D9E75",
  greenBg:   "#ECFDF5",
  greenDark: "#2D6A0A",
  amber:     "#B87316",
  amberBg:   "#FEF3C7",
  red:       "#E04A4A",
  redDark:   "#9B2C2C",
  redBg:     "#FEF2F2",
  purple:    "#7F77DD",
  purpleBg:  "#F3F2FF",
  gray:      "#64748B",
  grayLight: "#E2E8F0",
  text:      "#1E293B",
  textMuted: "#475569",
  bg:        "#F4F7FC",
  bgSecond:  "#EEF2F8",
  white:     "#FFFFFF",
} as const;

// ── Type scale (px) ──────────────────────────────────────────────────
// Replaces the ~20 ad-hoc font sizes in use today. Adopt incrementally.
export const TYPE = {
  xs:      11,   // fine print, chips, table sub-labels
  sm:      12,   // secondary body text
  base:    13,   // default body text
  lg:      15,   // card titles / section headers
  xl:      18,   // panel headings
  display: 23,   // KPI numbers, hero figures
} as const;

// ── Corner radii (px) ────────────────────────────────────────────────
// Replaces the ~15 ad-hoc radii in use today. Adopt incrementally.
export const RADIUS = {
  sm:   6,    // inputs, small buttons, chips
  md:   8,    // buttons, list rows
  lg:   12,   // cards, panels, modals
  pill: 999,  // status pills / fully-rounded
} as const;
