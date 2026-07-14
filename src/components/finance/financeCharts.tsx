import React from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ComposedChart, Line,
} from "recharts";
import { Card, SectionHeader } from "../ui/primitives";
import { fmtMoney } from "../../lib/money";

const GRID = "#E2E8F0";
const AXIS = "#64748B";
const AXIS_FONT = { fontSize: 10.5, fill: AXIS };

/**
 * Shared hover-tooltip styling. `zIndex` lifts the cursor-following tooltip
 * above the legend so it never blends into the legend text behind it;
 * `contentStyle` gives it a solid white card (opaque bg + border + shadow)
 * so nothing shows through. Passed to every <Tooltip> in this file.
 */
const TOOLTIP_WRAPPER = { zIndex: 100 };
const TOOLTIP_CONTENT = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  boxShadow: "0 6px 16px rgba(15,31,61,0.14)",
  fontSize: 11.5,
};

export const ChartCard = ({
  title, description, right, height = 280, children,
}: {
  title: string;
  /** One-line plain-English explanation of what the chart shows — always visible, not a hover tooltip. */
  description?: string;
  right?: React.ReactNode;
  height?: number;
  children: React.ReactElement;
}) => (
  <Card style={{ padding: 16 }}>
    <SectionHeader title={title} right={right} />
    {description && <div style={{ fontSize: 11, color: "#64748B", marginTop: -6, marginBottom: 10 }}>{description}</div>}
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </Card>
);

const dollarTick = (v: number) => fmtMoney(v);

/**
 * Long project/contractor names wrapped onto a second line and overlapped
 * each other on every axis with more than a few categories. Truncate the
 * axis TICK to one line with an ellipsis — the full name is still shown in
 * the hover tooltip (Recharts passes the raw value there, not the tick text).
 */
const truncateLabel = (value: string, max = 12): string =>
  typeof value === "string" && value.length > max ? `${value.slice(0, max - 1)}…` : value;

/**
 * Pie charts get their own fixed-size card rather than going through
 * ChartCard's ResponsiveContainer — recharts' Pie/polar geometry doesn't
 * recompute cleanly on the container-resize path ResponsiveContainer uses,
 * which can leave it drawing only part of the circle. A fixed pixel size
 * sidesteps that entirely; Bar/Area/Composed/Treemap are unaffected and
 * still use ChartCard.
 */
const PIE_SIZE = 260;

export const PieCard = ({
  title, description, right, children,
}: { title: string; description?: string; right?: React.ReactNode; children: React.ReactElement }) => (
  <Card style={{ padding: 16 }}>
    <SectionHeader title={title} right={right} />
    {description && <div style={{ fontSize: 11, color: "#64748B", marginTop: -6, marginBottom: 10 }}>{description}</div>}
    <div style={{ display: "flex", justifyContent: "center" }}>{children}</div>
  </Card>
);

// Pie sits left-of-centre with the legend in its own column to the right —
// at 50/50 the legend text crowds right up against the slices.
const PIE_CHART_WIDTH = PIE_SIZE + 240;

const pct = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);

/**
 * On-slice percentage label, drawn at the slice centroid. Suppressed for
 * slices under 6% — the text won't fit and would overlap its neighbours;
 * those slices still carry their % in the legend and tooltip.
 */
