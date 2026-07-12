import React from "react";

/**
 * Inline SVG choropleth of Australia — project count by state. Hand-rolled
 * simplified state outlines (straight interior borders, coarse coastline —
 * this is a demo glance, not cartography), so no map library is needed and
 * the app stays fully offline. States with projects are shaded in the base
 * colour, darker meaning more projects; states without any stay muted.
 * Hover shows the full state name and count via a native <title>.
 */

const STATES: Array<{ id: string; label: string; path: string; cx: number; cy: number }> = [
  {
    id: "WA",
    label: "Western Australia",
    path: "M28,164 L60,120 L120,80 L166,68 L199,78 L199,282 L160,292 L121,308 L75,320 L42,312 L51,284 L27,212 Z",
    cx: 105, cy: 210,
  },
  {
    id: "NT",
    label: "Northern Territory",
    path: "M199,78 L210,56 L222,44 L260,40 L289,52 L295,75 L300,98 L300,212 L199,212 Z",
    cx: 248, cy: 140,
  },
  {
    id: "SA",
    label: "South Australia",
    path: "M199,212 L334,212 L334,356 L322,350 L306,326 L290,318 L260,300 L222,284 L199,282 Z",
    cx: 262, cy: 270,
  },
  {
    id: "QLD",
    label: "Queensland",
    path: "M300,98 L315,88 L328,55 L350,28 L362,64 L386,103 L410,145 L440,185 L468,230 L472,248 L334,248 L334,212 L300,212 Z",
    cx: 385, cy: 160,
  },
  {
    id: "NSW",
    label: "New South Wales",
    path: "M334,248 L472,248 L460,278 L448,307 L438,334 L434,350 L334,308 Z",
    cx: 396, cy: 283,
  },
  {
    id: "VIC",
    label: "Victoria",
    path: "M334,308 L434,350 L415,362 L394,368 L378,354 L360,364 L334,356 Z",
    cx: 381, cy: 341,
  },
  {
    id: "TAS",
    label: "Tasmania",
    path: "M374,402 L393,387 L415,398 L408,420 L385,426 Z",
    cx: 395, cy: 408,
  },
];

// The ACT is too small to draw as a shape at this scale — it gets a dot
// marker beside Canberra's position, rendered only when it has projects.
const ACT = { id: "ACT", label: "Australian Capital Territory", cx: 424, cy: 326 };

const EMPTY_FILL = "#EEF2F8";
const EMPTY_STROKE = "#E2E8F0";
const LABEL_DARK = "#0F1F3D";
const LABEL_MUTED = "#94A3B8";

export function AusMap({ data, baseColor = "#1A5FA8" }: { data: Array<{ name: string; size: number }>; baseColor?: string }) {
  const counts = new Map(data.map(d => [d.name, d.size]));
  const max = Math.max(1, ...data.map(d => d.size));
  const actCount = counts.get(ACT.id) ?? 0;

  return (
    <svg width={380} height={300} viewBox="0 0 500 460" role="img" aria-label="Number of projects in each Australian state">
      {STATES.map(s => {
        const count = counts.get(s.id) ?? 0;
        const opacity = 0.3 + 0.7 * (count / max);
        // On the darkest fills a navy label disappears — switch to white.
        const labelFill = count > 0 ? (opacity > 0.65 ? "#FFFFFF" : LABEL_DARK) : LABEL_MUTED;
        return (
          <g key={s.id}>
            <path
              d={s.path}
              fill={count > 0 ? baseColor : EMPTY_FILL}
              fillOpacity={count > 0 ? opacity : 1}
              stroke={count > 0 ? "#FFFFFF" : EMPTY_STROKE}
              strokeWidth={1.5}
              strokeLinejoin="round"
            >
              <title>{`${s.label} — ${count} project${count === 1 ? "" : "s"}`}</title>
            </path>
            <text x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill={labelFill} pointerEvents="none">
              {count > 0 ? `${s.id} · ${count}` : s.id}
            </text>
          </g>
        );
      })}
      {actCount > 0 && (
        <g>
          <circle cx={ACT.cx} cy={ACT.cy} r={6} fill={baseColor} stroke="#FFFFFF" strokeWidth={1.5}>
            <title>{`${ACT.label} — ${actCount} project${actCount === 1 ? "" : "s"}`}</title>
          </circle>
          <text x={ACT.cx + 12} y={ACT.cy} dominantBaseline="central" fontSize={11} fontWeight={600} fill={LABEL_DARK} pointerEvents="none">
            {`ACT · ${actCount}`}
          </text>
        </g>
      )}
    </svg>
  );
}
