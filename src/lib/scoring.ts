// "Mozek" appky: z předpovědi spočítá, jak dobrý je který den na spotu.
// Bere v potaz: sílu větru (m/s), JAK DLOUHO fouká (jezditelné okno)
// a shodu ansámblu (spolehlivost / potenciál na zlepšení).

import type { Settings } from "./settings";
import type { SpotForecast } from "./weather";

export type Rating = "great" | "good" | "potential" | "none";

export interface HourEval {
  time: string;
  hour: number;
  windMs: number;
  gustMs: number;
  rideable: boolean;
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
  score: number;
  confidence: number; // 0..1 shoda ansámblu
  upside: boolean; // potenciál, že se předpověď zlepší
  outlook: boolean; // den z výhledu (žádný přesný model)
  hours: HourEval[];
  sunrise: string;
  sunset: string;
}

export interface SpotEval {
  spotId: string;
  days: DayEval[];
}

function parseHour(time: string): number {
  return parseInt(time.slice(11, 13), 10);
}

// Najde nejlepší "jezditelné okno" – souvislý úsek, kde toleruje max 1h výpadek.
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
        j++; // jednohodinový výpadek tolerujeme
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

export function evaluateSpot(fc: SpotForecast, s: Settings): SpotEval {
  // seskup hodiny podle data (jen v denním okně)
  const byDate: Record<string, HourEval[]> = {};
  for (let i = 0; i < fc.times.length; i++) {
    const time = fc.times[i];
    const hour = parseHour(time);
    if (hour < s.dayStartHour || hour >= s.dayEndHour) continue;
    const date = time.slice(0, 10);
    const windMs = fc.windMs[i] ?? 0;
    (byDate[date] = byDate[date] ?? []).push({
      time,
      hour,
      windMs,
      gustMs: fc.gustMs[i] ?? 0,
      rideable: windMs >= s.minWindMs,
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

      // SPOLEHLIVOST z rozptylu ansámblu:
      // hodina je "jistá", když i pesimistická čtvrtina fouká (jistě vítr),
      // nebo když ani optimistická čtvrtina nefouká (jistě klid).
      // Když práh leží uvnitř rozptylu → nejistota.
      let certain = 0;
      let withEns = 0;
      let upsideHours = 0;
      for (const h of hours) {
        if (h.ensP25 === null || h.ensP75 === null) continue;
        withEns++;
        const surelyWindy = h.ensP25 >= s.minWindMs;
        const surelyCalm = h.ensP75 < s.minWindMs;
        if (surelyWindy || surelyCalm) certain++;
        // potenciál: teď to nejede, ale optimistická čtvrtina ukazuje vítr
        if (h.windMs < s.minWindMs && h.ensP75 >= s.minWindMs) upsideHours++;
      }
      const confidence = withEns > 0 ? certain / withEns : 0.5;
      const upside = upsideHours >= Math.max(2, s.minSessionHours - 1);

      // HODNOCENÍ
      let rating: Rating;
      if (
        !outlook &&
        win.count >= Math.max(s.minSessionHours, 4) &&
        win.avg >= s.minWindMs + 2.5
      ) {
        rating = "great";
      } else if (!outlook && win.count >= s.minSessionHours) {
        rating = "good";
      } else if (maxWindMs >= s.minWindMs - 0.5) {
        // "potenciál" = vítr se aspoň přiblíží prahu (vrchol ≥ práh−0,5 m/s)
        rating = "potential";
      } else {
        rating = "none";
      }

      const score =
        win.count * Math.max(win.avg, s.minWindMs) +
        maxGustMs * 0.2 +
        confidence * 2 -
        (outlook ? 1 : 0);

      return {
        date,
        rating,
        goodHours: win.count,
        windowStart: win.start,
        windowEnd: win.end,
        windowAvgMs: win.avg,
        maxWindMs,
        maxGustMs,
        score,
        confidence,
        upside,
        outlook,
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