function sliceLabel(p: {
  cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; percent?: number;
}) {
  const cx = p.cx ?? 0, cy = p.cy ?? 0, midAngle = p.midAngle ?? 0;
  const innerRadius = p.innerRadius ?? 0, outerRadius = p.outerRadius ?? 0, percent = p.percent ?? 0;
  if (percent < 0.06) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.6;
  const rad = -midAngle * (Math.PI / 180);
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);
  return (
    <text x={x} y={y} fill="#fff" fontSize={11} fontWeight={600} textAnchor="middle" dominantBaseline="central">
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

/** Legend row: "Name — 32%". Total closed over so each row knows its share. */
const pctLegendFormatter = (data: Array<{ name: string; value: number }>) => {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (value: string) => {
    const row = data.find((d) => d.name === value);
    return `${value} — ${Math.round(pct(row?.value ?? 0, total))}%`;
  };
};

/** Categorical pie — identity, not magnitude. Fixed slice order via caller. */
export function CountPie({ data, colors }: { data: Array<{ name: string; value: number }>; colors: string[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <PieChart width={PIE_CHART_WIDTH} height={PIE_SIZE}>
      <Pie data={data} dataKey="value" nameKey="name" cx="36%" cy="50%" outerRadius={80} isAnimationActive={false} labelLine={false} label={sliceLabel}>
        {data.map((_, i) => (
          <Cell key={i} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={2} />
        ))}
      </Pie>
      <Tooltip wrapperStyle={TOOLTIP_WRAPPER} contentStyle={TOOLTIP_CONTENT} formatter={(v, n) => [`${Number(v)} (${Math.round(pct(Number(v), total))}%)`, String(n)]} />
      <Legend layout="vertical" verticalAlign="middle" align="right" formatter={pctLegendFormatter(data)} wrapperStyle={{ fontSize: 11, paddingLeft: 20 }} />
    </PieChart>
  );
}

export function DollarPie({ data, colors }: { data: Array<{ name: string; value: number }>; colors: string[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <PieChart width={PIE_CHART_WIDTH} height={PIE_SIZE}>
      <Pie data={data} dataKey="value" nameKey="name" cx="36%" cy="50%" outerRadius={80} isAnimationActive={false} labelLine={false} label={sliceLabel}>
        {data.map((_, i) => (
          <Cell key={i} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={2} />
        ))}
      </Pie>
      <Tooltip wrapperStyle={TOOLTIP_WRAPPER} contentStyle={TOOLTIP_CONTENT} formatter={(v) => `${fmtMoney(Number(v))} (${Math.round(pct(Number(v), total))}%)`} />
      <Legend layout="vertical" verticalAlign="middle" align="right" formatter={pctLegendFormatter(data)} wrapperStyle={{ fontSize: 11, paddingLeft: 20 }} />
    </PieChart>
  );
}

/**
 * Recharts' default category-axis tick wraps long text onto a second line
 * based on the RAW label's measured width, regardless of a tickFormatter's
 * shortened output — so a truncated "Southbank Resid…" still wrapped. A
 * custom single-line tick (plain SVG <text>, no Recharts wrap logic) fixes it.
 */
function SingleLineYTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={AXIS_FONT.fontSize} fill={AXIS_FONT.fill}>
      {truncateLabel(String(payload?.value ?? ""), 16)}
    </text>
  );
}

/** Horizontal single-series bar — magnitude ranking. */
export function HorizontalBar({
  data, dataKey, color, unit,
}: { data: Array<Record<string, number | string>>; dataKey: string; color: string; unit?: "weeks" | "dollars" }) {
  return (
    <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
      <XAxis type="number" tick={AXIS_FONT} tickFormatter={unit === "dollars" ? dollarTick : undefined} />
      <YAxis type="category" dataKey="name" width={120} interval={0} tick={<SingleLineYTick />} />
      <Tooltip
        wrapperStyle={TOOLTIP_WRAPPER}
        contentStyle={TOOLTIP_CONTENT}
        formatter={(v) => (unit === "dollars" ? fmtMoney(Number(v)) : Number(v))}
        labelFormatter={(label, payload) => {
          const row = payload?.[0]?.payload as { start?: string; end?: string } | undefined;
          return row?.start && row?.end ? `${label} (${row.start} → ${row.end})` : label;
        }}
      />
      <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} />
    </BarChart>
  );
}

