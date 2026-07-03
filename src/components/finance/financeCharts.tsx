import React from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  Treemap, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, ComposedChart, Line,
} from "recharts";
import { Card, SectionHeader } from "../Dashboard";
import { fmtMoney } from "../../lib/money";

const GRID = "#E2E8F0";
const AXIS = "#64748B";
const AXIS_FONT = { fontSize: 10.5, fill: AXIS };

export const ChartCard = ({
  title, right, height = 280, children,
}: {
  title: string;
  right?: React.ReactNode;
  height?: number;
  children: React.ReactElement;
}) => (
  <Card style={{ padding: 16 }}>
    <SectionHeader title={title} right={right} />
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </Card>
);

const dollarTick = (v: number) => fmtMoney(v);

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
  title, right, children,
}: { title: string; right?: React.ReactNode; children: React.ReactElement }) => (
  <Card style={{ padding: 16 }}>
    <SectionHeader title={title} right={right} />
    <div style={{ display: "flex", justifyContent: "center" }}>{children}</div>
  </Card>
);

/** Categorical pie — identity, not magnitude. Fixed slice order via caller. */
export function CountPie({ data, colors }: { data: Array<{ name: string; value: number }>; colors: string[] }) {
  return (
    <PieChart width={PIE_SIZE + 60} height={PIE_SIZE}>
      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} isAnimationActive={false}>
        {data.map((_, i) => (
          <Cell key={i} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={2} />
        ))}
      </Pie>
      <Tooltip formatter={(v: number, n: string) => [v, n]} />
      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
    </PieChart>
  );
}

export function DollarPie({ data, colors }: { data: Array<{ name: string; value: number }>; colors: string[] }) {
  return (
    <PieChart width={PIE_SIZE + 60} height={PIE_SIZE}>
      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} isAnimationActive={false}>
        {data.map((_, i) => (
          <Cell key={i} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={2} />
        ))}
      </Pie>
      <Tooltip formatter={(v: number) => fmtMoney(v)} />
      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
    </PieChart>
  );
}

/** Treemap — project count by region. Sequential single hue, area = magnitude. */
export function RegionTreemap({ data, baseColor }: { data: Array<{ name: string; size: number }>; baseColor: string }) {
  return (
    <Treemap data={data} dataKey="size" nameKey="name" stroke="#fff" fill={baseColor} isAnimationActive={false}>
      <Tooltip formatter={(v: number) => [v, "Projects"]} />
    </Treemap>
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
      <YAxis type="category" dataKey="name" width={120} tick={AXIS_FONT} />
      <Tooltip formatter={(v: number) => (unit === "dollars" ? fmtMoney(v) : v)} />
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
      <XAxis dataKey="name" tick={AXIS_FONT} interval={0} angle={data.length > 4 ? -20 : 0} textAnchor={data.length > 4 ? "end" : "middle"} height={data.length > 4 ? 50 : 30} />
      <YAxis tick={AXIS_FONT} tickFormatter={dollarTick} />
      <Tooltip formatter={(v: number) => fmtMoney(v)} />
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
      <XAxis dataKey="name" tick={AXIS_FONT} interval={0} />
      <YAxis tick={AXIS_FONT} tickFormatter={(v) => `${v}%`} />
      <Tooltip formatter={(v: number) => `${v}%`} />
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
      <XAxis dataKey="name" tick={AXIS_FONT} interval={0} />
      <YAxis tick={AXIS_FONT} tickFormatter={dollarTick} />
      <Tooltip formatter={(v: number) => fmtMoney(v)} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Bar dataKey="actual" name="Actual cost" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={36} />
      <Line type="monotone" dataKey="contract" name="Contract sum" stroke={lineColor} strokeWidth={2} dot={{ r: 4 }} />
    </ComposedChart>
  );
}

/** Multi-series area — weekly expenses per project. Fixed color per project (by index). */
export function WeeklyExpensesArea({
  rows, seriesNames, colors,
}: { rows: Array<Record<string, number | string>>; seriesNames: string[]; colors: string[] }) {
  return (
    <AreaChart data={rows} margin={{ left: 4, right: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
      <XAxis dataKey="week" tick={AXIS_FONT} label={{ value: "Week", position: "insideBottom", offset: -4, fontSize: 10.5, fill: AXIS }} />
      <YAxis tick={AXIS_FONT} tickFormatter={dollarTick} />
      <Tooltip formatter={(v: number) => fmtMoney(v)} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {seriesNames.map((name, i) => (
        <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.35} isAnimationActive={false} />
      ))}
    </AreaChart>
  );
}

/** Stacked bar — cost category breakdown per project. Fixed category → color order. */
export function CategoryStackedBar({
  data, categories, colors,
}: { data: Array<Record<string, number | string>>; categories: string[]; colors: string[] }) {
  return (
    <BarChart data={data} margin={{ left: 4, right: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
      <XAxis dataKey="name" tick={AXIS_FONT} interval={0} />
      <YAxis tick={AXIS_FONT} tickFormatter={dollarTick} />
      <Tooltip formatter={(v: number) => fmtMoney(v)} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {categories.map((cat, i) => (
        <Bar key={cat} dataKey={cat} name={cat} stackId="cat" fill={colors[i % colors.length]} maxBarSize={44} />
      ))}
    </BarChart>
  );
}
