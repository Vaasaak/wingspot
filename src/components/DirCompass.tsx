// Malý NEinteraktivní kompas pro zobrazení směrů větru (good/bad) — admin,
// detail spotu apod. Vstup = good_dirs/bad_dirs (DirRange[]), vykreslí 8 sektorů.

import type { DirRange } from "../data/spots";

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function inRange(deg: number, r: DirRange): boolean {
  return r.from <= r.to ? deg >= r.from && deg <= r.to : deg >= r.from || deg <= r.to;
}
function inAny(deg: number, rs?: DirRange[] | null): boolean {
  return !!rs && rs.some((r) => inRange(deg, r));
}

function sectorPath(index: number, cx: number, cy: number, r: number, ri: number): string {
  const startDeg = index * 45 - 22.5 - 90;
  const endDeg = startDeg + 45;
  const s = (startDeg * Math.PI) / 180;
  const e = (endDeg * Math.PI) / 180;
  const x1o = cx + r * Math.cos(s), y1o = cy + r * Math.sin(s);
  const x2o = cx + r * Math.cos(e), y2o = cy + r * Math.sin(e);
  const x1i = cx + ri * Math.cos(s), y1i = cy + ri * Math.sin(s);
  const x2i = cx + ri * Math.cos(e), y2i = cy + ri * Math.sin(e);
  return [
    `M ${x1i} ${y1i}`, `L ${x1o} ${y1o}`,
    `A ${r} ${r} 0 0 1 ${x2o} ${y2o}`,
    `L ${x2i} ${y2i}`,
    `A ${ri} ${ri} 0 0 0 ${x1i} ${y1i}`, "Z",
  ].join(" ");
}

export function DirCompass({
  goodDirs,
  badDirs,
  size = 104,
}: {
  goodDirs?: DirRange[] | null;
  badDirs?: DirRange[] | null;
  size?: number;
}) {
  const cx = 80, cy = 80, outer = 70, inner = 28, labelR = 56;
  const colorFor = (center: number): string =>
    inAny(center, badDirs) ? "#ef4444" : inAny(center, goodDirs) ? "#0ea5e9" : "var(--line)";

  return (
    <svg viewBox="0 0 160 160" width={size} height={size} style={{ display: "block" }}>
      {DIRS.map((_, i) => (
        <path
          key={i}
          d={sectorPath(i, cx, cy, outer, inner)}
          fill={colorFor(i * 45)}
          stroke="var(--bg, #0f172a)"
          strokeWidth={2}
        />
      ))}
      <circle cx={cx} cy={cy} r={inner - 2} fill="var(--bg2, #1e293b)" />
      {DIRS.map((label, i) => {
        const angle = ((i * 45 - 90) * Math.PI) / 180;
        const x = cx + labelR * Math.cos(angle);
        const y = cy + labelR * Math.sin(angle);
        return (
          <text
            key={label}
            x={x} y={y + 4}
            textAnchor="middle"
            fontSize={i % 2 === 0 ? 12 : 10}
            fontWeight={i % 2 === 0 ? "600" : "400"}
            fill="var(--muted, #94a3b8)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