/** Grouped bar — two dollar series (contract vs actual) per category. Single axis, same unit. */
export function GroupedDollarBar({
  data, seriesA, seriesB, colorA, colorB,
}: { data: Array<{ name: string; contract: number; actual: number }>; seriesA: string; seriesB: string; colorA: string; colorB: string }) {
  return (
    <BarChart data={data} margin={{ left: 4, right: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
      <XAxis dataKey="name" tick={AXIS_FONT} interval={0} tickFormatter={(v) => truncateLabel(v)} />
      <YAxis tick={AXIS_FONT} tickFormatter={dollarTick} />
      <Tooltip wrapperStyle={TOOLTIP_WRAPPER} contentStyle={TOOLTIP_CONTENT} formatter={(v) => fmtMoney(Number(v))} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Bar dataKey="contract" name={seriesA} fill={colorA} radius={[4, 4, 0, 0]} maxBarSize={36} />
      <Bar dataKey="actual" name={seriesB} fill={colorB} radius={[4, 4, 0, 0]} maxBarSize={36} />
    </BarChart>
  );
}

/** Single-series column chart — e.g. margin % per project. */
export function PercentColumn({ data, color }: { data: Array<{ name: string; marginPct: number }>; color: string }) {
  return (
    <BarChart data={data} margin={{ left: 4, right: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
      <XAxis dataKey="name" tick={AXIS_FONT} interval={0} tickFormatter={(v) => truncateLabel(v)} />
      <YAxis tick={AXIS_FONT} tickFormatter={(v) => `${v}%`} />
      <Tooltip wrapperStyle={TOOLTIP_WRAPPER} contentStyle={TOOLTIP_CONTENT} formatter={(v) => `${Number(v)}%`} />
      <Bar dataKey="marginPct" name="Projected margin" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
    </BarChart>
  );
}

/** Bar + line combo on ONE dollar axis (both series are dollars — not a dual-axis chart). */
export function ContractorComposed({
  data, barColor, lineColor,
}: { data: Array<{ name: string; contract: number; actual: number }>; barColor: string; lineColor: string }) {
  return (
    <ComposedChart data={data} margin={{ left: 4, right: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
      <XAxis dataKey="name" tick={AXIS_FONT} interval={0} tickFormatter={(v) => truncateLabel(v)} />
      <YAxis tick={AXIS_FONT} tickFormatter={dollarTick} />
      <Tooltip wrapperStyle={TOOLTIP_WRAPPER} contentStyle={TOOLTIP_CONTENT} formatter={(v) => fmtMoney(Number(v))} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Bar dataKey="actual" name="Actual cost" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={36} />
      <Line type="monotone" dataKey="contract" name="Contract sum" stroke={lineColor} strokeWidth={2} dot={{ r: 4 }} />
    </ComposedChart>
  );
}

/**
 * Stacked bar — spend over time (real calendar months) per project. Most
 * projects are only active a handful of months out of the full portfolio
 * timeline, so a stacked AREA left ragged edges and white gaps wherever a
 * project dropped in/out (area interpolates between points; bars don't).
 * A stacked bar per month reads cleanly regardless of how sparse each
 * project's active window is. Legend pinned to the TOP (see CategoryStackedBar).
 */
export function SpendOverTimeArea({
  rows, seriesNames, colors,
}: { rows: Array<Record<string, number | string>>; seriesNames: string[]; colors: string[] }) {
  return (
    <BarChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
      <Legend verticalAlign="top" align="left" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
      <XAxis dataKey="label" tick={AXIS_FONT} />
      <YAxis tick={AXIS_FONT} tickFormatter={dollarTick} />
      <Tooltip wrapperStyle={TOOLTIP_WRAPPER} contentStyle={TOOLTIP_CONTENT} formatter={(v) => fmtMoney(Number(v))} />
      {seriesNames.map((name, i) => (
        <Bar key={name} dataKey={name} name={name} stackId="spend" fill={colors[i % colors.length]} isAnimationActive={false} />
      ))}
    </BarChart>
  );
}

/** Stacked bar — cost category breakdown per project. Fixed category → color order. Top legend (see SpendOverTimeArea). */
export function CategoryStackedBar({
  data, categories, colors,
}: { data: Array<Record<string, number | string>>; categories: string[]; colors: string[] }) {
  return (
    <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
      <Legend verticalAlign="top" align="left" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
      <XAxis dataKey="name" tick={AXIS_FONT} interval={0} tickFormatter={(v) => truncateLabel(v)} />
      <YAxis tick={AXIS_FONT} tickFormatter={dollarTick} />
      <Tooltip wrapperStyle={TOOLTIP_WRAPPER} contentStyle={TOOLTIP_CONTENT} formatter={(v) => fmtMoney(Number(v))} />
      {categories.map((cat, i) => (
        <Bar key={cat} dataKey={cat} name={cat} stackId="cat" fill={colors[i % colors.length]} maxBarSize={44} />
      ))}
    </BarChart>
  );
}
