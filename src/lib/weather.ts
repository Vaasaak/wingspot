// Stahování předpovědi z Open-Meteo (zdarma, bez registrace).
//
// PŘEDPOVĚĎ = VÁŽENÝ PRŮMĚR VÍCE MODELŮ (jako dělá Windguru).
// Pro každou hodinu vezmeme všechny modely, které tam mají data, a uděláme
// jejich vážený průměr – modely s vyšším rozlišením (přesnější) mají větší váhu.
// Tím se "samo" stane, že:
//   - prvních ~3 dny vedou modely 1–2 km (AROME, ICON-D2, HARMONIE),
//   - dál ICON-EU, pak ECMWF a GFS (na delší horizont).
//   - dny 17–22: "výhled" z ansámblu GEFS (jen orientačně).
//
// Pozn.: ALADIN (ČHMÚ, pro Česko nejpřesnější) by se sem hodil, ale Open-Meteo
//   ho nemá a ČHMÚ ho dává jen jako GRIB soubory bez CORS → z prohlížeče
//   nedostupné. Šlo by doplnit přes malý server/scheduled job (viz poznámky).
//
// SPOLEHLIVOST/POTENCIÁL: z rozptylu 31 variant ansámblu GEFS.
// O jezditelnosti rozhoduje VÍTR (ne nárazy). Náraz nikdy není menší než vítr.

import { SPOTS } from "../data/spots";

export interface SpotForecast {
  spotId: string;
  times: string[];
  windMs: number[];
  gustMs: number[];
  ensP25: (number | null)[];
  ensP75: (number | null)[];
  isOutlook: boolean[];
  daily: { date: string; sunrise: string; sunset: string }[];
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble";

// Modely + váhy (vyšší rozlišení = větší váha). Všechny pokrývají ČR.
const MODELS: { name: string; weight: number }[] = [
  { name: "meteofrance_arome_france_hd", weight: 5 }, // 1.3 km
  { name: "icon_d2", weight: 5 }, // 2.2 km
  { name: "dmi_harmonie_arome_europe", weight: 4 }, // 2 km
  { name: "knmi_harmonie_arome_europe", weight: 3 }, // 5 km
  { name: "icon_eu", weight: 2 }, // 7 km
  { name: "ecmwf_ifs025", weight: 1.5 }, // 9 km
  { name: "gfs_seamless", weight: 1 }, // 13 km
];
const DET_DAYS = 16;
const ENS_DAYS = 22;

function locParams(): string {
  const lats = SPOTS.map((s) => s.lat).join(",");
  const lons = SPOTS.map((s) => s.lon).join(",");
  return `&latitude=${lats}&longitude=${lons}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;
}

async function fetchArray(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open-Meteo nedostupné (" + res.status + ")");
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.round((sorted.length - 1) * p);
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

const CACHE_KEY = "wingspot-forecast-cache-v5";
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function fetchForecasts(
  force = false
): Promise<{ data: SpotForecast[]; fetchedAt: number }> {
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (Date.now() - c.fetchedAt < CACHE_TTL_MS) {
          return { data: c.data, fetchedAt: c.fetchedAt };
        }
      }
    } catch {
      // ignore
    }
  }

  const loc = locParams();
  const detUrl =
    `${FORECAST_URL}?hourly=wind_speed_10m,wind_gusts_10m` +
    `&daily=sunrise,sunset&models=${MODELS.map((m) => m.name).join(",")}` +
    `&forecast_days=${DET_DAYS}${loc}`;
  const ensUrl =
    `${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05` +
    `&forecast_days=${ENS_DAYS}${loc}`;

  const [det, ens] = await Promise.all([
    fetchArray(detUrl),
    fetchArray(ensUrl),
  ]);

  const data: SpotForecast[] = SPOTS.map((spot, i) => {
    const ensLoc = ens[i] ?? {};
    const ensH = ensLoc.hourly ?? {};
    const times: string[] = ensH.time ?? [];

    const memberKeys = Object.keys(ensH).filter(
      (k) => k === "wind_speed_10m" || k.startsWith("wind_speed_10m_member")
    );
    const memberArrays: number[][] = memberKeys.map((k) => ensH[k] ?? []);

    // přesné modely – pole větru a nárazů pro každý model
    const detLoc = det[i] ?? {};
    const detH = detLoc.hourly ?? {};
    const detTimes: string[] = detH.time ?? [];
    const modelWind = MODELS.map((m) => detH[`wind_speed_10m_${m.name}`] ?? []);
    const modelGust = MODELS.map((m) => detH[`wind_gusts_10m_${m.name}`] ?? []);
    const detIdx: Record<string, number> = {};
    detTimes.forEach((t, idx) => (detIdx[t] = idx));

    const windMs: number[] = [];
    const gustMs: number[] = [];
    const ensP25: (number | null)[] = [];
    const ensP75: (number | null)[] = [];
    const isOutlook: boolean[] = [];

    for (let h = 0; h < times.length; h++) {
      // ansámbl – percentily
      const members: number[] = [];
      for (const arr of memberArrays) {
        const v = arr[h];
        if (typeof v === "number") members.push(v);
      }
      members.sort((a, b) => a - b);
      const mean = members.length ? avg(members) : null;
      ensP25.push(members.length ? percentile(members, 0.25) : null);
      ensP75.push(members.length ? percentile(members, 0.75) : null);

      const di = detIdx[times[h]];
      let wind: number | null = null;
      let gust = 0;
      let outlook = true;

      if (di !== undefined) {
        let wSum = 0;
        let wWt = 0;
        let gSum = 0;
        let gWt = 0;
        for (let k = 0; k < MODELS.length; k++) {
          const wt = MODELS[k].weight;
          const v = modelWind[k][di];
          if (typeof v === "number") {
            wSum += v * wt;
            wWt += wt;
          }
          const gv = modelGust[k][di];
          if (typeof gv === "number") {
            gSum += gv * wt;
            gWt += wt;
          }
        }
        if (wWt > 0) {
          wind = wSum / wWt;
          gust = Math.max(gWt > 0 ? gSum / gWt : 0, wind);
          outlook = false;
        }
      }

      // výhled z ansámblu (nejdál)
      if (wind === null) {
        wind = mean ?? 0;
        gust = wind;
        outlook = true;
      }

      windMs.push(wind);
      gustMs.push(gust);
      isOutlook.push(outlook);
    }

    const dDaily = detLoc.daily ?? {};
    const daily = (dDaily.time ?? []).map((date: string, di: number) => ({
      date,
      sunrise: dDaily.sunrise?.[di] ?? "",
      sunset: dDaily.sunset?.[di] ?? "",
    }));

    return { spotId: spot.id, times, windMs, gustMs, ensP25, ensP75, isOutlook, daily };
  });

  const fetchedAt = Date.now();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt, data }));
  } catch {
    // cache se nemusí povést – nevadí
  }
  return { data, fetchedAt };
}
