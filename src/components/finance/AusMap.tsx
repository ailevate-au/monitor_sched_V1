import React from "react";
import { AUS_STATES, AUS_VIEWBOX } from "./ausStatesPaths";

/**
 * SVG choropleth of Australia — project count by state. Real state outlines
 * (see ausStatesPaths.ts for provenance), no map library, fully offline.
 * States with projects are shaded in the base colour, darker meaning more
 * projects; states without any stay muted. Hover a state for the full name
 * and count (native <title>).
 */

const EMPTY_FILL = "#EEF2F8";
const EMPTY_STROKE = "#CBD5E1";
const LABEL_DARK = "#0F1F3D";
const LABEL_MUTED = "#94A3B8";

// The ACT is a dot on the map at this scale — label it off to the side with
// a leader line instead of on top of the shape.
const ACT_LABEL = { x: 262, y: 196 };

export function AusMap({ data, baseColor = "#1A5FA8" }: { data: Array<{ name: string; size: number }>; baseColor?: string }) {
  const counts = new Map(data.map(d => [d.name, d.size]));
  const max = Math.max(1, ...data.map(d => d.size));

  return (
    <svg width={420} height={380} viewBox={AUS_VIEWBOX} role="img" aria-label="Number of projects in each Australian state">
      {AUS_STATES.map(s => {
        const count = counts.get(s.id) ?? 0;
        const opacity = 0.25 + 0.75 * (count / max);
        const isAct = s.id === "ACT";
        // On the darkest fills a navy label disappears — switch to white.
        const labelFill = count > 0 ? (opacity > 0.65 ? "#FFFFFF" : LABEL_DARK) : LABEL_MUTED;
        const labelX = isAct ? ACT_LABEL.x : s.cx;
        const labelY = isAct ? ACT_LABEL.y : s.cy;
        return (
          <g key={s.id}>
            <path
              d={s.path}
              fill={count > 0 ? baseColor : EMPTY_FILL}
              fillOpacity={count > 0 ? opacity : 1}
              stroke={count > 0 ? "#FFFFFF" : EMPTY_STROKE}
              strokeWidth={0.8}
              strokeLinejoin="round"
            >
              <title>{`${s.label} — ${count} project${count === 1 ? "" : "s"}`}</title>
            </path>
            {isAct && (count > 0 || null) && (
              <line x1={s.cx + 2} y1={s.cy} x2={ACT_LABEL.x - 12} y2={ACT_LABEL.y - 2} stroke={LABEL_MUTED} strokeWidth={0.5} />
            )}
            {(!isAct || count > 0) && (
              <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight={600} fill={isAct ? LABEL_DARK : labelFill} pointerEvents="none">
                {count > 0 ? `${s.id} · ${count}` : s.id}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
