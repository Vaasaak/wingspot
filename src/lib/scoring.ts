// "Mozek" appky: z předpovědi spočítá, jak dobrý je který den na spotu.
// Bere v potaz: sílu větru (m/s), JAK DLOUHO fouká, SMĚR větru (bezpečnost),
// srážky, poryvovost a shodu ansámblu (spolehlivost). Výstupem je rating
// (barva) + qualityScore 0–1, do kterého pak App přidá vzdálenost.

import type { Spot, DirRange } from "../data/spots";
import type { Settings } from "./settings";
import type { SpotForecast } from "./weather";
import { RANK } from "./scoring-config";

export { RANK } from "./scoring-config";

export type Rating = "great" | "good" | "potential" | "none";

export interface HourEval {
  time: string;
  hour: number;
  windMs: number;
  gustMs: number;
  dirDeg: number | null;
  precip: number;
  rideable: boolean;
  dirOk: boolean; // směr je v pořádku (ne offshore a v goodDirs / neověřeno)
  offshore: boolean; // směr od břehu (nebezpečné)
  outlook: boolean;
  ensP25: number | null;
  ensP75: number | null;
}

export interface DayEval {
  date: string;
  rating: Rating;
  goodHours: number;
  windowStart: number | null;
  windowEnd: number | null;
  windowAvgMs: number;
  maxWindMs: number;
  maxGustMs: number;
  qualityScore: number; // 0–1
  confidence: number;
  upside: boolean;
  outlook: boolean;
  offshoreBlocked: boolean; // foukalo by dost, ale směr od břehu
  dirUnverified: boolean; // spot nemá vyplněnou orientaci
  precipMm: number; // srážky v jezditelném okně
  hours: HourEval[];
  sunrise: string;
  sunset: string;
}

