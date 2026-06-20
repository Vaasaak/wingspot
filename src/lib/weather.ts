// Stahování předpovědi z Open-Meteo (zdarma, bez registrace).
//
// PŘEDPOVĚĎ = VÁŽENÝ PRŮMĚR VÍCE MODELŮ (jako dělá Windguru). Modely s vyšším
// rozlišením (přesnější) mají větší váhu. Prvních ~3 dny vedou jemné modely
// (AROME, ICON-D2, HARMONIE), dál ICON-EU, ECMWF a GFS; dny 17–22 jsou „výhled"
// z ansámblu GEFS. Bereme: vítr, nárazy, SMĚR větru a SRÁŽKY.
//
// Architektura:
//  1. localStorage (30 min) — nejrychlejší, per-prohlížeč
//  2. Netlify funkce + Supabase cache (1 hod) — sdílená mezi uživateli
//  3. Přímé Open-Meteo (fallback pro lokální vývoj / výpadek funkce)

import type { Spot } from "../data/spots";

export interface SpotForecast {
  spotId: string;
  times: string[];
  windMs: number[];
  gustMs: number[];
  windDir: (number | null)[]; // stupně 0–360, odkud vítr vane (null = neznámý/výhled)
  precip: number[]; // srážky mm/h
  ensP25: (number | null)[];
  ensP75: (number | null)[];
  isOutlook: boolean[];
  daily: { date: string; sunrise: string; sunset: string }[];
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble";

const MODELS: { name: string; weight: number }[] = [
  { name: "meteofrance_arome_france_hd", weight: 5 },
  { name: "icon_d2", weight: 5 },
  { name: "dmi_harmonie_arome_europe", weight: 4 },
  { name: "knmi_harmonie_arome_europe", weight: 3 },
  { name: "icon_eu", weight: 2 },
  { name: "ecmwf_ifs025", weight: 1.5 },
  { name: "gfs_seamless", weight: 1 },
];
const DET_DAYS = 16;
const ENS_DAYS = 22;

const CACHE_KEY = "wingspot-forecast-cache-v6";
const CACHE_TTL_MS = 30 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.round((sorted.length - 1) * p);
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchArray(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open-Meteo nedostupné (" + res.status + ")");
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

// ── Přímý batch fetch z Open-Meteo (fallback) ─────────────────────────────

async function fetchDirectBatch(spots: Spot[]): Promise<SpotForecast[]> {
  const lats = spots.map((s) => s.lat).join(",");
  const lons = spots.map((s) => s.lon).join(",");
  const loc = `&latitude=${lats}&longitude=${lons}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;

  const detUrl =
    `${FORECAST_URL}?hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation` +
    `&daily=sunrise,sunset&models=${MODELS.map((m) => m.name).join(",")}&forecast_days=${DET_DAYS}${loc}`;
  const ensUrl =
    `${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05&forecast_days=${ENS_DAYS}${loc}`;

  const [det, ens] = await Promise.all([fetchArray(detUrl), fetchArray(ensUrl)]);

  return spots.map((spot, i) => processSpotData(spot.id, det[i] ?? {}, ens[i] ?? {}));
}

// ── Zpracování dat pro jeden spot ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processSpotData(spotId: string, detLoc: any, ensLoc: any): SpotForecast {
  const ensH = ensLoc.hourly ?? {};
  const times: string[] = ensH.time ?? [];

  const memberKeys = Object.keys(ensH).filter(
    (k) => k === "wind_speed_10m" || k.startsWith("wind_speed_10m_member")
  );
  const memberArrays: number[][] = memberKeys.map((k) => ensH[k] ?? []);

  const detH = detLoc.hourly ?? {};
  const detTimes: string[] = detH.time ?? [];
  const mWind = MODELS.map((m) => detH[`wind_speed_10m_${m.name}`] ?? []);
  const mGust = MODELS.map((m) => detH[`wind_gusts_10m_${m.name}`] ?? []);
  const mDir  = MODELS.map((m) => detH[`wind_direction_10m_${m.name}`] ?? []);
  const mPrec = MODELS.map((m) => detH[`precipitation_${m.name}`] ?? []);
  const detIdx: Record<string, number> = {};
  detTimes.forEach((t, idx) => (detIdx[t] = idx));

  const windMs: number[] = [];
  const gustMs: number[] = [];
  const windDir: (number | null)[] = [];
  const precip: number[] = [];
  const ensP25: (number | null)[] = [];
  const ensP75: (number | null)[] = [];
  const isOutlook: boolean[] = [];

  for (let h = 0; h < times.length; h++) {
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
    let gust = 0, dir: number | null = null, precipVal = 0;
    let outlook = true;

    if (di !== undefined) {
      let wSum = 0, wWt = 0, gSum = 0, gWt = 0;
      let dx = 0, dy = 0, dWt = 0, pSum = 0, pWt = 0;
      for (let k = 0; k < MODELS.length; k++) {
        const wt = MODELS[k].weight;
        const v = mWind[k][di];
        if (typeof v === "number") { wSum += v * wt; wWt += wt; }
        const gv = mGust[k][di];
        if (typeof gv === "number") { gSum += gv * wt; gWt += wt; }
        const dv = mDir[k][di];
        if (typeof dv === "number") {
          dx += Math.cos((dv * Math.PI) / 180) * wt;
          dy += Math.sin((dv * Math.PI) / 180) * wt;
          dWt += wt;
        }
        const pv = mPrec[k][di];
        if (typeof pv === "number") { pSum += pv * wt; pWt += wt; }
      }
      if (wWt > 0) {
        wind = wSum / wWt;
        gust = Math.max(gWt > 0 ? gSum / gWt : 0, wind);
        if (dWt > 0) dir = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        precipVal = pWt > 0 ? pSum / pWt : 0;
        outlook = false;
      }
    }

    if (wind === null) {
      wind = mean ?? 0;
      gust = wind;
      dir = null;
      precipVal = 0;
      outlook = true;
    }

    windMs.push(wind);
    gustMs.push(gust);
    windDir.push(dir);
    precip.push(precipVal);
    isOutlook.push(outlook);
  }

  const dDaily = detLoc.daily ?? {};
  const daily = (dDaily.time ?? []).map((date: string, di: number) => ({
    date,
    sunrise: dDaily.sunrise?.[di] ?? "",
    sunset: dDaily.sunset?.[di] ?? "",
  }));

  return { spotId, times, windMs, gustMs, windDir, precip, ensP25, ensP75, isOutlook, daily };
}

// ── Per-spot fetch přes Netlify funkci (sdílená Supabase cache) ───────────

async function fetchViaFunction(spot: Spot): Promise<SpotForecast> {
  const url = `/.netlify/functions/forecast?spotId=${encodeURIComponent(spot.id)}&lat=${spot.lat}&lon=${spot.lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`forecast function ${res.status}`);
  return res.json();
}

// ── Hlavní export ──────────────────────────────────────────────────────────

export async function fetchForecasts(
  spots: Spot[],
  force = false
): Promise<{ data: SpotForecast[]; fetchedAt: number }> {
  const sig = spots.map((s) => s.id).join(",");

  // Vrstva 1: localStorage (30 min)
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (Date.now() - c.fetchedAt < CACHE_TTL_MS && c.sig === sig) {
          return { data: c.data, fetchedAt: c.fetchedAt };
        }
      }
    } catch { /* ignore */ }
  }

  // Vrstva 2: Netlify funkce (Supabase cache 1 hod)
  let data: SpotForecast[];
  try {
    data = await Promise.all(spots.map(fetchViaFunction));
  } catch {
    // Vrstva 3: přímé Open-Meteo (fallback pro lokální dev / výpadek funkce)
    data = await fetchDirectBatch(spots);
  }

  const fetchedAt = Date.now();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt, sig, data }));
  } catch { /* ignore */ }
  return { data, fetchedAt };
}
