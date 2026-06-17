import type { Rating } from "./scoring";

export const RATING_META: Record<
  Rating,
  { label: string; color: string; emoji: string }
> = {
  great: { label: "Skvělé", color: "var(--great)", emoji: "🔥" },
  good: { label: "Jezditelné", color: "var(--good)", emoji: "✅" },
  potential: { label: "Potenciál", color: "var(--potential)", emoji: "🤞" },
  none: { label: "Slabý vítr", color: "var(--none)", emoji: "·" },
};

export function confidenceLabel(c: number): string {
  if (c >= 0.85) return "vysoká";
  if (c >= 0.6) return "střední";
  return "nízká";
}

// Barva podle rychlosti větru (m/s): modrá → tyrkys → zelená → žlutá → oranžová → červená
export function windColor(ms: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [59, 130, 246]], // modrá
    [3, [6, 182, 212]], // tyrkysová
    [6, [34, 197, 94]], // zelená (jezditelné)
    [9, [234, 179, 8]], // žlutá
    [12, [249, 115, 22]], // oranžová
    [16, [239, 68, 68]], // červená
  ];
  if (ms <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (ms <= stops[i][0]) {
      const [v0, c0] = stops[i - 1];
      const [v1, c1] = stops[i];
      const t = (ms - v0) / (v1 - v0);
      return rgb([
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ]);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