export interface SpotEval {
  spotId: string;
  days: DayEval[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function inDirRange(d: number, r: DirRange): boolean {
  return r.from <= r.to ? d >= r.from && d <= r.to : d >= r.from || d <= r.to;
}
function inAnyDir(d: number, rs?: DirRange[]): boolean {
  return !!rs && rs.length > 0 && rs.some((r) => inDirRange(d, r));
}

function parseHour(time: string): number {
  return parseInt(time.slice(11, 13), 10);
}

// vzdálenostní penalizace: 1.0 na blízku → distFarMul na hraně dosahu
export function distancePenalty(distKm: number, maxKm: number): number {
  const t = clamp01(distKm / Math.max(1, maxKm));
  return RANK.distNearMul + (RANK.distFarMul - RANK.distNearMul) * t;
}

// nejlepší souvislé jezditelné okno (toleruje 1h výpadek)
function bestWindow(hours: HourEval[]): {
  count: number;
  start: number | null;
  end: number | null;
  avg: number;
} {
  let best = {
    count: 0,
    start: null as number | null,
    end: null as number | null,
    avg: 0,
  };
  let i = 0;
  while (i < hours.length) {
    if (!hours[i].rideable) {
      i++;
      continue;
    }
    let j = i;
    let lastRideable = i;
    let count = 0;
    let sum = 0;
    while (j < hours.length) {
      if (hours[j].rideable) {
        count++;
        sum += hours[j].windMs;
        lastRideable = j;
        j++;
      } else if (j + 1 < hours.length && hours[j + 1].rideable) {
        j++;
      } else {
        break;
      }
    }
    const avg = count > 0 ? sum / count : 0;
    if (count > best.count || (count === best.count && avg > best.avg)) {
      best = { count, start: hours[i].hour, end: hours[lastRideable].hour + 1, avg };
    }
    i = lastRideable + 1;
  }
  return best;
}

export function evaluateSpot(
  spot: Spot,
  fc: SpotForecast,
  s: Settings
): SpotEval {
  const dirUnverified = !(spot.goodDirs && spot.goodDirs.length > 0);

  // seskup hodiny podle data (jen v denním okně)
  const byDate: Record<string, HourEval[]> = {};
  for (let i = 0; i < fc.times.length; i++) {
    const time = fc.times[i];
    const hour = parseHour(time);
    if (hour < s.dayStartHour || hour >= s.dayEndHour) continue;
    const date = time.slice(0, 10);
    const windMs = fc.windMs[i] ?? 0;
    const dirDeg = fc.windDir[i] ?? null;
    const dirKnown = dirDeg !== null;
    const offshore = dirKnown && inAnyDir(dirDeg, spot.badDirs);
    // směr je OK, když: spot nemá goodDirs, nebo směr neznáme (výhled),
    // nebo směr padá do goodDirs. Offshore vždy blokuje.
    const goodDirOk =
      !spot.goodDirs || spot.goodDirs.length === 0 || !dirKnown
        ? true
        : inAnyDir(dirDeg, spot.goodDirs);
    const dirOk = !offshore && goodDirOk;
    const rideable = windMs >= s.minWindMs && dirOk;
    (byDate[date] = byDate[date] ?? []).push({
      time,
      hour,
      windMs,
      gustMs: fc.gustMs[i] ?? 0,
      dirDeg,
      precip: fc.precip[i] ?? 0,
      rideable,
      dirOk,
      offshore,
      outlook: fc.isOutlook[i] ?? false,
      ensP25: fc.ensP25[i] ?? null,
      ensP75: fc.ensP75[i] ?? null,
    });
  }

  const sunMap: Record<string, { sunrise: string; sunset: string }> = {};
  for (const d of fc.daily) sunMap[d.date] = d;

  const days: DayEval[] = Object.keys(byDate)
    .sort()
    .map((date) => {
      const hours = byDate[date];
      const win = bestWindow(hours);
      const maxWindMs = Math.max(0, ...hours.map((h) => h.windMs));
      const maxGustMs = Math.max(0, ...hours.map((h) => h.gustMs));
      const outlook = hours.every((h) => h.outlook);
      // foukalo by dost, ale směr od břehu (varování)
      const offshoreBlocked = hours.some(
        (h) => h.windMs >= s.minWindMs && h.offshore
      );

      // spolehlivost z rozptylu ansámblu
      let certain = 0;
      let withEns = 0;
      let upsideHours = 0;
      for (const h of hours) {
        if (h.ensP25 === null || h.ensP75 === null) continue;
        withEns++;
        if (h.ensP25 >= s.minWindMs || h.ensP75 < s.minWindMs) certain++;
        if (h.windMs < s.minWindMs && h.ensP75 >= s.minWindMs) upsideHours++;
      }
      const confidence = withEns > 0 ? certain / withEns : 0.5;
      const upside = upsideHours >= Math.max(2, s.minSessionHours - 1);

      const nearMissHours = hours.filter(
        (h) => h.windMs >= s.minWindMs - 0.5 && h.dirOk
      ).length;

      // hodnocení (barva)
      let rating: Rating;
      if (
        !outlook &&
        win.count >= Math.max(s.minSessionHours, 4) &&
        win.avg >= s.minWindMs + 2.5
      ) {
        rating = "great";
      } else if (!outlook && win.count >= s.minSessionHours) {
        rating = "good";
      } else if (win.count >= 1 || nearMissHours >= s.minSessionHours) {
        rating = "potential";
      } else {
        rating = "none";
      }

      // --- qualityScore 0–1 ---
      const winHours = hours.filter(
        (h) =>
          win.start !== null &&
          h.hour >= win.start &&
          h.hour < (win.end ?? 0)
      );
      const avgGust =
        winHours.length > 0
          ? winHours.reduce((a, h) => a + h.gustMs, 0) / winHours.length
          : 0;
      const precipMm = winHours.reduce((a, h) => a + h.precip, 0);

      const lengthScore = clamp01(win.count / RANK.idealHours);
      const strengthScore =
        win.count > 0
          ? clamp01((win.avg - s.minWindMs) / RANK.idealWindOver)
          : 0;
      let q =
        lengthScore * RANK.wLength +
        strengthScore * RANK.wStrength +
        confidence * RANK.wConfidence;
      // poryvovost
      const gustRatio = win.avg > 0 ? avgGust / win.avg : 1;
      if (gustRatio > RANK.gustyRatio) {
        q -= RANK.gustyPenalty * clamp01(gustRatio - RANK.gustyRatio);
      }
      // srážky
      q -= Math.min(RANK.precipMax, precipMm * RANK.precipPerMm);
      // Bez ověřeného směru nevíme, jestli není offshore — mírná penalizace.
      if (dirUnverified) q -= RANK.dirUnverifiedPenalty;
      const qualityScore = clamp01(q);

      return {
        date,
        rating,
        goodHours: win.count,
        windowStart: win.start,
        windowEnd: win.end,
        windowAvgMs: win.avg,
        maxWindMs,
        maxGustMs,
        qualityScore,
        confidence,
        upside,
        outlook,
        offshoreBlocked,
        dirUnverified,
        precipMm,
        hours,
        sunrise: sunMap[date]?.sunrise ?? "",
        sunset: sunMap[date]?.sunset ?? "",
      };
    });

  return { spotId: fc.spotId, days };
}

export const RATING_ORDER: Record<Rating, number> = {
  great: 3,
  good: 2,
  potential: 1,
  none: 0,
};
