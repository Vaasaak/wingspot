// Vizuální výběr směrů větru pro AddSpotModal.
// 8 sektorů (N, NE, E, SE, S, SW, W, NW), každý 45°.
// Klik na sektor cykluje: neutral → good (teal) → bad (red) → neutral.
// "good" = vítr z tohoto směru je vhodný (od vody, side-shore).
// "bad"  = offshore / nebezpečný.

import type { DirRange } from "../data/spots";

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export type SectorState = "neutral" | "good" | "bad";

export interface WindCompassValue {
  sectors: SectorState[];   // délka 8, index 0=N, 1=NE, …, 7=NW
}

// eslint-disable-next-line react-refresh/only-export-components
export function sectorsToDirRanges(sectors: SectorState[], kind: "good" | "bad"): DirRange[] {
  const out: DirRange[] = [];
  sectors.forEach((s, i) => {
    if (s !== kind) return;
    const center = i * 45;
    const from = (center - 22.5 + 360) % 360;
    const to   = (center + 22.5) % 360;
    out.push({ from, to });
  });
  return out;
}

// eslint-disable-next-line react-refresh/only-export-components
export function defaultSectors(): SectorState[] {
  return Array(8).fill("neutral") as SectorState[];
}

// Opak sectorsToDirRanges: z uložených good_dirs/bad_dirs zrekonstruuje sektory
// (pro předvyplnění kompasu při admin editaci). bad přebije good.
// eslint-disable-next-line react-refresh/only-export-components
export function dirRangesToSectors(
  goodDirs?: DirRange[] | null,
  badDirs?: DirRange[] | null
): SectorState[] {
  const inRange = (deg: number, r: DirRange) =>
    r.from <= r.to ? deg >= r.from && deg <= r.to : deg >= r.from || deg <= r.to;
  const inAny = (deg: number, rs?: DirRange[] | null) => !!rs && rs.some((r) => inRange(deg, r));
  return Array.from({ length: 8 }, (_, i) => {
    const center = i * 45;
    if (inAny(center, badDirs)) return "bad";
    if (inAny(center, goodDirs)) return "good";
    return "neutral";
  }) as SectorState[];
}

interface Props {
  value: SectorState[];
  onChange: (v: SectorState[]) => void;
}

const COLORS: Record<SectorState, string> = {
  neutral: "var(--line)",
  good:    "#0ea5e9",
  bad:     "#ef4444",
};

const HOVER_COLORS: Record<SectorState, string> = {
  neutral: "var(--muted-bg, #334155)",
  good:    "#0284c7",
  bad:     "#dc2626",
};

function sectorPath(index: number, cx: number, cy: number, r: number, ri: number): string {
  const startDeg = index * 45 - 22.5 - 90; // -90 pro sever = nahoru
  const endDeg   = startDeg + 45;
  const s = startDeg * Math.PI / 180;
  const e = endDeg   * Math.PI / 180;
  const x1o = cx + r  * Math.cos(s), y1o = cy + r  * Math.sin(s);
  const x2o = cx + r  * Math.cos(e), y2o = cy + r  * Math.sin(e);
  const x1i = cx + ri * Math.cos(s), y1i = cy + ri * Math.sin(s);
  const x2i = cx + ri * Math.cos(e), y2i = cy + ri * Math.sin(e);
  return [
    `M ${x1i} ${y1i}`,
    `L ${x1o} ${y1o}`,
    `A ${r} ${r} 0 0 1 ${x2o} ${y2o}`,
    `L ${x2i} ${y2i}`,
    `A ${ri} ${ri} 0 0 0 ${x1i} ${y1i}`,
    "Z",
  ].join(" ");
}

function labelPos(index: number, cx: number, cy: number, r: number) {
  const angle = (index * 45 - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

const NEXT: Record<SectorState, SectorState> = {
  neutral: "good",
  good:    "bad",
  bad:     "neutral",
};

export function WindCompass({ value, onChange }: Props) {
  const cx = 80, cy = 80, outer = 70, inner = 26, labelR = 58;

  function toggle(i: number) {
    const next = [...value];
    next[i] = NEXT[next[i]];
    onChange(next);
  }

  const goodCount = value.filter(s => s === "good").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 4 }}>
      <svg
        viewBox="0 0 160 160"
        width={160}
        height={160}
        style={{ cursor: "pointer", userSelect: "none", display: "block" }}
      >
        {value.map((state, i) => (
          <path
            key={i}
            d={sectorPath(i, cx, cy, outer, inner)}
            fill={COLORS[state]}
            stroke="var(--bg, #0f172a)"
            strokeWidth={2}
            onClick={() => toggle(i)}
            style={{ transition: "fill 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.fill = HOVER_COLORS[state])}
            onMouseLeave={e => (e.currentTarget.style.fill = COLORS[state])}
          />
        ))}

        {/* Střed */}
        <circle cx={cx} cy={cy} r={inner - 2} fill="var(--bg2, #1e293b)" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fill="var(--muted, #94a3b8)">vítr</text>

        {/* Popisky směrů */}
        {DIRS.map((label, i) => {
          const { x, y } = labelPos(i, cx, cy, labelR);
          return (
            <text
              key={label}
              x={x} y={y + 4}
              textAnchor="middle"
              fontSize={i % 2 === 0 ? 11 : 9}
              fontWeight={i % 2 === 0 ? "600" : "400"}
              fill={value[i] === "neutral" ? "var(--muted, #94a3b8)" : "#fff"}
              style={{ pointerEvents: "none" }}
            >
              {label}
            </text>
          );
        })}
      </svg>

      <div style={{ display: "flex", gap: 16, fontSize: "0.78rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.good, display: "inline-block" }} />
          vhodný
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.bad, display: "inline-block" }} />
          offshore
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.neutral, display: "inline-block" }} />
          neutrální
        </span>
      </div>

      {goodCount === 0 && (
        <p className="warn-text small" style={{ margin: 0 }}>
          Vyber alespoň jeden vhodný směr větru ↑
        </p>
      )}
    </div>
  );
}
